"use client";
import { useEffect, useRef, useState } from "react";
import { ttsBlobUrl } from "@/services/api";

export default function FlowScreen({ onExit, onSend, lastReply, assistantName, voiceId }: {
  onExit: () => void;
  onSend: (text: string) => void;
  lastReply: string;
  assistantName: string;
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
    <div className="fixed inset-0 flex flex-col items-center justify-center animate-fade-in" style={{ zIndex: 90, background: "rgba(8,10,16,0.66)", backdropFilter: "blur(2px)" }}>
      <button onClick={onExit} className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
      <div className="text-6xl font-light mb-1" style={{ color: "var(--text-primary)", letterSpacing: 3 }}>{hh}:{mm}</div>
      <div className="text-[12px] mb-12 uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>{assistantName} · поток</div>
      <div onClick={interrupt} className="flex items-center justify-center cursor-pointer" style={{ width: 200, height: 200 }} title="Нажми, чтобы прервать">
        <div className={status === "speaking" ? "flow-orb flow-orb-speak" : "flow-orb"} />
      </div>
      <div className="text-sm mt-12 min-h-[44px] text-center px-8 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 520 }}>
        {status === "speaking" ? (caption + " · нажми, чтобы прервать") : (caption || "Слушаю…")}
      </div>
    </div>
  );
}
