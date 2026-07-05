"use client";
import { useEffect, useRef, useState } from "react";

const MAX = 15;

export default function VideoNoteRecorder({ onClose, onDone }: { onClose: () => void; onDone: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError("Нет доступа к камере/микрофону"));
    return () => { alive = false; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") { try { recRef.current.stop(); } catch { /* noop */ } }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  };

  const start = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(streamRef.current); } catch { setError("Запись не поддерживается в этом браузере"); return; }
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const type = mr.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : type.includes("webm") ? "webm" : "mp4";
      const file = new File([blob], `note.${ext}`, { type });
      onDone(file);
      cleanup();
      onClose();
    };
    recRef.current = mr;
    mr.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const n = s + 1;
        if (n >= MAX) stop();
        return n;
      });
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 120, background: "rgba(0,0,0,0.78)" }}
      onClick={() => { cleanup(); onClose(); }}
    >
      <div className="relative flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 280, height: 280, borderRadius: 28, overflow: "hidden", background: "#000",
            border: recording ? "3px solid #e74c3c" : "3px solid var(--accent)",
          }}
        >
          {error ? (
            <div className="w-full h-full flex items-center justify-center text-center text-sm p-4" style={{ color: "#fff" }}>{error}</div>
          ) : (
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full" style={{ objectFit: "cover", transform: "scaleX(-1)" }} />
          )}
        </div>

        {!error && (
          <button
            onClick={recording ? stop : start}
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl transition-all active:scale-95"
            style={{ background: recording ? "#e74c3c" : "var(--accent)", color: "#fff" }}
          >
            {recording ? <span style={{ width: 20, height: 20, background: "#fff", borderRadius: 4 }} /> : "●"}
          </button>
        )}

        <span className="text-white text-sm text-center">
          {error ? "" : recording ? `${seconds} / ${MAX} сек — нажмите ■, чтобы отправить` : "Запись видео-заметки (до 15 сек)"}
        </span>
        <button onClick={() => { cleanup(); onClose(); }} className="text-white/70 text-xs">Отмена</button>
      </div>
    </div>
  );
}
