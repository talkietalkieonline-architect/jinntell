"use client";
import { useEffect, useRef, useState } from "react";

export interface BgPreset {
  id: string;
  name: string;
  kind: "gradient" | "anim-gradient" | "stars" | "lava" | "dust";
  css?: string;
  preview: string;
}

export const BACKGROUNDS: BgPreset[] = [
  { id: "graphite", name: "Графит", kind: "gradient", css: "linear-gradient(160deg,#0d1322,#160f28,#0a0e1a)", preview: "linear-gradient(160deg,#0d1322,#160f28)" },
  { id: "indigo", name: "Индиго-перелив", kind: "anim-gradient", css: "linear-gradient(-45deg,#1a1140,#0e1430,#2a124e,#0b0f1f)", preview: "linear-gradient(135deg,#1a1140,#2a124e)" },
  { id: "emerald", name: "Изумруд", kind: "anim-gradient", css: "linear-gradient(-45deg,#06231c,#0a1726,#0d3226,#08121a)", preview: "linear-gradient(135deg,#06231c,#0d3226)" },
  { id: "midnight", name: "Полночь", kind: "gradient", css: "radial-gradient(circle at 50% -10%,#1c2748,#0a0e18 60%)", preview: "radial-gradient(circle at 50% 0%,#1c2748,#0a0e18)" },
  { id: "stars", name: "Звёзды", kind: "stars", preview: "radial-gradient(circle,#0b1020,#05060c)" },
  { id: "lava", name: "Лава-лампа", kind: "lava", preview: "linear-gradient(160deg,#2a124e,#0d3226)" },
  { id: "dust", name: "Золотая пыль", kind: "dust", preview: "radial-gradient(circle,#15110a,#0a0a0a)" },
];

export const DEFAULT_BG = "indigo";

function readBg(): string {
  try { return localStorage.getItem("jinntell_bg") || DEFAULT_BG; } catch { return DEFAULT_BG; }
}
function animEnabled(): boolean {
  try { return localStorage.getItem("jinntell_anim_off") !== "1"; } catch { return true; }
}

export default function AppBackground() {
  const [bgId, setBgId] = useState(DEFAULT_BG);
  const [anim, setAnim] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const read = () => { setBgId(readBg()); setAnim(animEnabled()); };
    read();
    window.addEventListener("jinntell_bg_change", read);
    window.addEventListener("jinntell_anim_change", read);
    return () => {
      window.removeEventListener("jinntell_bg_change", read);
      window.removeEventListener("jinntell_anim_change", read);
    };
  }, []);

  const bg = BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS[0];

  useEffect(() => {
    if (bg.kind !== "stars" && bg.kind !== "dust") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const isDust = bg.kind === "dust";
    const rgb = isDust ? "212,168,67" : "255,255,255";
    const count = window.innerWidth < 640 ? 30 : 70;
    const pts: { x: number; y: number; r: number; vx: number; vy: number; a: number; tw: number }[] = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < count; i++) {
      pts.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, a: Math.random() * 0.6 + 0.2, tw: Math.random() * Math.PI * 2 });
    }
    const draw = (move: boolean) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        if (move) {
          p.x += p.vx; p.y += p.vy; p.tw += 0.03;
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
        }
        const alpha = isDust ? p.a : p.a * (0.5 + 0.5 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.fill();
      }
    };
    if (!anim) { draw(false); return () => window.removeEventListener("resize", resize); }
    let raf = 0; let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - last < 1000 / 30) return;
      last = t;
      draw(true);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [bg.kind, anim]);

  const base = bg.kind === "stars"
    ? "radial-gradient(circle at 50% 30%,#0b1020,#05060c)"
    : bg.kind === "dust"
      ? "radial-gradient(circle at 50% 40%,#14110a,#08080a)"
      : bg.kind === "lava"
        ? "linear-gradient(160deg,#160f26,#0a0e1a)"
        : bg.css;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, overflow: "hidden" }}>
      <div
        className="absolute inset-0"
        style={{
          background: base,
          backgroundSize: bg.kind === "anim-gradient" ? "300% 300%" : "cover",
          animation: bg.kind === "anim-gradient" && anim ? "bgShift 22s ease infinite" : undefined,
        }}
      />
      {(bg.kind === "stars" || bg.kind === "dust") && (
        <canvas ref={canvasRef} className="absolute inset-0" />
      )}
      {bg.kind === "lava" && anim && (
        <>
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#3a1d6e,transparent 60%)", left: "8%", top: "18%", animationDelay: "0s" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#1d5e54,transparent 60%)", left: "58%", top: "52%", animationDelay: "-8s" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#5e1d4a,transparent 60%)", left: "32%", top: "68%", animationDelay: "-16s" }} />
        </>
      )}
    </div>
  );
}
