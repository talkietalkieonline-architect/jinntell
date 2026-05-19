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
  onSendMessage,
  onAttachMedia,
  onHeightChange,
  onMicStateChange,
}: {
  onSettingsClick: () => void;
  onContactsClick: () => void;
  onAgentsClick: () => void;
  onSendMessage: (text: string) => void;
  onAttachMedia: (file: File) => void;
  onHeightChange?: (h: number) => void;
  onMicStateChange?: (active: boolean) => void;
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
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceText(transcript);
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal && transcript.trim()) {
        onSendRef.current(transcript.trim());
        setVoiceText("");
      }
    };

    recognition.onerror = (event) => {
      console.warn("[voice] Error:", event.error);
      if (event.error !== "aborted") { setMicState("off"); }
    };

    recognition.onend = () => {
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

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
    setVoiceText((prev) => {
      if (prev.trim()) { onSendRef.current(prev.trim()); }
      return "";
    });
  }, []);

  // === Микрофон: короткое / длинное нажатие ===
  const handleMicDown = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (micStateRef.current === "off") {
        setMicState("always");
        startRecognition();
      } else if (micStateRef.current === "on" || micStateRef.current === "always") {
        setMicState("mute");
        stopRecognition();
      }
    }, LONG_PRESS_MS);
  }, [startRecognition, stopRecognition]);

  const handleMicUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (isLongPress.current) return;
    // Короткое нажатие: тоггл on/off
    if (micStateRef.current === "off") {
      setMicState("on");
      startRecognition();
    } else {
      setMicState("off");
      stopRecognition();
    }
  }, [startRecognition, stopRecognition]);

  // Визуал микрофона
  const micVisual = {
    off:    { bg: "var(--bg-glass)", border: "var(--bg-glass-border)", color: "var(--accent)", shadow: "none", label: "Микрофон" },
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
            {/* Скрепка */}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-8 h-8 flex items-center justify-center shrink-0 transition-all hover:scale-110 active:scale-95 rounded-full"
              style={{ color: "var(--text-muted)" }}
              title="Прикрепить"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

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

        {/* Настройки */}
        <button
          onClick={onSettingsClick}
          className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all hover:scale-105"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">Настройки</span>
        </button>

        {/* Переключатель ввода ⌨️ (вместо Mute) */}
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all hover:scale-105"
          style={{ color: showTextInput ? "var(--accent)" : "var(--text-secondary)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {showTextInput ? (
              <>
                {/* Клавиатура активна */}
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <line x1="6" y1="8" x2="6" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="8" x2="10" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="14" y1="8" x2="14" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="8" x2="18" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="6" y1="12" x2="6" y2="12.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="12" x2="10" y2="12.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="14" y1="12" x2="14" y2="12.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="12" x2="18" y2="12.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="16" x2="16" y2="16" strokeWidth="2" strokeLinecap="round" />
              </>
            ) : (
              <>
                {/* Клавиатура неактивна */}
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <line x1="6" y1="8" x2="6" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="8" x2="10" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="14" y1="8" x2="14" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="8" x2="18" y2="8.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="16" x2="16" y2="16" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </svg>
          <span className="text-[9px] uppercase tracking-wider">
            {showTextInput ? "Текст" : "Текст"}
          </span>
        </button>

        {/* Кнопка "+" медиа (слева от микрофона) */}
        <div className="relative mx-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMediaMenu(!showMediaMenu); }}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              background: "var(--bg-glass)",
              border: "1.5px solid var(--bg-glass-border)",
              color: "var(--text-secondary)",
            }}
            title="Прикрепить медиа"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* Выпадающее меню медиа */}
          {showMediaMenu && (
            <div
              className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-xl py-2 px-1 flex flex-col gap-0.5 animate-fade-in"
              style={{
                background: "var(--panel-bg)",
                border: "1px solid var(--panel-border)",
                backdropFilter: "blur(20px)",
                minWidth: "140px",
              }}
            >
              {[
                { icon: "📷", label: "Фото", accept: "image/*" },
                { icon: "🎥", label: "Видео", accept: "video/*" },
                { icon: "📎", label: "Файл", accept: "*/*" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setShowMediaMenu(false);
                    const inp = document.createElement("input");
                    inp.type = "file";
                    inp.accept = item.accept;
                    inp.onchange = () => {
                      const f = inp.files?.[0];
                      if (f) onAttachMedia(f);
                    };
                    inp.click();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all hover:bg-[var(--bg-glass-hover)] text-left"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  setShowMediaMenu(false);
                  const url = prompt("Вставьте ссылку:");
                  if (url?.trim()) onSendMessage(url.trim());
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all hover:bg-[var(--bg-glass-hover)] text-left"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>🔗</span>
                <span>Ссылка</span>
              </button>
            </div>
          )}
        </div>

        {/* Микрофон — центральная кнопка (короткое/длинное нажатие) */}
        <button
          onMouseDown={handleMicDown}
          onMouseUp={handleMicUp}
          onMouseLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
          onTouchStart={handleMicDown}
          onTouchEnd={handleMicUp}
          className="rounded-full w-14 h-14 flex items-center justify-center transition-all hover:scale-110 mx-1 select-none"
          style={{
            background: micVisual.bg,
            border: `2px solid ${micVisual.border}`,
            boxShadow: micVisual.shadow,
            color: micVisual.color,
            animation: micState === "always" ? "pulse 2s ease-in-out infinite" : undefined,
          }}
        >
          {micState === "mute" ? (
            // MUTE — перечёркнутый микрофон
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <line x1="4" y1="2" x2="20" y2="22" strokeWidth="2.5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Мои контакты */}
        <button
          onClick={onContactsClick}
          className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all hover:scale-105"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">Контакты</span>
        </button>

        {/* Мои агенты */}
        <button
          onClick={onAgentsClick}
          className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all hover:scale-105"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="8" r="5" />
            <path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2" />
            <circle cx="12" cy="8" r="2" fill="currentColor" opacity="0.3" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">Агенты</span>
        </button>
      </div>

      {/* Подсказка состояния микрофона + распознанный текст */}
      {micState !== "off" && (
        <div className="flex flex-col items-center gap-1 pb-1">
          {voiceText && (micState === "on" || micState === "always") && (
            <div
              className="text-[12px] px-4 py-1 rounded-full max-w-[80%] truncate animate-fade-in"
              style={{
                background: "rgba(212,168,67,0.08)",
                color: "var(--text-secondary)",
                border: "1px solid rgba(212,168,67,0.15)",
              }}
            >
              {voiceText}
            </div>
          )}
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
