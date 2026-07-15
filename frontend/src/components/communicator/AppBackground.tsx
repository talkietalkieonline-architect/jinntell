"use client";
import { useEffect, useRef, useState } from "react";
import { MeshGradient, Waves, DotOrbit } from "@paper-design/shaders-react";
import { getPublicConfig } from "@/services/api";

export interface BgPreset {
  id: string;
  name: string;
  theme: "light" | "dark";
  kind: "gradient" | "anim-gradient" | "stars" | "lava" | "dust" | "shader";
  shader?: "mesh" | "waves" | "dots";
  css?: string;
  preview: string;
}

export const BACKGROUNDS: BgPreset[] = [
  // Светлые
  { id: "white", name: "Белый", theme: "light", kind: "gradient", css: "#eef1f6", preview: "#eef1f6" },
  { id: "soft", name: "Серо-жёлтый", theme: "light", kind: "gradient", css: "linear-gradient(160deg,#ebe6d4,#e1dbc4)", preview: "linear-gradient(160deg,#ebe6d4,#e1dbc4)" },
  { id: "sky", name: "Небо", theme: "light", kind: "gradient", css: "linear-gradient(160deg,#e7f0fb,#dfeaf8)", preview: "linear-gradient(160deg,#e7f0fb,#dfeaf8)" },
  { id: "cream", name: "Тёплый", theme: "light", kind: "gradient", css: "linear-gradient(160deg,#faf6ee,#f2ebdd)", preview: "linear-gradient(160deg,#faf6ee,#f2ebdd)" },
  { id: "aurora-l", name: "Аврора", theme: "light", kind: "shader", shader: "mesh", preview: "linear-gradient(135deg,#f2ebdd,#d9a534)" },
  { id: "waves-l", name: "Волны", theme: "light", kind: "shader", shader: "waves", preview: "linear-gradient(160deg,#f4eede,#d9a534)" },
  { id: "dots-l", name: "Точки", theme: "light", kind: "shader", shader: "dots", preview: "radial-gradient(circle,#e9d29a,#eef1f6)" },
  // Тёмные
  { id: "graphite", name: "Графит", theme: "dark", kind: "gradient", css: "linear-gradient(160deg,#0d1322,#160f28,#0a0e1a)", preview: "linear-gradient(160deg,#0d1322,#160f28)" },
  { id: "indigo", name: "Индиго", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#1a1140,#0e1430,#2a124e,#0b0f1f)", preview: "linear-gradient(135deg,#1a1140,#2a124e)" },
  { id: "emerald", name: "Изумруд", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#06231c,#0a1726,#0d3226,#08121a)", preview: "linear-gradient(135deg,#06231c,#0d3226)" },
  { id: "midnight", name: "Полночь", theme: "dark", kind: "gradient", css: "radial-gradient(circle at 50% -10%,#1c2748,#0a0e18 60%)", preview: "radial-gradient(circle at 50% 0%,#1c2748,#0a0e18)" },
  { id: "aurora-d", name: "Аврора", theme: "dark", kind: "shader", shader: "mesh", preview: "linear-gradient(135deg,#1a1140,#2a124e)" },
  { id: "waves-d", name: "Волны", theme: "dark", kind: "shader", shader: "waves", preview: "linear-gradient(160deg,#1a1140,#0a0e18)" },
  { id: "dots-d", name: "Точки", theme: "dark", kind: "shader", shader: "dots", preview: "radial-gradient(circle,#2a124e,#0a0e18)" },
  { id: "stars", name: "Звёзды", theme: "dark", kind: "stars", preview: "radial-gradient(circle,#0b1020,#05060c)" },
  { id: "lava", name: "Лава-лампа", theme: "dark", kind: "lava", preview: "linear-gradient(160deg,#2a124e,#0d3226)" },
  { id: "dust", name: "Золотая пыль", theme: "dark", kind: "dust", preview: "radial-gradient(circle,#15110a,#0a0a0a)" },
];

const DEFAULT_BG_FOR: Record<string, string> = { light: "soft", dark: "indigo", custom: "graphite" };

// Палитры для шейдер-фонов (по теме)
const SH = {
  light: {
    mesh: ["#f6f2e8", "#e7e1cf", "#e9d29a", "#d9a534", "#eef1f6"],
    wavesFront: "#d9a534", wavesBack: "#f4eede",
    dots: ["#d9a534", "#c08a1e", "#e9d29a"], dotsBack: "#eef1f6",
  },
  dark: {
    mesh: ["#0e1430", "#1a1140", "#2a124e", "#0d3226", "#0a0e18"],
    wavesFront: "#3a1d6e", wavesBack: "#0a0e18",
    dots: ["#3a1d6e", "#1d5e54", "#2a124e"], dotsBack: "#0a0e18",
  },
};

export function backgroundsForTheme(theme: string): BgPreset[] {
  const list = theme === "custom" ? BACKGROUNDS : BACKGROUNDS.filter((b) => b.theme === theme);
  return shaderEnabled() ? list : list.filter((b) => b.kind !== "shader");
}
export function defaultBgFor(theme: string): string {
  return DEFAULT_BG_FOR[theme] || "graphite";
}

function curTheme(): string {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") || "light";
}
function animEnabled(): boolean {
  try { return localStorage.getItem("jinntell_anim_off") !== "1"; } catch { return true; }
}
// Глобальный рубильник фон-шейдеров (из админки, кэш в localStorage)
function shaderEnabled(): boolean {
  try { return localStorage.getItem("jinntell_shader_off") !== "1"; } catch { return true; }
}

export default function AppBackground() {
  const [bgId, setBgId] = useState("soft");
  const [theme, setTheme] = useState("light");
  const [anim, setAnim] = useState(true);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
    const read = () => {
      const t = curTheme();
      setTheme(t);
      setAnim(animEnabled());
      let id = "";
      try { id = localStorage.getItem("jinntell_bg") || ""; } catch { id = ""; }
      const found = BACKGROUNDS.find((b) => b.id === id);
      // фон должен подходить теме (для custom — любой)
      if (!found || (t !== "custom" && found.theme !== t)) id = defaultBgFor(t);
      // если шейдеры выключены глобально — откат на обычный фон
      if (found && found.kind === "shader" && !shaderEnabled()) id = defaultBgFor(t);
      setBgId(id);
    };
    read();
    // подтянуть глобальный рубильник шейдеров из админки и перечитать
    getPublicConfig()
      .then((c) => { try { localStorage.setItem("jinntell_shader_off", c.shader_bg_enabled ? "0" : "1"); } catch {} read(); })
      .catch(() => {});
    window.addEventListener("jinntell_bg_change", read);
    window.addEventListener("jinntell_theme_change", read);
    window.addEventListener("jinntell_anim_change", read);
    return () => {
      window.removeEventListener("jinntell_bg_change", read);
      window.removeEventListener("jinntell_theme_change", read);
      window.removeEventListener("jinntell_anim_change", read);
    };
  }, []);

  const bg = BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS.find((b) => b.id === defaultBgFor(theme)) || BACKGROUNDS[0];

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

  const baseStyle = bg.kind === "stars"
    ? "radial-gradient(circle at 50% 30%,#0b1020,#05060c)"
    : bg.kind === "dust"
      ? "radial-gradient(circle at 50% 40%,#14110a,#08080a)"
      : bg.kind === "lava"
        ? "linear-gradient(160deg,#160f26,#0a0e1a)"
        : bg.kind === "shader"
          ? (bg.theme === "dark" ? "#0a0e18" : "#eef1f6")
          : bg.css;

  const st = bg.theme === "dark" ? "dark" : "light";
  const pal = SH[st];
  const shaderStyle = { position: "absolute" as const, inset: 0, width: "100%", height: "100%" };

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, overflow: "hidden" }}>
      <div
        className="absolute inset-0"
        style={{
          background: baseStyle,
          backgroundSize: bg.kind === "anim-gradient" ? "300% 300%" : "cover",
          animation: bg.kind === "anim-gradient" && anim ? "bgShift 22s ease infinite" : undefined,
        }}
      />
      {bg.kind === "shader" && mounted && (
        <>
          {bg.shader === "waves" ? (
            <Waves style={shaderStyle} colorFront={pal.wavesFront} colorBack={pal.wavesBack} frequency={1.4} amplitude={0.42} spacing={0.9} proportion={0.5} softness={0.85} rotation={0.35} />
          ) : bg.shader === "dots" ? (
            <DotOrbit style={shaderStyle} colors={pal.dots} colorBack={pal.dotsBack} size={0.5} sizeRange={0.5} spreading={0.6} stepsPerColor={2} />
          ) : (
            <MeshGradient style={shaderStyle} colors={pal.mesh} speed={anim ? 0.16 : 0} distortion={0.85} swirl={0.55} />
          )}
          {/* мягкий скрим — чтобы стеклянные панели и текст читались */}
          <div
            className="absolute inset-0"
            style={{ background: st === "dark" ? "rgba(8,10,20,0.34)" : "rgba(246,243,233,0.26)" }}
          />
        </>
      )}
      {(bg.kind === "stars" || bg.kind === "dust") && <canvas ref={canvasRef} className="absolute inset-0" />}
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
