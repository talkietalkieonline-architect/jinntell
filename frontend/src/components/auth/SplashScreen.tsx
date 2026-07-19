"use client";
import { useEffect, useState, useRef } from "react";

/** Заставка при загрузке — лого JinnTell с анимацией */
export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [fade, setFade] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    // Защита от двойного вызова
    if (calledRef.current) return;

    // Показываем заставку 2.5 сек, потом плавно исчезает
    const timer1 = setTimeout(() => setFade(true), 2000);
    const timer2 = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onFinish();
      }
    }, 2800);

    // Fallback: если через 5 сек splash всё ещё виден — принудительно убираем
    const fallback = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onFinish();
      }
    }, 5000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(fallback);
    };
  }, [onFinish]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: "var(--bg-deep, #0a0a0a)",
        zIndex: 200,
        opacity: fade ? 0 : 1,
        pointerEvents: fade ? "none" : "auto",
        transition: "opacity 0.7s ease",
        WebkitTransition: "opacity 0.7s ease",
      }}
    >
      {/* Свечение за логотипом */}
      <div
        className="absolute rounded-full"
        style={{
          width: "300px",
          height: "300px",
          background: "radial-gradient(circle, var(--accent-glow, rgba(212,168,67,0.4)) 0%, transparent 70%)",
          filter: "blur(60px)",
          WebkitFilter: "blur(60px)",
        }}
      />

      {/* Логотип */}
      <div className="relative flex flex-col items-center">
        <span
          className="text-5xl font-bold tracking-tight mb-2"
          style={{ color: "var(--accent-bright, #f0c95c)" }}
        >
          JinnTell
        </span>
        <span
          className="text-sm uppercase tracking-[0.4em]"
          style={{ color: "var(--text-muted, rgba(245,240,232,0.4))" }}
        >
          Город джиннов
        </span>
      </div>
    </div>
  );
}
