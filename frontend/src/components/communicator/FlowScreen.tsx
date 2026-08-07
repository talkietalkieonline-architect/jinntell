"use client";
import { useEffect, useRef, useState } from "react";
import { ttsBlobUrl, mediaUrl } from "@/services/api";
import AppBackground from "@/components/communicator/AppBackground";

export default function FlowScreen({ onExit, onSend, lastReply, lastMedia, assistantName, assistantPhoto, voiceId }: {
  onExit: () => void;
  onSend: (text: string) => void;
  lastReply: string;
  lastMedia?: { url: string; type: string } | null;
  assistantName: string;
  assistantPhoto?: string | null;
  voiceId?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState<"idle" | "listening" | "speaking">("listening");
  const [caption, setCaption] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenRef = useRef<string>(lastReply || "");
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  // Анти-эхо: пока помощник озвучивает — НЕ слушаем (иначе микрофон слышит TTS и зацикливается)
  const speakingRef = useRef(false);
  const finalRef = useRef("");
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Непрерывное распознавание речи → отправка помощнику (с дебаунсом и анти-эхо)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setStatus("idle"); return; }
    const rec = new (SR as unknown as { new (): SpeechRecognition })();
    rec.lang = "ru-RU"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      if (speakingRef.current) return; // анти-эхо: игнорируем ввод во время озвучки
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const seg = r[0].transcript.trim();
          if (seg) finalRef.current = (finalRef.current ? finalRef.current + " " : "") + seg;
        } else {
          interim += r[0].transcript;
        }
      }
      setCaption((finalRef.current + " " + interim).trim());
      // Дебаунс: отправляем цельную фразу после паузы (гасит фрагментацию и дубли)
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => {
        const phrase = finalRef.current.trim();
        finalRef.current = "";
        if (phrase && !speakingRef.current) { setCaption(""); onSendRef.current(phrase); }
      }, 900);
    };
    rec.onend = () => { try { rec.start(); } catch { /* уже запущено */ } };
    try { rec.start(); } catch { /* noop */ }
    return () => {
      try { rec.onend = null; rec.stop(); } catch { /* noop */ }
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    };
  }, []);

  // Озвучка новых ответов — с остановкой предыдущего аудио (без наложения) и флагом анти-эха
  useEffect(() => {
    const text = (lastReply || "").trim();
    if (!text || text === spokenRef.current) return;
    spokenRef.current = text;
    setCaption(text);
    setStatus("speaking");
    try { audioRef.current?.pause(); } catch { /* noop */ }  // стоп предыдущего — без наложения
    speakingRef.current = true;
    finalRef.current = "";  // сбросить накопленное (могло быть эхо)
    let cancelled = false;
    (async () => {
      try {
        const url = await ttsBlobUrl(text, voiceId || "ermil");
        if (cancelled) { speakingRef.current = false; return; }
        if (url) {
          const a = new Audio(url); audioRef.current = a;
          const done = () => { setStatus("listening"); setTimeout(() => { speakingRef.current = false; }, 600); };
          a.onended = done;
          a.onerror = done;
          await a.play();
        } else { setStatus("listening"); speakingRef.current = false; }
      } catch { setStatus("listening"); speakingRef.current = false; }
    })();
    return () => { cancelled = true; };
  }, [lastReply, voiceId]);

  const interrupt = () => {
    try { audioRef.current?.pause(); } catch { /* noop */ }
    speakingRef.current = false;
    finalRef.current = "";
    setStatus("listening");
    setCaption("");
  };

  const hh = now ? now.getHours().toString().padStart(2, "0") : "--";
  const mm = now ? now.getMinutes().toString().padStart(2, "0") : "--";

  return (
    <div className="fixed inset-0 animate-fade-in" style={{ zIndex: 90, background: "var(--bg-deep, #0a0e18)" }}>
      {/* Непрозрачный фон из системы фонов чата */}
      <AppBackground />
      {/* Лёгкий скрим для читаемости текста поверх фона */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(8,10,16,0.30)" }} />

      {/* Контент поверх фона (z-1). Пустое место ловит тап-прерывание */}
      <div onClick={interrupt} className="relative w-full h-full flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }} className="absolute top-5 left-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
        <div className="text-6xl font-light mb-1" style={{ color: "var(--text-primary)", letterSpacing: 3 }}>{hh}:{mm}</div>
        <div className="text-[12px] mb-12 uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>{assistantName} · поток</div>

        {/* Центр: аватар помощника (фото в покое) → вибрирующая волна во время речи */}
        <div className="flex items-center justify-center cursor-pointer relative" style={{ width: 200, height: 200 }} title="Нажми, чтобы прервать">
          {status === "speaking" ? (
            <div className="flow-orb flow-orb-speak" />
          ) : assistantPhoto ? (
            <img
              src={assistantPhoto}
              alt={assistantName}
              className="rounded-full object-cover animate-fade-in"
              style={{ width: 172, height: 172, boxShadow: "0 0 0 2px var(--bg-glass-border), 0 10px 48px rgba(0,0,0,0.45)" }}
            />
          ) : (
            <div className="flow-orb" />
          )}
        </div>

        <div className="text-sm mt-12 min-h-[44px] text-center px-8 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 520 }}>
          {status === "speaking" ? (caption + " · нажми, чтобы прервать") : (caption || "Слушаю…")}
        </div>
      </div>

      {/* Медиа «из дымки» снизу: помощник показывает картинку/видео */}
      {lastMedia?.url && (
        <div
          key={lastMedia.url}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 right-0 bottom-0 flex justify-center animate-fade-in"
          style={{ zIndex: 2, paddingBottom: 24, pointerEvents: "auto" }}
        >
          <div
            className="absolute left-0 right-0 bottom-0 pointer-events-none"
            style={{ height: 220, background: "linear-gradient(to top, rgba(8,10,16,0.72), transparent)" }}
          />
          <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: "78%", maxHeight: 260, boxShadow: "0 12px 48px rgba(0,0,0,0.5)", border: "1px solid var(--bg-glass-border)" }}>
            {(() => {
              const raw = lastMedia.url;
              const src = raw.startsWith("blob:") || raw.startsWith("data:") ? raw : mediaUrl(raw);
              return lastMedia.type === "video" ? (
                <video src={src} controls playsInline style={{ maxWidth: "100%", maxHeight: 260, display: "block" }} />
              ) : (
                <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: 260, display: "block", objectFit: "contain" }} />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
