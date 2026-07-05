"use client";
import RecSlider from "./RecSlider";
import { useState, useRef, useEffect, useCallback } from "react";

/** Состояния микрофона */
type MicState = "off" | "on" | "always" | "mute";

/** Порог длинного нажатия (ms) */
const LONG_PRESS_MS = 600;

/** Нижняя панель — voice-first UX */
export default function BottomBar({
  onSettingsClick,
  onContactsClick,
  onAgentsClick,
  onRecordNote,
  onSendMessage,
  onAttachMedia,
  onHeightChange,
  onMicStateChange,
  assistantName = "Джим",
}: {
  onSettingsClick: () => void;
  onContactsClick: () => void;
  onAgentsClick: () => void;
  onRecordNote?: (auto?: boolean) => void;
  onSendMessage: (text: string) => void;
  onAttachMedia: (file: File) => void;
  onHeightChange?: (h: number) => void;
  onMicStateChange?: (active: boolean) => void;
  assistantName?: string;
}) {
  const [micState, setMicState] = useState<MicState>("off");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  // Сообщаем родителю свою высоту
  useEffect(() => {
    if (!barRef.current || !onHeightChange) return;
    const ro = new ResizeObserver(() => {
      if (barRef.current) onHeightChange(barRef.current.offsetHeight);
    });
    ro.observe(barRef.current);
    onHeightChange(barRef.current.offsetHeight);
    return () => ro.disconnect();
  }, [onHeightChange, showTextInput]);

  // Фокус на поле ввода при открытии
  useEffect(() => {
    if (showTextInput) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showTextInput]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text);
    setInputText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // === Web Speech API распознавание речи ===
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const onSendRef = useRef(onSendMessage);
  const micStateRef = useRef(micState);
  const startRecognitionRef = useRef<(() => void) | undefined>(undefined);
  const ttsSpeakingRef = useRef(false);

  useEffect(() => { onSendRef.current = onSendMessage; }, [onSendMessage]);
  useEffect(() => {
    micStateRef.current = micState;
    onMicStateChange?.(micState === "on" || micState === "always");
  }, [micState, onMicStateChange]);

  const startRecognition = useCallback(() => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { console.warn("[voice] Web Speech API не поддерживается"); return; }

    if (recognitionRef.current) { recognitionRef.current.abort(); }

    const recognition = new (SR as unknown as { new(): SpeechRecognition })();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (ttsSpeakingRef.current || window.speechSynthesis?.speaking) return;
      let interim = "";
      let final = "";
      // Только НОВЫЕ результаты (resultIndex) — иначе continuous пере-отправляет всю накопленную фразу
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setVoiceText(interim);
      if (final.trim()) {
        onSendRef.current(final.trim());
        setVoiceText("");
      }
    };

    recognition.onerror = (event) => {
      console.warn("[voice] Error:", event.error);
      if (event.error !== "aborted") { setMicState("off"); }
    };

    recognition.onend = () => {
      if (ttsSpeakingRef.current) return;
      if (micStateRef.current === "always") {
        setTimeout(() => startRecognitionRef.current?.(), 300);
      } else {
        setMicState("off");
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { startRecognitionRef.current = startRecognition; }, [startRecognition]);

  // Анти-эхо: глушим распознавание, пока помощник озвучивается (TTS)
  useEffect(() => {
    const onTtsStart = () => { ttsSpeakingRef.current = true; recognitionRef.current?.abort(); };
    const onTtsEnd = () => {
      ttsSpeakingRef.current = false;
      if (micStateRef.current === "always") setTimeout(() => startRecognitionRef.current?.(), 300);
    };
    window.addEventListener("jinntell_tts_start", onTtsStart);
    window.addEventListener("jinntell_tts_end", onTtsEnd);
    return () => {
      window.removeEventListener("jinntell_tts_start", onTtsStart);
      window.removeEventListener("jinntell_tts_end", onTtsEnd);
    };
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
    setVoiceText("");
  }, []);

  // === Wake-word: активация по имени ("Джим, ...") ===
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const awaitingCommandRef = useRef(false);
  const assistantNameRef = useRef(assistantName);
  const startWakeRef = useRef<(() => void) | undefined>(undefined);
  const wakeRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeSessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLastStart = useRef(0);
  const wakeFailCount = useRef(0);
  useEffect(() => { assistantNameRef.current = assistantName; }, [assistantName]);

  // opt-in из localStorage + реакция на изменение настройки
  useEffect(() => {
    const read = () => setWakeEnabled(localStorage.getItem("jinntell_wake_enabled") === "1");
    read();
    window.addEventListener("storage", read);
    window.addEventListener("jinntell_wake_change", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("jinntell_wake_change", read);
    };
  }, []);

  // Поиск имени в тексте -> индекс конца совпадения (или -1)
  const matchName = (text: string): number => {
    const name = (assistantNameRef.current || "Джим").toLowerCase().trim();
    if (!name) return -1;
    const i = text.toLowerCase().indexOf(name);
    return i < 0 ? -1 : i + name.length;
  };

  const startWake = useCallback(() => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    if (wakeRecognitionRef.current) return;
    if (localStorage.getItem("jinntell_wake_enabled") !== "1") return;
    if (micStateRef.current !== "off") return;

    const r = new (SR as unknown as { new(): SpeechRecognition })();
    r.lang = "ru-RU";
    r.continuous = true;
    r.interimResults = false;
    wakeLastStart.current = Date.now();

    r.onresult = (event: SpeechRecognitionEvent) => {
      if (window.speechSynthesis?.speaking) return;
      wakeFailCount.current = 0;
      const last = event.results[event.results.length - 1];
      if (!last.isFinal) return;
      const text = last[0].transcript.trim();
      if (!text) return;
      if (awaitingCommandRef.current) {
        awaitingCommandRef.current = false;
        onSendRef.current(text);
        return;
      }
      const end = matchName(text);
      if (end >= 0) {
        const rest = text.slice(end).replace(/^[\s,.!?:;-]+/, "").trim();
        if (rest) {
          onSendRef.current(rest);
        } else {
          // Обращение без команды — Джим откликается и ждёт продолжения
          onSendRef.current(assistantNameRef.current || "Джим");
          awaitingCommandRef.current = true;
        }
      }
    };

    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setWakeEnabled(false);
      }
    };

    r.onend = () => {
      wakeRecognitionRef.current = null;
      if (wakeSessionTimer.current) { clearTimeout(wakeSessionTimer.current); wakeSessionTimer.current = null; }
      if (localStorage.getItem("jinntell_wake_enabled") !== "1" || micStateRef.current !== "off") return;
      // Защита от тайтового цикла рестартов (краш вкладки)
      const elapsed = Date.now() - wakeLastStart.current;
      wakeFailCount.current = elapsed < 1000 ? wakeFailCount.current + 1 : 0;
      const delay = wakeFailCount.current >= 5 ? 5000 : 500;
      if (wakeFailCount.current >= 5) wakeFailCount.current = 0;
      wakeRestartTimer.current = setTimeout(() => startWakeRef.current?.(), delay);
    };

    try {
      r.start();
      wakeRecognitionRef.current = r;
      // Периодический сброс сессии — чтобы Chrome не копил память и не падал
      wakeSessionTimer.current = setTimeout(() => {
        try { r.stop(); } catch { /* noop */ }
      }, 50000);
    } catch {
      wakeRecognitionRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { startWakeRef.current = startWake; }, [startWake]);

  const stopWake = useCallback(() => {
    awaitingCommandRef.current = false;
    if (wakeRestartTimer.current) { clearTimeout(wakeRestartTimer.current); wakeRestartTimer.current = null; }
    if (wakeSessionTimer.current) { clearTimeout(wakeSessionTimer.current); wakeSessionTimer.current = null; }
    const r = wakeRecognitionRef.current;
    if (r) {
      r.onend = null;
      r.onerror = null;
      r.onresult = null;
      try { r.abort(); } catch { /* noop */ }
      wakeRecognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (wakeEnabled && micState === "off") {
      startWake();
    } else {
      stopWake();
    }
    return () => stopWake();
  }, [wakeEnabled, micState, startWake, stopWake]);

  // === Микрофон: тап = вкл/выкл распознавание голоса (надёжно на мобиле — один onClick, без гонки mouse/touch) ===
  const handleMicToggle = useCallback(() => {
    if (micStateRef.current === "off") { setMicState("on"); startRecognition(); }
    else { setMicState("off"); stopRecognition(); }
  }, [startRecognition, stopRecognition]);

  // Визуал микрофона
  const micVisual = {
    off:    { bg: "var(--bg-glass)", border: "var(--bg-glass-border)", color: "var(--accent)", shadow: "none", label: "Rec" },
    on:     { bg: "var(--accent)", border: "var(--accent-bright)", color: "var(--bg-deep)", shadow: "0 0 25px var(--accent-glow-strong)", label: "Говорите" },
    always: { bg: "var(--accent)", border: "var(--accent-bright)", color: "var(--bg-deep)", shadow: "0 0 30px var(--accent-glow-strong)", label: "Всегда вкл" },
    mute:   { bg: "var(--danger)", border: "var(--danger)", color: "#fff", shadow: "0 0 20px rgba(231,76,60,0.5)", label: "MUTE" },
  }[micState];

  // Закрыть меню медиа при клике вне
  useEffect(() => {
    if (!showMediaMenu) return;
    const close = () => setShowMediaMenu(false);
    const timer = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", close); };
  }, [showMediaMenu]);

  return (
    <div
      ref={barRef}
      className="fixed bottom-0 left-0 right-0 flex flex-col"
      style={{
        background: "var(--bar-bg)",
        borderTop: "1px solid var(--bar-border)",
        zIndex: 40,
      }}
    >
      {/* Поле ввода текста — появляется по кнопке ⌨️ */}
      {showTextInput && (
        <div className="px-5 pt-2.5 pb-1.5 flex justify-center animate-fade-in">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 w-full"
            style={{
              maxWidth: "600px",
              background: "var(--bg-glass)",
              border: "1px solid var(--bg-glass-border)",
            }}
          >
            {/* Скрепка + меню вложений */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMediaMenu(!showMediaMenu); }}
                className="w-8 h-8 flex items-center justify-center transition-all hover:scale-110 active:scale-95 rounded-full"
                style={{ color: "var(--text-muted)" }}
                title="Вложить"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              {showMediaMenu && (
                <div className="absolute bottom-11 left-0 rounded-xl py-2 px-1 flex flex-col gap-0.5 animate-fade-in" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", minWidth: 170, zIndex: 20 }}>
                  <button onClick={() => { setShowMediaMenu(false); onRecordNote?.(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}>
                    <span>🎥</span><span>Записать видео</span>
                  </button>
                  <button onClick={() => { setShowMediaMenu(false); fileRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}>
                    <span>📎</span><span>Фото / видео / файл</span>
                  </button>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Напишите сообщение..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--text-primary)", caretColor: "var(--accent)" }}
            />

            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110 active:scale-95"
              style={{
                background: inputText.trim() ? "var(--accent)" : "var(--bg-glass-border)",
                color: inputText.trim() ? "var(--bg-deep)" : "var(--text-muted)",
                cursor: inputText.trim() ? "pointer" : "default",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Скрытый file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { onAttachMedia(file); e.target.value = ""; }
        }}
      />

      {/* 5 кнопок управления */}
      <div className="flex items-center justify-center gap-2 px-3 py-2">

        {/* Rec-ползунок: тап=голос, сдвиг→видео, тройной тап→строка ввода */}
        <RecSlider
          micActive={micState === "on" || micState === "always"}
          onVoice={handleMicToggle}
          onVideo={() => onRecordNote?.(false)}
          onVoiceHold={() => { if (micStateRef.current === "off") { setMicState("on"); startRecognition(); } }}
          onVideoHold={() => onRecordNote?.(true)}
          onText={() => setShowTextInput((v) => !v)}
        />

      </div>

      {/* Подсказка состояния микрофона (только MUTE) */}
      {micState === "mute" && (
        <div className="flex flex-col items-center gap-1 pb-1">
          <span
            className="text-[9px] uppercase tracking-wider px-3 py-0.5 rounded-full animate-fade-in"
            style={{
              color: micState === "mute" ? "var(--danger)" : "var(--accent)",
              background: micState === "mute" ? "rgba(231,76,60,0.1)" : "rgba(212,168,67,0.1)",
            }}
          >
            {micVisual.label}
          </span>
        </div>
      )}
    </div>
  );
}
