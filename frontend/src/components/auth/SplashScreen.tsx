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
        background: "radial-gradient(125% 90% at 50% 42%, #1d160c 0%, #14110b 45%, #0a0908 100%)",
        zIndex: 200,
        opacity: fade ? 0 : 1,
        pointerEvents: fade ? "none" : "auto",
        transition: "opacity 0.7s ease",
        WebkitTransition: "opacity 0.7s ease",
        ["--accent-bright" as string]: "#e6bd57",
        ["--text-muted" as string]: "#a49d90",
      } as React.CSSProperties}
    >
      {/* Золотое свечение за логотипом */}
      <div
        className="absolute rounded-full"
        style={{
          width: "min(60vh, 460px)",
          height: "min(60vh, 460px)",
          background: "radial-gradient(circle, rgba(224,179,74,0.5) 0%, rgba(224,179,74,0.12) 38%, transparent 70%)",
          filter: "blur(60px)",
          WebkitFilter: "blur(60px)",
          opacity: 0.8,
        }}
      />

      {/* Название */}
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
          Джинны подскажут
        </span>
      </div>
    </div>
  );
}
