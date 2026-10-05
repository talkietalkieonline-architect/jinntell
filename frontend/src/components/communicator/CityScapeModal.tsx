"use client";

/**
 * CityScapeModal — «Город» как пространство (прототип/заглушка).
 * Снаружи: сфера города с точками-джинами. Вход внутрь → свободное перемещение,
 * подход к любому джину → открыть его карточку (в Справочнике).
 * Полноценный 3D/движок — позже; это визуальный стаб поверх реальных джинов.
 */
import { useMemo, useState, useRef, useEffect, type PointerEvent as RPE } from "react";
import { useAgents } from "@/hooks/useAgents";
import type { AgentOut } from "@/services/api";

export default function CityScapeModal({
  isOpen,
  onClose,
  onOpenDirectory,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenDirectory: () => void;
  onPick: (id: number) => void;
}) {
  const { agents } = useAgents();
  const [mode, setMode] = useState<"outside" | "inside">("outside");
  const [selected, setSelected] = useState<AgentOut | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!isOpen) { setMode("outside"); setSelected(null); setPan({ x: 0, y: 0 }); }
  }, [isOpen]);

  const dots = useMemo(() => {
    return (agents || []).slice(0, 28).map((a) => {
      const seed = (a.id * 2654435761) >>> 0;
      const rx = (seed & 0xffff) / 0xffff;
      const ry = ((seed >> 16) & 0xffff) / 0xffff;
      return { a, rx, ry };
    });
  }, [agents]);

  if (!isOpen) return null;

  const R = 120;
  const N = Math.max(dots.length, 1);

  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    drag.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (e: RPE<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({ x: drag.current.x + (e.clientX - drag.current.px), y: drag.current.y + (e.clientY - drag.current.py) });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="fixed inset-0 z-[130]" style={{ background: "radial-gradient(circle at 50% 28%, #121626 0%, #05060b 72%)" }}>
      <style>{`@keyframes cityspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes citytwinkle{0%,100%{opacity:.5}50%{opacity:1}}`}</style>

      {/* Верхняя панель */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 z-20">
        <div>
          <div className="text-white text-base font-semibold">🏙 Город · Санкт-Петербург</div>
          <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {mode === "outside" ? "Вы снаружи сферы — живой город джинов (прототип)" : "Внутри: тяните, чтобы двигаться, нажмите на джина"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenDirectory} className="px-3 py-1.5 rounded-lg text-[12px] font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>📖 Справочник</button>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>✕</button>
        </div>
      </div>

      {mode === "outside" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <svg width="340" height="340" viewBox="-170 -170 340 340" style={{ maxWidth: "82vw", maxHeight: "58vh" }}>
            <defs>
              <radialGradient id="cs-sph" cx="38%" cy="30%" r="72%">
                <stop offset="0%" stopColor="rgba(130,165,255,0.38)" />
                <stop offset="60%" stopColor="rgba(60,80,160,0.12)" />
                <stop offset="100%" stopColor="rgba(20,24,48,0.04)" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r={R} fill="url(#cs-sph)" stroke="rgba(130,160,255,0.4)" strokeWidth="1" />
            <ellipse cx="0" cy="0" rx={R} ry={R * 0.38} fill="none" stroke="rgba(130,160,255,0.16)" strokeWidth="1" />
            <g style={{ animation: "cityspin 90s linear infinite", transformOrigin: "center" }}>
              {dots.map((d, idx) => {
                const ang = (idx / N) * Math.PI * 2;
                const rr = R * (0.5 + 0.45 * d.ry);
                const x = Math.cos(ang) * rr;
                const y = Math.sin(ang) * rr * 0.9;
                const col = d.a.color || "#7aa0ff";
                return (
                  <circle key={d.a.id} cx={x} cy={y} r="4.5" fill={col} style={{ animation: `citytwinkle ${3 + (idx % 5)}s ease-in-out infinite` }}>
                    <title>{d.a.name}</title>
                  </circle>
                );
              })}
            </g>
          </svg>
          <button onClick={() => setMode("inside")} className="mt-7 px-6 py-3 rounded-2xl text-sm font-semibold transition-transform hover:scale-[1.03]" style={{ background: "var(--accent, #6d8bff)", color: "#05060b", boxShadow: "0 8px 30px -8px rgba(109,139,255,0.7)" }}>
            Войти в город →
          </button>
          <div className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{dots.length} джинов в городе</div>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onClick={() => setSelected(null)}>
            <div className="absolute" style={{ left: "50%", top: "50%", transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              {dots.map((d) => {
                const x = (d.rx - 0.5) * 1500;
                const y = (d.ry - 0.5) * 1050;
                const col = d.a.color || "#7aa0ff";
                return (
                  <button key={d.a.id} onClick={(e) => { e.stopPropagation(); setSelected(d.a); }} className="absolute flex flex-col items-center" style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}>
                    <span className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${col}33`, border: `2px solid ${col}`, color: "#fff", boxShadow: `0 0 18px ${col}66` }}>
                      {(d.a.name || "?")[0]}
                    </span>
                    <span className="mt-1 text-[10px] whitespace-nowrap px-1 rounded" style={{ color: "rgba(255,255,255,0.75)", background: "rgba(0,0,0,0.3)" }}>{d.a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => setMode("outside")} className="absolute bottom-5 left-5 px-4 py-2 rounded-xl text-[12px]" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
            ← Наружу
          </button>

          {selected && (
            <div className="absolute bottom-5 left-1/2 w-[90%] max-w-sm rounded-2xl p-4" style={{ transform: "translateX(-50%)", background: "rgba(16,19,31,0.96)", border: "1px solid rgba(255,255,255,0.15)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold shrink-0" style={{ background: `${selected.color || "#7aa0ff"}33`, border: `2px solid ${selected.color || "#7aa0ff"}`, color: "#fff" }}>
                  {(selected.name || "?")[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold truncate">{selected.name}</div>
                  <div className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{selected.profession}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSelected(null)} className="flex-1 py-2 rounded-xl text-[13px]" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>Отойти</button>
                <button onClick={() => onPick(selected.id)} className="flex-1 py-2 rounded-xl text-[13px] font-semibold" style={{ background: "var(--accent, #6d8bff)", color: "#05060b" }}>Открыть карточку →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
