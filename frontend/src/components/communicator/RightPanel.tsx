"use client";
import { useEffect, useRef, useState } from "react";

interface Participant {
  id: string;
  name: string;
  role: string;
  color: string;
  isAssistant?: boolean;
  active: boolean;
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: "jim",
    name: "Помощник",
    role: "Помощник",
    color: "var(--accent)",
    isAssistant: true,
    active: true,
  },
  {
    id: "news",
    name: "Новости",
    role: "Агент",
    color: "#64b4ff",
    active: true,
  },
];

export default function RightPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [participants, setParticipants] = useState(DEFAULT_PARTICIPANTS);

  // Автозакрытие через 4 сек
  useEffect(() => {
    if (!isOpen) return;
    const startTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onClose, 4000);
    };
    startTimer();

    const panel = panelRef.current;
    const resetTimer = () => startTimer();
    panel?.addEventListener("mousemove", resetTimer);
    panel?.addEventListener("touchstart", resetTimer);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      panel?.removeEventListener("mousemove", resetTimer);
      panel?.removeEventListener("touchstart", resetTimer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Короткое нажатие — вкл/выкл
  const toggleParticipant = (id: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
  };

  return (
    <div
      ref={panelRef}
      className="fixed top-0 right-0 bottom-0 w-48 p-3 pt-20 overflow-y-auto"
      style={{
        background: "var(--panel-bg)",
        borderLeft: "1px solid var(--panel-border)",
        zIndex: 45,
        backdropFilter: "blur(20px)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.2em] mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        Команда эфира
      </p>

      {participants.map((p) => (
        <div
          key={p.id}
          className="flex flex-col items-center mb-4 cursor-pointer transition-all"
          onClick={() => !p.isAssistant && toggleParticipant(p.id)}
          style={{
            opacity: p.active ? 1 : 0.35,
            filter: p.active ? "none" : "grayscale(100%)",
          }}
        >
          <div
            className="rounded-full flex items-center justify-center font-bold mb-1.5 transition-all"
            style={{
              width: p.isAssistant ? "56px" : "48px",
              height: p.isAssistant ? "56px" : "48px",
              fontSize: p.isAssistant ? "18px" : "14px",
              background: p.isAssistant
                ? `linear-gradient(135deg, ${p.color}, var(--accent-bright))`
                : `${p.color}22`,
              border: p.isAssistant ? "none" : `1.5px solid ${p.color}44`,
              color: p.isAssistant ? "var(--bg-deep)" : p.color,
              boxShadow: p.isAssistant && p.active ? "0 0 20px var(--accent-glow)" : "none",
            }}
          >
            {p.name[0]}
          </div>
          <span
            className="text-xs font-medium"
            style={{ color: p.isAssistant ? "var(--accent)" : "var(--text-secondary)" }}
          >
            {p.name}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {p.role}
          </span>
          {!p.isAssistant && (
            <span className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {p.active ? "нажми — выкл" : "нажми — вкл"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
