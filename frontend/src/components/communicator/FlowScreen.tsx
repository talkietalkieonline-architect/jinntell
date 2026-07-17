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

  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Непрерывное распознавание речи → отправка помощнику
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setStatus("idle"); return; }
    const rec = new (SR as unknown as { new (): SpeechRecognition })();
    rec.lang = "ru-RU"; rec.continuous = true; rec.interimResults = true;
    let finalBuf = "";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalBuf += r[0].transcript;
        else interim += r[0].transcript;
      }
      setCaption((finalBuf + interim).trim());
      if (finalBuf.trim().length > 1) {
        const text = finalBuf.trim(); finalBuf = "";
        onSendRef.current(text);
      }
    };
    rec.onend = () => { try { rec.start(); } catch { /* уже запущено */ } };
    try { rec.start(); } catch { /* noop */ }
    return () => { try { rec.onend = null; rec.stop(); } catch { /* noop */ } };
  }, []);

  // Озвучка новых ответов
  useEffect(() => {
    const text = (lastReply || "").trim();
    if (!text || text === spokenRef.current) return;
    spokenRef.current = text;
    setCaption(text);
    setStatus("speaking");
    let cancelled = false;
    (async () => {
      try {
        const url = await ttsBlobUrl(text, voiceId || "ermil");
        if (cancelled) return;
        if (url) {
          const a = new Audio(url); audioRef.current = a;
          a.onended = () => setStatus("listening");
          a.onerror = () => setStatus("listening");
          await a.play();
        } else { setStatus("listening"); }
      } catch { setStatus("listening"); }
    })();
    return () => { cancelled = true; };
  }, [lastReply, voiceId]);

  const hh = now ? now.getHours().toString().padStart(2, "0") : "--";
  const mm = now ? now.getMinutes().toString().padStart(2, "0") : "--";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center animate-fade-in" style={{ zIndex: 90, background: "var(--bg-deep)" }}>
      <button onClick={onExit} className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
      <div className="text-6xl font-light mb-1" style={{ color: "var(--text-primary)", letterSpacing: 3 }}>{hh}:{mm}</div>
      <div className="text-[12px] mb-12 uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>{assistantName} · поток</div>
      <div className="flex items-center justify-center" style={{ width: 200, height: 200 }}>
        <div className={status === "speaking" ? "flow-orb flow-orb-speak" : "flow-orb"} />
      </div>
      <div className="text-sm mt-12 min-h-[44px] text-center px-8 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 520 }}>
        {status === "speaking" ? caption : (caption || "Слушаю…")}
      </div>
    </div>
  );
}
