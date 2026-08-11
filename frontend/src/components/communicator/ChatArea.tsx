"use client";
import { useRef, useEffect, useState, useMemo, type ReactNode } from "react";
import { ttsBlobUrl, mediaUrl, deleteMessage } from "@/services/api";

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
  mediaType?: "image" | "video" | "note" | "voice";
  /** Реплика из другой комнаты (контекст) — показываем приглушённо */
  context?: boolean;
}

/** Стабильные высоты волновых столбиков (без рандома при каждом рендере) */
const WAVE_BARS = Array.from({ length: 20 }, (_, i) => {
  const h = 4 + Math.abs(Math.sin(i * 0.7)) * 12 + (i % 3) * 2;
  return Math.round(h);
});

let _ttsAudio: HTMLAudioElement | null = null;
let _playingMsgId: string | number | null = null;  // какое сообщение сейчас озвучивается (для кнопки Стоп у облачка)
const SPEEDS = [1, 1.5, 2];
function getPlaySpeed(): number { try { return parseFloat(localStorage.getItem("jinntell_play_speed") || "1") || 1; } catch { return 1; } }
function setPlaySpeed(v: number) { try { localStorage.setItem("jinntell_play_speed", String(v)); } catch { /* noop */ } }
/** Озвучка через сервер (Yandex SpeechKit) с анти-эхо событиями и фолбэком */
function ttsVoice(sender?: string): string {
  if (sender === "agent") return "ermil"; // голос агента — следующим шагом
  if (typeof window === "undefined") return "ermil";
  return localStorage.getItem("jinntell_assistant_voice") || "ermil";
}

async function playServerTTS(text: string, voice: string = "ermil", emotion: string = "neutral", id: string | number | null = null) {
  try { _ttsAudio?.pause(); } catch {}
  _ttsAudio = null;
  _playingMsgId = id;
  window.dispatchEvent(new Event("jinntell_tts_start"));
  const url = await ttsBlobUrl(text, voice, emotion);
  if (!url) {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "ru-RU";
      utt.rate = getPlaySpeed();
      utt.onend = () => window.dispatchEvent(new Event("jinntell_tts_end"));
      utt.onerror = () => window.dispatchEvent(new Event("jinntell_tts_end"));
      synth.speak(utt);
    } else {
      window.dispatchEvent(new Event("jinntell_tts_end"));
    }
    return;
  }
  const audio = new Audio(url);
  audio.playbackRate = getPlaySpeed();
  _ttsAudio = audio;
  const done = () => { window.dispatchEvent(new Event("jinntell_tts_end")); try { URL.revokeObjectURL(url); } catch {} };
  audio.onended = done;
  audio.onerror = done;
  audio.play().catch(() => done());
}

/** Остановить любую озвучку: серверный TTS + веб-синтез. Генерацию текста НЕ трогает. */
function stopAllTTS() {
  try { _ttsAudio?.pause(); } catch {}
  _ttsAudio = null;
  try { window.speechSynthesis?.cancel(); } catch {}
  window.dispatchEvent(new Event("jinntell_tts_end"));
}

/** Голосовое сообщение (реальный голос отправителя): play/pause + волна + длительность. */
function VoiceMessage({ src }: { src: string; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(getPlaySpeed());
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) { a.playbackRate = speed; a.play().catch(() => {}); } else a.pause(); };
  const cycleSpeed = () => { const nx = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; setSpeed(nx); if (audioRef.current) audioRef.current.playbackRate = nx; setPlaySpeed(nx); };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const BARS = 26;
  const progress = dur > 0 ? cur / dur : 0;
  return (
    <div className="flex items-center gap-2 py-0.5 mb-1" style={{ minWidth: 190 }}>
      <button onClick={toggle} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex items-center gap-[2px] flex-1" style={{ height: 24 }}>
        {Array.from({ length: BARS }).map((_, i) => {
          const h = 5 + (Math.sin(i * 1.3) * 0.5 + 0.5) * 14;
          const active = i / BARS <= progress;
          return <span key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: active ? "var(--accent)" : "var(--bg-glass-border)", transition: "background 0.1s" }} />;
        })}
      </div>
      <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{fmt(playing || cur ? cur : dur)}</span>
      <button onClick={cycleSpeed} title="Скорость" className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-md" style={{ color: "var(--accent)", background: "var(--bg-glass-hover)" }}>{speed}×</button>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={(e) => { setPlaying(true); e.currentTarget.playbackRate = speed; }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const a = e.currentTarget; if (a.duration === Infinity || isNaN(a.duration)) { a.currentTime = 1e101; } else setDur(a.duration || 0); }}
        onDurationChange={(e) => { const a = e.currentTarget; if (isFinite(a.duration)) { setDur(a.duration); if (a.currentTime > 1e6) a.currentTime = 0; } }}
      />
    </div>
  );
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
  x, y, msg, canDelete, onForward, onClose,
}: {
  x: number; y: number; msg: ChatMessage; canDelete?: boolean; onForward?: (m: ChatMessage) => void; onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("click", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("click", handler); document.removeEventListener("touchstart", handler); };
  }, [onClose]);

  const items: { icon: string; label: string; action: () => void; danger?: boolean }[] = [];

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

  if ((msg.text || msg.mediaUrl) && onForward) {
    items.push({
      icon: "↪️",
      label: "Переслать",
      action: () => { onForward(msg); onClose(); },
    });
  }

  if (canDelete) {
    items.push({
      icon: "🗑",
      label: "Удалить",
      danger: true,
      action: () => {
        if (/^\d+$/.test(msg.id)) deleteMessage(Number(msg.id)).catch(() => {});
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
          style={{ color: item.danger ? "var(--danger)" : "var(--text-secondary)" }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Пузырь сообщения */
function MessageBubble({ msg, userSide, privateChat, highlight, activeHighlight, onForward }: { msg: ChatMessage; userSide: boolean; privateChat?: boolean; highlight?: boolean; activeHighlight?: boolean; onForward?: (m: ChatMessage) => void }) {
  const [showAsVoice, setShowAsVoice] = useState(!!msg.isVoice);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; type: string } | null>(null);
  // Озвучивается ли ИМЕННО это сообщение (кнопка «прослушать» → «стоп»)
  const [ttsPlaying, setTtsPlaying] = useState(false);
  useEffect(() => {
    const onStart = () => setTtsPlaying(_playingMsgId === msg.id);
    const onEnd = () => setTtsPlaying(false);
    window.addEventListener("jinntell_tts_start", onStart);
    window.addEventListener("jinntell_tts_end", onEnd);
    return () => { window.removeEventListener("jinntell_tts_start", onStart); window.removeEventListener("jinntell_tts_end", onEnd); };
  }, [msg.id]);
  const toggleTTS = () => { if (ttsPlaying) { stopAllTTS(); } else { playServerTTS(msg.text, ttsVoice(msg.sender), "neutral", msg.id); } };
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
        className="rounded-2xl px-3.5 py-2.5 leading-relaxed select-text whitespace-pre-wrap break-words"
        style={{
          background: userSide ? "var(--bubble-user)" : "var(--bubble-agent)",
          border: "1px solid var(--bubble-border)",
          color: "var(--text-primary)",
          fontSize: "0.875rem",
          opacity: msg.context ? 0.7 : 1,
          borderBottomLeftRadius: userSide ? "6px" : undefined,
          borderBottomRightRadius: !userSide ? "6px" : undefined,
          boxShadow: activeHighlight ? "0 0 0 2px var(--accent)" : highlight ? "0 0 0 1px var(--accent-bright)" : undefined,
          WebkitUserSelect: "text",
          userSelect: "text",
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {msg.context && (
          <div className="text-[9px] mb-1 italic" style={{ color: "var(--text-muted)" }}>💬 из комнаты</div>
        )}
        {/* Медиа (картинка / видео / видео-заметка) */}
        {msg.mediaUrl && (() => {
          const raw = msg.mediaUrl as string;
          const src = raw.startsWith("blob:") || raw.startsWith("data:") ? raw : mediaUrl(raw);
          if (msg.mediaType === "voice") return <VoiceMessage src={src} mine={!userSide} />;
          if (msg.mediaType === "image") return <img src={src} alt="" className="rounded-lg mb-2 max-w-full cursor-zoom-in" style={{ maxHeight: "240px", objectFit: "cover" }} onClick={() => setLightbox({ src, type: "image" })} />;
          if (msg.mediaType === "note") return <video src={src} controls autoPlay muted loop playsInline className="mb-2" style={{ width: 220, height: 220, objectFit: "cover", borderRadius: 24 }} onLoadedMetadata={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} onPlay={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} onClick={() => setLightbox({ src, type: "video" })} />;
          if (msg.mediaType === "video") return <video src={src} controls playsInline className="rounded-lg mb-2 max-w-full" style={{ maxHeight: "240px" }} onLoadedMetadata={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} onPlay={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} />;
          return null;
        })()}

        {/* Режим голосового сообщения (Telegram) */}
        {showAsVoice && msg.text ? (
          <VoiceBubble text={msg.text} accent={!userSide} />
        ) : (
          <>{msg.text}</>
        )}

        {/* Кнопки: прослушать + голосовое/текст */}
        {msg.text && (
          <div className="mt-1.5 flex items-center justify-end gap-2.5">
            {/* Прослушать ↔ Стоп (у самого облачка) */}
            <button
              className="hover:opacity-100 transition-opacity"
              style={{ color: ttsPlaying ? "var(--accent)" : "var(--text-muted)", opacity: ttsPlaying ? 1 : 0.4 }}
              title={ttsPlaying ? "Стоп" : "Прослушать"}
              onClick={toggleTTS}
            >
              {ttsPlaying ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
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
          canDelete={msg.sender === "user" || !!privateChat}
          onForward={onForward}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {lightbox && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 200, background: "rgba(0,0,0,0.9)" }} onClick={() => setLightbox(null)}>
          {lightbox.type === "image" ? (
            <img src={lightbox.src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : (
            <video src={lightbox.src} controls autoPlay playsInline onLoadedMetadata={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} onPlay={(e) => { e.currentTarget.playbackRate = getPlaySpeed(); }} style={{ maxWidth: "100%", maxHeight: "100%" }} />
          )}
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg" style={{ background: "rgba(255,255,255,0.15)" }}>✕</button>
        </div>
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
  assistantPhoto = null,
  agentPhoto = null,
  agentInfo,
  headerSlot = null,
  topAlign = false,
  privateChat = false,
  searchOpen = false,
  onCloseSearch,
  onForward,
  channelPosts,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  typingName?: string;
  topPad?: number;
  bottomPad?: number;
  /** Автоозвучка ответов агентов (голосовой режим) */
  autoSpeak?: boolean;
  assistantPhoto?: string | null;
  agentPhoto?: string | null;
  agentInfo?: { id: number; name: string; color: string; greeting?: string; tts_voice_id?: string; tts_emotion?: string } | null;
  headerSlot?: ReactNode;
  topAlign?: boolean;
  privateChat?: boolean;
  searchOpen?: boolean;
  onCloseSearch?: () => void;
  onForward?: (m: ChatMessage) => void;
  channelPosts?: { id: number; title: string; body?: string | null; url?: string | null }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const lastMsgCount = useRef(0);
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    const stop = () => stopAllTTS();
    window.addEventListener("jinntell_stop", stop);
    return () => window.removeEventListener("jinntell_stop", stop);
  }, []);
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
        playServerTTS(msg.text, v, emo, msg.id);
      }
    }
  }, [messages, autoSpeak]);

  const isUser = (s: string) => s === "user";

  // Поиск по чату
  const [q, setQ] = useState("");
  const [mi, setMi] = useState(0);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [] as string[];
    return messages.filter((m) => (m.text || "").toLowerCase().includes(t)).map((m) => m.id);
  }, [q, messages]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  useEffect(() => { setMi(matches.length ? matches.length - 1 : 0); }, [q]);
  useEffect(() => { if (!searchOpen) setQ(""); }, [searchOpen]);
  useEffect(() => {
    if (!searchOpen || !matches.length) return;
    const id = matches[Math.min(mi, matches.length - 1)];
    const el = scrollRef.current?.querySelector(`[data-mid="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mi, matches, searchOpen]);
  const activeId = matches.length ? matches[Math.min(mi, matches.length - 1)] : null;
  const go = (d: number) => setMi((i) => { const n = matches.length; return n ? (i + d + n) % n : 0; });

  return (
    <>
    {searchOpen && (
      <div className="absolute left-0 right-0 flex justify-center px-4" style={{ top: topPad + 6, zIndex: 30 }}>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 w-full max-w-[620px]" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)", flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по чату" className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--text-primary)", caretColor: "var(--accent)" }}
            onKeyDown={(e) => { if (e.key === "Enter") go(e.shiftKey ? 1 : -1); if (e.key === "Escape") onCloseSearch?.(); }} />
          <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{matches.length ? `${Math.min(mi, matches.length - 1) + 1}/${matches.length}` : (q.trim() ? "0" : "")}</span>
          <button onClick={() => go(-1)} disabled={!matches.length} className="text-[13px] px-1 disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>↑</button>
          <button onClick={() => go(1)} disabled={!matches.length} className="text-[13px] px-1 disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>↓</button>
          <button onClick={() => onCloseSearch?.()} className="text-xs px-1" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>
    )}
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
        <div className={`flex flex-col items-center min-h-full w-full ${topAlign ? "justify-start" : "justify-end"}`}>
          <div className="flex flex-col gap-3 w-full max-w-[620px] mx-auto py-4 pb-6 px-4">
            {headerSlot}
            {channelPosts && channelPosts.length > 0 && (
              <div className="rounded-2xl p-3 mb-1" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--text-muted)" }}>📰 Канал · последние новости</div>
                <div className="flex flex-col gap-1.5">
                  {channelPosts.slice(0, 12).map((p) => (
                    <a key={p.id} href={p.url || undefined} target="_blank" rel="noreferrer" className="block rounded-lg p-2 transition-all hover:opacity-90" style={{ background: "var(--bg-glass-hover)" }}>
                      <div className="text-[13px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{p.title}</div>
                      {p.body && <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{p.body}</div>}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => {
              const userSide = isUser(msg.sender);

              return (
                <div
                  key={msg.id}
                  data-mid={msg.id}
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
                    <MessageBubble msg={msg} userSide={userSide} privateChat={privateChat} highlight={matchSet.has(msg.id)} activeHighlight={msg.id === activeId} onForward={onForward} />
                  </div>

                  {/* Аватар агента/помощника (справа) */}
                  {!userSide && (
                    <div
                      className="w-7 h-7 rounded-full shrink-0 ml-2 mt-1 overflow-hidden flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: `${msg.color || "var(--accent)"}1F`,
                        border: `1.5px solid ${msg.color || "var(--accent)"}55`,
                        color: msg.color || "var(--accent)",
                      }}
                    >
                      {msg.sender !== "agent" && assistantPhoto ? (
                        <img src={assistantPhoto.startsWith("data:") ? assistantPhoto : mediaUrl(assistantPhoto)} alt="" className="w-full h-full object-cover" />
                      ) : msg.sender === "agent" && agentPhoto ? (
                        <img src={agentPhoto.startsWith("data:") ? agentPhoto : mediaUrl(agentPhoto)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        msg.name[0]
                      )}
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
    </>
  );
}
