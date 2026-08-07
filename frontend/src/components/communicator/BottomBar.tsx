"use client";
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
  onCall,
  canCall = false,
  onAssistantCommand,
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
  onCall?: () => void;
  canCall?: boolean;
  onAssistantCommand?: (text: string) => void;
  assistantName?: string;
}) {
  const [micState, setMicState] = useState<MicState>("off");
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Сообщаем родителю свою высоту
  useEffect(() => {
    if (!barRef.current || !onHeightChange) return;
    const ro = new ResizeObserver(() => {
      if (barRef.current) onHeightChange(barRef.current.offsetHeight);
    });
    ro.observe(barRef.current);
    onHeightChange(barRef.current.offsetHeight);
    return () => ro.disconnect();
  }, [onHeightChange]);

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
  const [, setVoiceText] = useState("");
  const onSendRef = useRef(onSendMessage);
  const micStateRef = useRef(micState);
  const startRecognitionRef = useRef<(() => void) | undefined>(undefined);
  const ttsSpeakingRef = useRef(false);

  useEffect(() => { onSendRef.current = onSendMessage; }, [onSendMessage]);
  // Антидубль голоса: одна и та же фраза не уходит повторно в течение окна
  const lastVoiceRef = useRef<{ text: string; t: number }>({ text: "", t: 0 });
  const voiceFullRef = useRef("");
  const voiceSentRef = useRef("");
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendVoice = useCallback((raw: string) => {
    const t = (raw || "").trim();
    if (!t) return;
    const now = Date.now();
    if (t === lastVoiceRef.current.text && now - lastVoiceRef.current.t < 2500) return;
    lastVoiceRef.current = { text: t, t: now };
    onSendRef.current(t);
  }, []);
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
      // Только НОВЫЕ результаты (resultIndex) — в continuous-режиме список копится всю сессию.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          const seg = r[0].transcript.trim();
          if (seg) voiceFullRef.current = (voiceFullRef.current ? voiceFullRef.current + " " : "") + seg;
        } else {
          interim += r[0].transcript;
        }
      }
      setVoiceText((voiceFullRef.current + " " + interim).trim());
      // Дебаунс: после паузы отправляем накопленную фразу ЦЕЛИКОМ и очищаем буфер (без дублей).
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = setTimeout(() => {
        const phrase = voiceFullRef.current.trim();
        voiceFullRef.current = "";
        if (phrase) { setVoiceText(""); sendVoice(phrase); }
      }, 900);
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

    voiceSentRef.current = "";
    voiceFullRef.current = "";
    if (voiceTimerRef.current) { clearTimeout(voiceTimerRef.current); voiceTimerRef.current = null; }
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

  // === Wake-word: активация по имени ("Джим, ...") ===
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [wakeAwaiting, setWakeAwaiting] = useState(false);
  const awaitingCommandRef = useRef(false);
  const wakeCmdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setWakeAwaiting(false);
        if (wakeCmdTimeout.current) { clearTimeout(wakeCmdTimeout.current); wakeCmdTimeout.current = null; }
        sendVoice(text);
        return;
      }
      const end = matchName(text);
      if (end >= 0) {
        const rest = text.slice(end).replace(/^[\s,.!?:;-]+/, "").trim();
        if (rest) {
          sendVoice(rest);
        } else {
          // Обращение без команды — откликаемся «Да?» и ждём команду (без мусора в чате)
          awaitingCommandRef.current = true;
          setWakeAwaiting(true);
          try { const u = new SpeechSynthesisUtterance("Да?"); u.lang = "ru-RU"; u.rate = 1.1; window.speechSynthesis?.speak(u); } catch { /* noop */ }
          if (wakeCmdTimeout.current) clearTimeout(wakeCmdTimeout.current);
          wakeCmdTimeout.current = setTimeout(() => { awaitingCommandRef.current = false; setWakeAwaiting(false); }, 8000);
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
    setWakeAwaiting(false);
    if (wakeCmdTimeout.current) { clearTimeout(wakeCmdTimeout.current); wakeCmdTimeout.current = null; }
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

  // Закрыть меню медиа при клике вне
  useEffect(() => {
    if (!showMediaMenu) return;
    const close = () => setShowMediaMenu(false);
    const timer = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", close); };
  }, [showMediaMenu]);

  // === ✍️ Набор голосом: распознавание речи → в ПОЛЕ ВВОДА (потом отправляешь ▶; прослушивание = голос помощника слушателя) ===
  const [dictating, setDictating] = useState(false);
  const dictRef = useRef<SpeechRecognition | null>(null);
  const startDictation = useCallback(() => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    const r = new (SR as unknown as { new(): SpeechRecognition })();
    r.lang = "ru-RU"; r.continuous = true; r.interimResults = true;
    const base = inputText ? inputText.trim() + " " : "";
    r.onresult = (event: SpeechRecognitionEvent) => {
      let full = base, interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) full += res[0].transcript + " "; else interim += res[0].transcript;
      }
      setInputText((full + interim).replace(/\s+/g, " ").trimStart());
    };
    r.onend = () => { setDictating(false); dictRef.current = null; };
    r.onerror = () => { setDictating(false); };
    try { r.start(); dictRef.current = r; setDictating(true); } catch { /* noop */ }
  }, [inputText]);
  const stopDictation = useCallback(() => {
    const r = dictRef.current; if (r) { try { r.stop(); } catch { /* noop */ } }
    setDictating(false);
  }, []);

  // === 🎙 Голосовое сообщение (реальный звук): зажать-записать-отпустить. Запись стартует на нажатии — без гонки. ===
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecsRef = useRef(0);
  const recCancelRef = useRef(false);
  const recStartedRef = useRef(false);
  const relReleasedRef = useRef(false);
  const stopRec = useCallback((send: boolean) => {
    recCancelRef.current = !send;
    const rec = audioRecRef.current;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* noop */ } }
  }, []);
  const startRec = useCallback(async () => {
    relReleasedRef.current = false; recStartedRef.current = false;
    // ловим отпускание СРАЗУ (до async getUserMedia) — иначе на телефоне релиз теряется
    const onUp = () => { window.removeEventListener("pointerup", onUp); relReleasedRef.current = true; if (recStartedRef.current) stopRec(true); };
    window.addEventListener("pointerup", onUp);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (relReleasedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; } // отпустил до старта → просто тап, не пишем
      audioStreamRef.current = stream;
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      let mime = ""; for (const t of types) { if (MediaRecorder.isTypeSupported?.(t)) { mime = t; break; } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      audioChunksRef.current = []; recCancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); audioStreamRef.current = null;
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setRecording(false); setRecSecs(0); recSecsRef.current = 0; recStartedRef.current = false;
        if (recCancelRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: (rec.mimeType || "audio/webm").split(";")[0] });
        if (blob.size < 1200) return; // слишком коротко/пусто
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : (rec.mimeType || "").includes("ogg") ? "ogg" : "webm";
        onAttachMedia(new File([blob], `voice.${ext}`, { type: (rec.mimeType || "audio/webm").split(";")[0] }));
      };
      audioRecRef.current = rec; rec.start(); recStartedRef.current = true;
      setRecording(true); setRecSecs(0); recSecsRef.current = 0;
      recTimerRef.current = setInterval(() => { recSecsRef.current += 1; setRecSecs(recSecsRef.current); }, 1000);
    } catch { setRecording(false); window.removeEventListener("pointerup", onUp); }
  }, [onAttachMedia, stopRec]);

  return (
    <div
      ref={barRef}
      className="fixed bottom-0 left-0 right-0 flex flex-col"
      style={{
        background: "transparent",
        borderTop: "none",
        zIndex: 40,
      }}
    >
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

      {/* Индикатор wake-word: жду обращения по имени */}
      {wakeEnabled && micState === "off" && !dictating && (
        <div className="flex justify-center pt-1.5 -mb-1">
          <span
            className="text-[10px] px-2.5 py-0.5 rounded-full animate-fade-in flex items-center gap-1"
            style={wakeAwaiting
              ? { color: "var(--bg-deep)", background: "var(--accent)", boxShadow: "0 0 14px var(--accent-glow-strong)" }
              : { color: "var(--text-muted)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
          >
            {wakeAwaiting ? "🎙 Слушаю…" : `👂 жду «${assistantName}»`}
          </span>
        </div>
      )}

      {/* Основная панель: 📎 · строка · (🎤 или ▶) · 📞 */}
      <div className="px-3 pt-2 pb-3 flex justify-center">
        <div className="flex items-center gap-1.5 rounded-2xl px-3 py-2 w-full" style={{ maxWidth: 600, background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
          {recording ? (
            <>
              <button onPointerDown={() => stopRec(false)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base" style={{ color: "var(--danger)" }} title="Отменить">✕</button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--danger)" }} />
                <span className="text-sm tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</span>
                <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>отпустите — отправить</span>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v4" /></svg>
              </div>
            </>
          ) : (
            <>
              {/* 📎 вложения */}
              <div className="relative shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setShowMediaMenu(!showMediaMenu); }} className="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:scale-110" style={{ color: "var(--text-muted)" }} title="Вложить">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                </button>
                {showMediaMenu && (
                  <div className="absolute bottom-11 left-0 rounded-xl py-2 px-1 flex flex-col gap-0.5 animate-fade-in" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", minWidth: 180, zIndex: 20 }}>
                    <button onClick={() => { setShowMediaMenu(false); fileRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}><span>📎</span><span>Фото / видео / файл</span></button>
                  </div>
                )}
              </div>

              {/* Поле ввода — всегда видно */}
              <input ref={inputRef} type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={dictating ? "🎙 говорите…" : "Сообщение…"} className="flex-1 bg-transparent outline-none text-sm min-w-0"
                style={{ color: "var(--text-primary)", caretColor: "var(--accent)" }} />

              {/* Правая группа: ▶ отправить (если текст) · ✍️ набор голосом (в текст) · 🎙 голосовое (мой голос) */}
              {inputText.trim() && !dictating ? (
                <button onClick={handleSend} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110" style={{ background: "var(--accent)", color: "var(--bg-deep)" }} title="Отправить">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
                </button>
              ) : (
                <>
                  {/* ✍️ Набор голосом → в текст (тап — начать/остановить) */}
                  <button onClick={dictating ? stopDictation : startDictation} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110" style={{ background: dictating ? "var(--accent)" : "var(--bg-glass-hover)", color: dictating ? "var(--bg-deep)" : "var(--accent)" }} title="Набор голосом (в текст)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="7" width="20" height="12" rx="2" /><path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01M6 15h12" /></svg>
                  </button>
                  {/* 🎙 Голосовое — реальный голос (зажать-записать-отпустить) */}
                  {!dictating && (
                    <button onPointerDown={() => startRec()} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110 select-none" style={{ background: "var(--bg-glass-hover)", color: "var(--accent)", touchAction: "none" }} title="Голосовое — зажми и говори (твой голос)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v4" /></svg>
                    </button>
                  )}
                </>
              )}

              {/* Звонок — только для человека */}
              {canCall && onCall && (
                <button onClick={onCall} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110" style={{ color: "#2ecc71" }} title="Звонок">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
