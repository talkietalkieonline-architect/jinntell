"use client";
import { useEffect, useRef, useState } from "react";
import { MeshGradient, Waves, DotOrbit } from "@paper-design/shaders-react";
import { getPublicConfig } from "@/services/api";

export interface BgPreset {
  id: string;
  name: string;
  theme: "light" | "dark";
  kind: "gradient" | "anim-gradient" | "stars" | "lava" | "dust" | "shader" | "image" | "ink";
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
  { id: "dawn", name: "Рассвет", theme: "light", kind: "anim-gradient", css: "linear-gradient(-45deg,#fce8d8,#f7d9c4,#f3e0d0,#fbeede)", preview: "linear-gradient(135deg,#fce8d8,#f3e0d0)" },
  { id: "mint", name: "Мята", theme: "light", kind: "anim-gradient", css: "linear-gradient(-45deg,#e2f3ec,#d8eef0,#e6f1e0,#eef7f2)", preview: "linear-gradient(135deg,#e2f3ec,#e6f1e0)" },
  { id: "lavender", name: "Лаванда", theme: "light", kind: "anim-gradient", css: "linear-gradient(-45deg,#efe8f7,#e6def4,#f0e6f2,#f6f0fb)", preview: "linear-gradient(135deg,#e6def4,#efe8f7)" },
  { id: "peach", name: "Персик", theme: "light", kind: "anim-gradient", css: "linear-gradient(-45deg,#fdeee2,#fbe0d4,#fce8d6,#fef4ea)", preview: "linear-gradient(135deg,#fbe0d4,#fce8d6)" },
  { id: "aurora-l", name: "Аврора", theme: "light", kind: "shader", shader: "mesh", preview: "linear-gradient(135deg,#f2ebdd,#d9a534)" },
  { id: "waves-l", name: "Волны", theme: "light", kind: "shader", shader: "waves", preview: "linear-gradient(160deg,#f4eede,#d9a534)" },
  { id: "dots-l", name: "Точки", theme: "light", kind: "shader", shader: "dots", preview: "radial-gradient(circle,#e9d29a,#eef1f6)" },
  // Тёмные
  { id: "graphite", name: "Графит", theme: "dark", kind: "gradient", css: "linear-gradient(160deg,#0d1322,#160f28,#0a0e1a)", preview: "linear-gradient(160deg,#0d1322,#160f28)" },
  { id: "indigo", name: "Индиго", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#1a1140,#0e1430,#2a124e,#0b0f1f)", preview: "linear-gradient(135deg,#1a1140,#2a124e)" },
  { id: "emerald", name: "Изумруд", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#06231c,#0a1726,#0d3226,#08121a)", preview: "linear-gradient(135deg,#06231c,#0d3226)" },
  { id: "midnight", name: "Полночь", theme: "dark", kind: "gradient", css: "radial-gradient(circle at 50% -10%,#1c2748,#0a0e18 60%)", preview: "radial-gradient(circle at 50% 0%,#1c2748,#0a0e18)" },
  { id: "sunset", name: "Закат", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#3a1020,#5e1d3a,#7a2a1e,#2a0f2e)", preview: "linear-gradient(135deg,#5e1d3a,#7a2a1e)" },
  { id: "ocean", name: "Океан", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#04121f,#06283a,#0a3a4a,#062230)", preview: "linear-gradient(135deg,#06283a,#0a3a4a)" },
  { id: "neon", name: "Неон", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#0a0f2a,#2a0f4e,#0f2a4e,#1a0a3e)", preview: "linear-gradient(135deg,#2a0f4e,#0f2a4e)" },
  { id: "amethyst", name: "Аметист", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#1e0f2e,#3a1550,#2a1a5e,#140a24)", preview: "linear-gradient(135deg,#3a1550,#2a1a5e)" },
  { id: "volcano", name: "Вулкан", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#1a0a08,#3e150c,#5e2410,#2a0f08)", preview: "linear-gradient(135deg,#3e150c,#5e2410)" },
  { id: "teal", name: "Бирюза", theme: "dark", kind: "anim-gradient", css: "linear-gradient(-45deg,#04181f,#063040,#0a4a4a,#052228)", preview: "linear-gradient(135deg,#063040,#0a4a4a)" },
  { id: "cosmos", name: "Космос", theme: "dark", kind: "gradient", css: "radial-gradient(circle at 30% 20%,#1a1440,#0a0e1a 55%)", preview: "radial-gradient(circle,#1a1440,#0a0e1a)" },
  { id: "aurora-d", name: "Аврора", theme: "dark", kind: "shader", shader: "mesh", preview: "linear-gradient(135deg,#1a1140,#2a124e)" },
  { id: "waves-d", name: "Волны", theme: "dark", kind: "shader", shader: "waves", preview: "linear-gradient(160deg,#1a1140,#0a0e18)" },
  { id: "dots-d", name: "Точки", theme: "dark", kind: "shader", shader: "dots", preview: "radial-gradient(circle,#2a124e,#0a0e18)" },
  { id: "stars", name: "Звёзды", theme: "dark", kind: "stars", preview: "radial-gradient(circle,#0b1020,#05060c)" },
  { id: "lava", name: "Лава-лампа", theme: "dark", kind: "lava", preview: "linear-gradient(160deg,#2a124e,#0d3226)" },
  { id: "ink", name: "Чернила в воде", theme: "dark", kind: "ink", preview: "radial-gradient(circle at 40% 35%,#3a2d6e,#0a0e18 70%)" },
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

const PALETTES: Record<string, typeof SH.light> = {
  gold: { mesh: ["#f6f2e8", "#e7e1cf", "#e9d29a", "#d9a534", "#b8860b"], wavesFront: "#d9a534", wavesBack: "#f4eede", dots: ["#d9a534", "#c08a1e", "#e9d29a"], dotsBack: "#faf6ee" },
  emerald: { mesh: ["#06231c", "#0a1726", "#0d3226", "#1d5e54", "#08121a"], wavesFront: "#1d5e54", wavesBack: "#06231c", dots: ["#1d5e54", "#0d3226", "#2a7d6e"], dotsBack: "#06120e" },
  indigo: { mesh: ["#0e1430", "#1a1140", "#2a124e", "#3a1d6e", "#0a0e18"], wavesFront: "#3a1d6e", wavesBack: "#0a0e18", dots: ["#3a1d6e", "#2a124e", "#4a2d8e"], dotsBack: "#0a0e18" },
  rose: { mesh: ["#2a0f1e", "#3e1330", "#5e1d4a", "#8e2d6a", "#160a12"], wavesFront: "#8e2d6a", wavesBack: "#2a0f1e", dots: ["#8e2d6a", "#5e1d4a", "#b84d8a"], dotsBack: "#1a0a12" },
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

export default function AppBackground({ override }: { override?: string } = {}) {
  const [bgId, setBgId] = useState("soft");
  const [theme, setTheme] = useState("light");
  const [anim, setAnim] = useState(true);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [animPalette, setAnimPalette] = useState("");
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
    const read = () => {
      const t = curTheme();
      setTheme(t);
      setAnim(animEnabled());
      try { const sp = parseFloat(localStorage.getItem("jinntell_anim_speed") || "1"); setAnimSpeed(isNaN(sp) ? 1 : sp); } catch { setAnimSpeed(1); }
      try { setAnimPalette(localStorage.getItem("jinntell_anim_palette") || ""); } catch { setAnimPalette(""); }
      let id = "";
      if (override) { id = override; }
      else { try { id = localStorage.getItem("jinntell_bg") || ""; } catch { id = ""; } }
      const found = BACKGROUNDS.find((b) => b.id === id);
      // фон должен подходить теме (для custom — любой)
      if (id !== "custom-image" && (!found || (t !== "custom" && found.theme !== t))) id = defaultBgFor(t);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override]);

  const customBg = typeof window !== "undefined" ? (localStorage.getItem("jinntell_custom_bg") || "") : "";
  const bg: BgPreset = (bgId === "custom-image" && customBg)
    ? ({ id: "custom-image", name: "Свой фон", theme, kind: "image", preview: "" } as BgPreset)
    : (BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS.find((b) => b.id === defaultBgFor(theme)) || BACKGROUNDS[0]);

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
          p.x += p.vx * animSpeed; p.y += p.vy * animSpeed; p.tw += 0.03 * animSpeed;
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
  }, [bg.kind, anim, animSpeed]);

  // «Чернила в воде» — процедурный WebGL-фон (домен-варпинг fbm). GPU, лёгкий, без зависимостей.
  useEffect(() => {
    if (bg.kind !== "ink") return;
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    // Акцентный цвет из темы → подсветка чернильных нитей (fallback — золото)
    const parseColor = (s: string): [number, number, number] => {
      s = (s || "").trim();
      const m = s.match(/^#([0-9a-f]{6})$/i);
      if (m) { const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
      const r = s.match(/rgba?\(([^)]+)\)/i);
      if (r) { const p = r[1].split(",").map((x) => parseFloat(x)); return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255]; }
      return [0.85, 0.65, 0.2];
    };
    let glow: [number, number, number] = [0.85, 0.65, 0.2];
    try { glow = parseColor(getComputedStyle(document.documentElement).getPropertyValue("--accent")); } catch { /* noop */ }

    const vsrc = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
    const fsrc = [
      "precision highp float;",
      "uniform vec2 uRes;uniform float uTime;uniform vec3 uWater;uniform vec3 uInk;uniform vec3 uGlow;",
      "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
      "float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));vec2 u=f*f*(3.0-2.0*f);return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;}",
      "float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}",
      "void main(){vec2 uv=gl_FragCoord.xy/uRes.xy;uv.x*=uRes.x/uRes.y;float t=uTime*0.05;",
      "vec2 q=vec2(fbm(uv*3.0+vec2(0.0,t)),fbm(uv*3.0+vec2(5.2,1.3)+t));",
      "vec2 r=vec2(fbm(uv*3.0+4.0*q+vec2(1.7,9.2)-t*0.6),fbm(uv*3.0+4.0*q+vec2(8.3,2.8)+t*0.4));",
      "float f=fbm(uv*3.0+4.0*r);",
      "float ink=smoothstep(0.35,0.78,f);",
      "vec3 col=mix(uWater,uInk,ink);",
      "float fil=smoothstep(0.55,0.62,f)*(1.0-smoothstep(0.62,0.74,f));",
      "col+=uGlow*fil*0.55;",
      "vec2 c=gl_FragCoord.xy/uRes.xy-0.5;col*=1.0-dot(c,c)*0.6;",
      "gl_FragColor=vec4(col,1.0);}",
    ].join("\n");
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    gl.uniform3f(gl.getUniformLocation(prog, "uWater"), 0.02, 0.03, 0.07);
    gl.uniform3f(gl.getUniformLocation(prog, "uInk"), 0.16, 0.11, 0.34);
    gl.uniform3f(gl.getUniformLocation(prog, "uGlow"), glow[0], glow[1], glow[2]);

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0; let last = 0; let clock = 0; let prevT = performance.now();
    const frame = (paint: boolean) => { gl.uniform1f(uTime, clock); gl.drawArrays(gl.TRIANGLES, 0, 3); void paint; };
    if (!anim) { clock = 8; frame(true); return () => { window.removeEventListener("resize", resize); }; }
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { prevT = t; return; }
      if (t - last < 1000 / 30) return;
      last = t;
      clock += ((t - prevT) / 1000) * animSpeed; prevT = t;
      frame(true);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [bg.kind, anim, animSpeed]);

  const baseStyle = bg.kind === "stars"
    ? "radial-gradient(circle at 50% 30%,#0b1020,#05060c)"
    : bg.kind === "dust"
      ? "radial-gradient(circle at 50% 40%,#14110a,#08080a)"
      : bg.kind === "lava"
        ? "linear-gradient(160deg,#160f26,#0a0e1a)"
      : bg.kind === "ink"
        ? "radial-gradient(circle at 40% 35%,#12102a,#05060c 75%)"
        : bg.kind === "shader"
          ? (bg.theme === "dark" ? "#0a0e18" : "#eef1f6")
          : bg.css;

  const st = bg.theme === "dark" ? "dark" : "light";
  const pal = (animPalette && PALETTES[animPalette]) ? PALETTES[animPalette] : SH[st];
  const shaderStyle = { position: "absolute" as const, inset: 0, width: "100%", height: "100%" };

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, overflow: "hidden" }}>
      <div
        className="absolute inset-0"
        style={{
          background: baseStyle,
          backgroundSize: bg.kind === "anim-gradient" ? "300% 300%" : "cover",
          animation: bg.kind === "anim-gradient" && anim ? `bgShift ${22 / (animSpeed || 1)}s ease infinite` : undefined,
        }}
      />
      {bg.kind === "image" && (
        <>
          <div className={`absolute inset-0${anim ? " ken-burns" : ""}`} style={{ backgroundImage: `url(${customBg})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          <div className="absolute inset-0" style={{ background: theme === "dark" ? "rgba(8,10,20,0.34)" : "rgba(246,243,233,0.20)" }} />
        </>
      )}
      {bg.kind === "shader" && mounted && (
        <>
          {bg.shader === "waves" ? (
            anim ? <Waves style={shaderStyle} colorFront={pal.wavesFront} colorBack={pal.wavesBack} frequency={1.4} amplitude={0.42} spacing={0.9} proportion={0.5} softness={0.85} rotation={0.35} /> : null
          ) : bg.shader === "dots" ? (
            anim ? <DotOrbit style={shaderStyle} colors={pal.dots} colorBack={pal.dotsBack} size={0.5} sizeRange={0.5} spreading={0.6} stepsPerColor={2} /> : null
          ) : (
            <MeshGradient style={shaderStyle} colors={pal.mesh} speed={anim ? 0.16 * animSpeed : 0} distortion={0.85} swirl={0.55} />
          )}
          {/* мягкий скрим — чтобы стеклянные панели и текст читались */}
          <div
            className="absolute inset-0"
            style={{ background: st === "dark" ? "rgba(8,10,20,0.34)" : "rgba(246,243,233,0.26)" }}
          />
        </>
      )}
      {(bg.kind === "stars" || bg.kind === "dust") && <canvas ref={canvasRef} className="absolute inset-0" />}
      {bg.kind === "ink" && (
        <>
          <canvas ref={inkCanvasRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
          <div className="absolute inset-0" style={{ background: "rgba(6,8,16,0.30)" }} />
        </>
      )}
      {bg.kind === "lava" && anim && (
        <>
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#d4622a,transparent 62%)", left: "4%", top: "8%", animationDelay: "0s" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#8e2d6a,transparent 62%)", left: "56%", top: "46%", animationDelay: "-6s" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#d9a534,transparent 62%)", left: "28%", top: "60%", animationDelay: "-12s", width: "38vmax", height: "38vmax" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#1d5e54,transparent 62%)", left: "70%", top: "6%", animationDelay: "-18s", width: "40vmax", height: "40vmax" }} />
          <div className="lava-blob" style={{ background: "radial-gradient(circle,#3a1d6e,transparent 62%)", left: "16%", top: "38%", animationDelay: "-3s" }} />
        </>
      )}
    </div>
  );
}
