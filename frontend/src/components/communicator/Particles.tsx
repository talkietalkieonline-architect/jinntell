"use client";
import { useEffect, useRef } from "react";

/** Анимация частиц на фоне (режим Общение) — облегчённая версия */
export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let grd: CanvasGradient | null = null;
    const buildGradient = () => {
      grd = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.4
      );
      grd.addColorStop(0, "rgba(212, 168, 67, 0.06)");
      grd.addColorStop(1, "transparent");
    };

    const COUNT = window.innerWidth < 640 ? 22 : 50;
    const particles: { x: number; y: number; r: number; vx: number; vy: number; a: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      buildGradient();
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        a: Math.random() * 0.5 + 0.1,
      });
    }

    const paint = (move: boolean) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (grd) {
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      for (const p of particles) {
        if (move) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 168, 67, ${p.a})`;
        ctx.fill();
      }
    };

    // Уважаем «уменьшить движение» — один статичный кадр, без цикла
    if (reduceMotion) {
      paint(false);
      return () => window.removeEventListener("resize", resize);
    }

    // Троттлинг ~30 fps + пауза, когда вкладка скрыта
    let animId = 0;
    let last = 0;
    const FRAME = 1000 / 30;
    const loop = (t: number) => {
      animId = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - last < FRAME) return;
      last = t;
      paint(true);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
