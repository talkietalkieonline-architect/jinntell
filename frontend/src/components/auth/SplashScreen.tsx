"use client";
import { useEffect, useState } from "react";

/** Заставка при загрузке — лого JinnTell с анимацией */
export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Показываем заставку 2.5 сек, потом плавно исчезает
    const timer1 = setTimeout(() => setFade(true), 2000);
    const timer2 = setTimeout(onFinish, 2800);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onFinish]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center transition-opacity duration-700"
      style={{
        background: "var(--bg-deep)",
        zIndex: 200,
        opacity: fade ? 0 : 1,
        pointerEvents: fade ? "none" : "auto",
      }}
    >
      {/* Свечение за логотипом */}
      <div
        className="absolute rounded-full"
        style={{
          width: "300px",
          height: "300px",
          background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Логотип */}
      <div className="relative flex flex-col items-center">
        <span
          className="text-5xl font-bold tracking-tight mb-2"
          style={{ color: "var(--accent-bright)" }}
        >
          JinnTell
        </span>
        <span
          className="text-sm uppercase tracking-[0.4em]"
          style={{ color: "var(--text-muted)" }}
        >
          AI-First
        </span>
      </div>
    </div>
  );
}
