"use client";
import { useRef, useEffect, useState } from "react";
import { ttsBlobUrl } from "@/services/api";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "mel" | "butler" | "agent";
  name: string;
  text: string;
  color: string;
  timestamp: Date;
  /** Если true — сообщение было надиктовано голосом */
  isVoice?: boolean;
  /** URL медиа (картинка/видео) */
  mediaUrl?: string;
  mediaType?: "image" | "video";
}

/** Стабильные высоты волновых столбиков (без рандома при каждом рендере) */
const WAVE_BARS = Array.from({ length: 20 }, (_, i) => {
  const h = 4 + Math.abs(Math.sin(i * 0.7)) * 12 + (i % 3) * 2;
  return Math.round(h);
});

let _ttsAudio: HTMLAudioElement | null = null;
/** Озвучка через сервер (Yandex SpeechKit) с анти-эхо событиями и фолбэком */
function ttsVoice(sender?: string): string {
  if (sender === "agent") return "ermil"; // голос агента — следующим шагом
  if (typeof window === "undefined") return "ermil";
  return localStorage.getItem("jinntell_assistant_voice") || "ermil";
}

async function playServerTTS(text: string, voice: string = "ermil", emotion: string = "neutral") {
  try { _ttsAudio?.pause(); } catch {}
  _ttsAudio = null;
  window.dispatchEvent(new Event("jinntell_tts_start"));
  const url = await ttsBlobUrl(text, voice, emotion);
  if (!url) {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "ru-RU";
      utt.onend = () => window.dispatchEvent(new Event("jinntell_tts_end"));
      utt.onerror = () => window.dispatchEvent(new Event("jinntell_tts_end"));
      synth.speak(utt);
    } else {
      window.dispatchEvent(new Event("jinntell_tts_end"));
    }
    return;
  }
  const audio = new Audio(url);
  _ttsAudio = audio;
  const done = () => { window.dispatchEvent(new Event("jinntell_tts_end")); try { URL.revokeObjectURL(url); } catch {} };
  audio.onended = done;
  audio.onerror = done;
  audio.play().catch(() => done());
}

/** Голосовой пузырь в стиле Telegram — волновая дорожка + play */
function VoiceBubble({ text, accent }: { text: string; accent?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handlePlay = () => {
    if (playing) {
      // Стоп
      window.speechSynthesis?.cancel();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPlaying(false);
      setProgress(0);
      return;
    }
    setPlaying(true);
    setProgress(0);

    // Анимация прогресса
    const duration = Math.max(2000, text.length * 80); // примерная длительность
    const step = 100 / (duration / 50);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 100;
        }
        return p + step;
      });
    }, 50);

    // Web Speech API
    if ("speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "ru-RU";
      utt.rate = 1;
      utt.onend = () => {
        setPlaying(false);
        setProgress(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      utt.onerror = () => {
        setPlaying(false);
        setProgress(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      window.speechSynthesis.speak(utt);
    } else {
      setTimeout(() => {
        setPlaying(false);
        setProgress(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }, 3000);
    }
  };

  // Длительность текста (примерная)
  const durationSec = Math.max(2, Math.round(text.length * 0.08));
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <button
      onClick={handlePlay}
      className="flex items-center gap-2.5 w-full min-w-[180px]"
    >
      {/* Play / Pause кнопка */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
        style={{
          background: accent ? "var(--accent)" : "var(--bg-glass-hover)",
          color: accent ? "var(--bg-deep)" : "var(--accent)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          {playing ? (
            <>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </>
          ) : (
            <polygon points="6 3 20 12 6 21 6 3" />
          )}
        </svg>
      </div>

      {/* Волновая дорожка */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[2px] h-5">
          {WAVE_BARS.map((h, i) => {
            const filled = (i / WAVE_BARS.length) * 100 <= progress;
            return (
              <div
                key={i}
                className="rounded-full transition-all duration-100"
                style={{
                  width: "2.5px",
                  height: `${h}px`,
                  background: filled && playing
                    ? "var(--accent)"
                    : accent
                      ? "rgba(212, 168, 67, 0.35)"
                      : "var(--text-muted)",
                  opacity: filled && playing ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-left" style={{ color: "var(--text-muted)" }}>
          {playing ? "воспроизведение..." : timeStr}
        </span>
      </div>
    </button>
  );
}

/** Контекстное меню пузыря (long press на мобиле, правый клик на десктопе) */
function BubbleContextMenu({
  x, y, msg, onClose,
}: {
  x: number; y: number; msg: ChatMessage; onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("click", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("click", handler); document.removeEventListener("touchstart", handler); };
  }, [onClose]);

  const items: { icon: string; label: string; action: () => void }[] = [];

  if (msg.text) {
    items.push({
      icon: "📋",
      label: "Копировать текст",
      action: () => { navigator.clipboard?.writeText(msg.text).catch(() => {}); onClose(); },
    });
  }

  if (msg.mediaUrl) {
    items.push({
      icon: "💾",
      label: "Сохранить медиа",
      action: () => {
        const a = document.createElement("a");
        a.href = msg.mediaUrl!;
        a.download = msg.mediaType === "video" ? "video.mp4" : "photo.jpg";
        a.click();
        onClose();
      },
    });
  }

  if (items.length === 0) return null;

  return (
    <div
      className="fixed rounded-xl py-1.5 px-1 animate-fade-in"
      style={{
        left: x + "px",
        top: y + "px",
        transform: "translate(-50%, -100%)",
        marginTop: "-8px",
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        zIndex: 100,
        minWidth: "160px",
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full text-left transition-all"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Пузырь сообщения */
function MessageBubble({ msg, userSide }: { msg: ChatMessage; userSide: boolean }) {
  const [showAsVoice, setShowAsVoice] = useState(!!msg.isVoice);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const touchPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Long press для мобиле
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressRef.current = setTimeout(() => {
      setCtxMenu({ x: touchPosRef.current.x, y: touchPosRef.current.y });
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };
  const handleTouchMove = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  // Правый клик для десктопа
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className="rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed select-text"
        style={{
          background: userSide ? "var(--bubble-user)" : "var(--bubble-agent)",
          border: "1px solid var(--bubble-border)",
          color: "var(--text-primary)",
          borderBottomLeftRadius: userSide ? "6px" : undefined,
          borderBottomRightRadius: !userSide ? "6px" : undefined,
          WebkitUserSelect: "text",
          userSelect: "text",
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {/* Медиа (картинка / видео) */}
        {msg.mediaUrl && msg.mediaType === "image" && (
          <img
            src={msg.mediaUrl}
            alt=""
            className="rounded-lg mb-2 max-w-full"
            style={{ maxHeight: "240px", objectFit: "cover" }}
          />
        )}
        {msg.mediaUrl && msg.mediaType === "video" && (
          <video
            src={msg.mediaUrl}
            controls
            className="rounded-lg mb-2 max-w-full"
            style={{ maxHeight: "240px" }}
          />
        )}

        {/* Режим голосового сообщения (Telegram) */}
        {showAsVoice && msg.text ? (
          <VoiceBubble text={msg.text} accent={!userSide} />
        ) : (
          <>{msg.text}</>
        )}

        {/* Кнопки: прослушать + голосовое/текст */}
        {msg.text && (
          <div className="mt-1.5 flex items-center justify-end gap-2.5">
            {/* Прослушать */}
            <button
              className="opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: "var(--text-muted)" }}
              title="Прослушать"
              onClick={() => { playServerTTS(msg.text, ttsVoice(msg.sender)); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </button>

            {/* Переключатель: голосовое ↔ текст */}
            {showAsVoice ? (
              <button
                className="opacity-40 hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                title="Показать текст"
                onClick={() => setShowAsVoice(false)}
              >
                <span style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1 }}>Aа</span>
              </button>
            ) : (
              <button
                className="opacity-40 hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                title="Показать как голосовое"
                onClick={() => setShowAsVoice(true)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Контекстное меню (long press / right click) */}
      {ctxMenu && (
        <BubbleContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          msg={msg}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

/** Центральная область чата */
export default function ChatArea({
  messages,
  isTyping,
  typingName = "Джим",
  topPad = 80,
  bottomPad = 130,
  autoSpeak = false,
  agentInfo,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  typingName?: string;
  topPad?: number;
  bottomPad?: number;
  /** Автоозвучка ответов агентов (голосовой режим) */
  autoSpeak?: boolean;
  agentInfo?: { id: number; name: string; color: string; greeting?: string; tts_voice_id?: string; tts_emotion?: string } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const lastMsgCount = useRef(0);
  const prevMsgCountRef = useRef(messages.length);
  const programmaticScrollRef = useRef(false);

  // Автоскролл — только когда пользователь сам отправил сообщение
  useEffect(() => {
    const newMsgAdded = messages.length > lastMsgCount.current;
    if (newMsgAdded) {
      const lastMsg = messages[messages.length - 1];
      const isUserMsg = lastMsg?.sender === "user";
      if (isUserMsg) {
        // Пользователь отправил — всегда скроллим вниз
        userScrolledUp.current = false;
        programmaticScrollRef.current = true;
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
          setTimeout(() => { programmaticScrollRef.current = false; }, 100);
        });
      } else if (!userScrolledUp.current) {
        // Агент ответил — скроллим только если пользователь уже внизу
        programmaticScrollRef.current = true;
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
          setTimeout(() => { programmaticScrollRef.current = false; }, 100);
        });
      }
    }
    lastMsgCount.current = messages.length;
  }, [messages]);

  // Detect user scrolling up (ignore programmatic scrolls)
  const handleScroll = () => {
    if (programmaticScrollRef.current) return;
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
  };

  // TTS — автоозвучка новых сообщений агентов
  useEffect(() => {
    if (!autoSpeak) { prevMsgCountRef.current = messages.length; return; }
    if (messages.length <= prevMsgCountRef.current) { prevMsgCountRef.current = messages.length; return; }

    // Новые сообщения с последнего известного
    const newMsgs = messages.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = messages.length;

    // Озвучиваем только ответы агентов / дворецкого
    for (const msg of newMsgs) {
      if (msg.sender !== "user" && msg.text) {
        const v = msg.sender === "agent" ? (agentInfo?.tts_voice_id || "ermil") : ttsVoice(msg.sender);
        const emo = msg.sender === "agent" ? (agentInfo?.tts_emotion || "neutral") : "neutral";
        playServerTTS(msg.text, v, emo);
      }
    }
  }, [messages, autoSpeak]);

  const isUser = (s: string) => s === "user";

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ zIndex: 10, paddingTop: topPad + "px", paddingBottom: (bottomPad + 16) + "px" }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        {/* Сообщения прижаты к низу (как Telegram) */}
        <div className="flex flex-col justify-end items-center min-h-full w-full">
          <div className="flex flex-col gap-3 w-full max-w-[620px] mx-auto py-4 pb-6 px-4">
            {messages.map((msg) => {
              const userSide = isUser(msg.sender);

              return (
                <div
                  key={msg.id}
                  className={`flex ${userSide ? "justify-start" : "justify-end"} animate-fade-in`}
                >
                  {/* Аватар пользователя (слева) */}
                  {userSide && (
                    <div
                      className="w-7 h-7 rounded-full shrink-0 mr-2 mt-1 flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: "rgba(100, 200, 255, 0.12)",
                        border: "1.5px solid rgba(100, 200, 255, 0.3)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Я
                    </div>
                  )}

                  <div className={`flex flex-col ${userSide ? "items-start" : "items-end"}`} style={{ maxWidth: "70%" }}>
                    {/* Имя агента (справа) */}
                    {!userSide && (
                      <span className="text-[10px] mb-0.5 mr-1" style={{ color: msg.color || "var(--accent)" }}>
                        {msg.name}
                      </span>
                    )}

                    {/* Пузырь */}
                    <MessageBubble msg={msg} userSide={userSide} />
                  </div>

                  {/* Аватар агента (справа) */}
                  {!userSide && (
                    <div
                      className="w-7 h-7 rounded-full shrink-0 ml-2 mt-1 flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: `${msg.color || "var(--accent)"}1F`,
                        border: `1.5px solid ${msg.color || "var(--accent)"}55`,
                        color: msg.color || "var(--accent)",
                      }}
                    >
                      {msg.name[0]}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Индикатор «печатает...» — справа (агент) */}
            {isTyping && (
              <div className="flex justify-end animate-fade-in">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] mb-0.5 mr-1" style={{ color: agentInfo?.color || "var(--accent)" }}>{typingName}</span>
                  <div
                    className="rounded-2xl px-3.5 py-2 text-sm"
                    style={{
                      background: "var(--bubble-agent)",
                      border: "1px solid var(--bubble-border)",
                      color: "var(--text-muted)",
                      borderBottomRightRadius: "6px",
                    }}
                  >
                    <span className="inline-flex gap-1 items-center">
                      <span className="typing-dot" style={{ animationDelay: "0ms" }}>•</span>
                      <span className="typing-dot" style={{ animationDelay: "150ms" }}>•</span>
                      <span className="typing-dot" style={{ animationDelay: "300ms" }}>•</span>
                    </span>
                  </div>
                </div>
                <div
                  className="w-7 h-7 rounded-full shrink-0 ml-2 mt-1 flex items-center justify-center text-[9px] font-bold"
                  style={{
                    background: agentInfo ? `${agentInfo.color}1F` : "rgba(212, 168, 67, 0.12)",
                    border: `1.5px solid ${agentInfo?.color || "rgba(212, 168, 67, 0.3)"}55`,
                    color: agentInfo?.color || "var(--accent)",
                  }}
                >
                  {typingName[0]}
                </div>
              </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
