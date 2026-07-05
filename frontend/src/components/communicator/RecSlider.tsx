"use client";
import { useRef, useState } from "react";

const TRACK = 112;
const KNOB = 54;
const PAD = 3;
const MAX = TRACK - KNOB - PAD * 2;

export default function RecSlider({
  micActive,
  onVoice,
  onVideo,
  onText,
}: {
  micActive: boolean;
  onVoice: () => void;
  onVideo: () => void;
  onText: () => void;
}) {
  const [mode, setMode] = useState<"voice" | "video">("voice");
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);
  const movedRef = useRef(false);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = mode === "voice" ? 0 : MAX;
  const knobX = Math.max(0, Math.min(MAX, base + drag));

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    setDrag(0);
    movedRef.current = false;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 6) movedRef.current = true;
    setDrag(dx);
  };
  const onUp = () => {
    if (startX.current == null) return;
    const dx = drag;
    startX.current = null;
    setDrag(0);
    if (movedRef.current && Math.abs(dx) > 22) {
      setMode(dx > 0 ? "video" : "voice");
      return;
    }
    // Тап: считаем касания — три подряд = строка ввода
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      const n = tapCount.current;
      tapCount.current = 0;
      if (n >= 3) { onText(); return; }
      if (mode === "voice") onVoice(); else onVideo();
    }, 280);
  };

  const isVideo = mode === "video";
  const knobBg = isVideo ? "#e0533d" : (micActive ? "var(--accent)" : "var(--bg-glass)");
  const knobColor = isVideo ? "#fff" : (micActive ? "var(--bg-deep)" : "var(--accent)");
  const knobBorder = isVideo ? "#e0533d" : "var(--accent-bright)";

  return (
    <div className="relative select-none mx-1" style={{ width: TRACK, height: KNOB + PAD * 2 }}>
      <div
        className="absolute inset-0 rounded-full flex items-center justify-between px-4"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
      >
        <span style={{ opacity: isVideo ? 0.5 : 0, fontSize: 15 }}>🎤</span>
        <span style={{ opacity: isVideo ? 0 : 0.5, fontSize: 15 }}>🎥</span>
      </div>
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { startX.current = null; setDrag(0); }}
        className="absolute rounded-full flex items-center justify-center touch-none"
        style={{
          top: PAD,
          left: knobX + PAD,
          width: KNOB,
          height: KNOB,
          background: knobBg,
          color: knobColor,
          border: `2px solid ${knobBorder}`,
          boxShadow: micActive && !isVideo ? "0 0 22px var(--accent-glow-strong)" : "none",
          transition: startX.current == null ? "left 0.15s ease" : "none",
        }}
        title={isVideo ? "Тап — видео-заметка · тройной тап — строка ввода" : "Тап — голос · сдвинь → видео · тройной тап — строка ввода"}
      >
        {isVideo ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="2" y="6" width="14" height="12" rx="3" />
            <path d="M16 10l6-3v10l-6-3z" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        )}
      </button>
    </div>
  );
}
