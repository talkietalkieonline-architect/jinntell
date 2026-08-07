"use client";
import { useEffect, useRef, useState } from "react";

/** Плавающая перетаскиваемая кнопка входа в Поток. Показывается на всех экранах, кроме самого Потока.
 *  Тап — открыть Поток; перетаскивание — сдвинуть, чтобы не мешала (позиция запоминается). */
export default function FlowFab({ onOpen }: { onOpen: () => void }) {
  const SIZE = 56;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const clamp = (x: number, y: number) => ({
    x: Math.max(6, Math.min(window.innerWidth - SIZE - 6, x)),
    y: Math.max(60, Math.min(window.innerHeight - SIZE - 6, y)),
  });

  useEffect(() => {
    let init: { x: number; y: number } | null = null;
    try { const r = localStorage.getItem("jinntell_flowfab"); if (r) init = JSON.parse(r); } catch { /* noop */ }
    setPos(init ? clamp(init.x, init.y) : { x: window.innerWidth - SIZE - 14, y: window.innerHeight - SIZE - 150 });
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (!pos) return;
    startRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    movedRef.current = false;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    setPos(clamp(startRef.current.x + dx, startRef.current.y + dy));
  };
  const onUp = () => {
    if (!startRef.current) return;
    startRef.current = null;
    if (!movedRef.current) { onOpen(); return; }
    if (pos) { try { localStorage.setItem("jinntell_flowfab", JSON.stringify(pos)); } catch { /* noop */ } }
  };

  if (!pos) return null;
  return (
    <button
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      title="Поток — голосовой режим (перетащи, чтобы сдвинуть)"
      className="fixed rounded-full flex items-center justify-center select-none active:scale-95"
      style={{
        left: pos.x, top: pos.y, width: SIZE, height: SIZE, zIndex: 55, touchAction: "none", cursor: "grab",
        background: "var(--accent)", color: "var(--bg-deep)",
        boxShadow: "0 6px 22px rgba(0,0,0,0.45), 0 0 18px var(--accent-glow-strong)",
        border: "1px solid var(--accent-bright)",
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>🌀</span>
    </button>
  );
}
