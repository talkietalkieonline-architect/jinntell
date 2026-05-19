"use client";
import { useEffect, useRef } from "react";

const MODES = ["Общение", "Прогулка", "Обучение", "Покупки", "Работа"];

const ROOMS_BY_MODE: Record<string, string[]> = {
  "Общение": ["Общая комната", "Приватная 1"],
  "Прогулка": [],
  "Обучение": ["Лекторий 1"],
  "Покупки": ["Маркетплейс", "Шоу-залы", "Скидки"],
  "Работа": [],
};

export default function LeftPanel({
  isOpen,
  onClose,
  activeMode,
  activeRoom,
  onModeChange,
  onRoomChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeMode: string;
  activeRoom: string;
  onModeChange: (mode: string) => void;
  onRoomChange: (room: string) => void;
}) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Автозакрытие через 4 сек без действия
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

  const rooms = ROOMS_BY_MODE[activeMode] || [];

  return (
    <div
      ref={panelRef}
      className="fixed top-0 left-0 bottom-0 w-48 p-3 pt-20 overflow-y-auto"
      style={{
        background: "var(--panel-bg)",
        borderRight: "1px solid var(--panel-border)",
        zIndex: 45,
        backdropFilter: "blur(20px)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.2em] mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        Режимы
      </p>
      {MODES.map((mode) => (
        <button
          key={mode}
          onClick={() => {
            onModeChange(mode);
            onClose();
          }}
          className="w-full text-left px-3 py-2.5 rounded-lg mb-1.5 text-sm transition-all"
          style={{
            background: mode === activeMode ? "var(--bg-glass-hover)" : "transparent",
            border: mode === activeMode ? "1px solid var(--accent)" : "1px solid transparent",
            color: mode === activeMode ? "var(--accent-bright)" : "var(--text-secondary)",
          }}
        >
          {mode}
        </button>
      ))}

      {rooms.length > 0 && (
        <>
          <p
            className="text-[10px] uppercase tracking-[0.2em] mb-3 mt-6"
            style={{ color: "var(--text-muted)" }}
          >
            {activeMode === "Покупки" ? "Магазины" : activeMode === "Обучение" ? "Классы" : "Комнаты"}
          </p>
          {rooms.map((room) => (
            <button
              key={room}
              onClick={() => {
                onRoomChange(room);
                onClose();
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg mb-1.5 text-sm transition-all"
              style={{
                background: room === activeRoom ? "var(--bg-glass-hover)" : "transparent",
                border: "1px solid var(--bg-glass-border)",
                color: room === activeRoom ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {room}
            </button>
          ))}
        </>
      )}

      {activeMode === "Общение" && (
        <button
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm mt-1"
          style={{
            border: "1px dashed var(--bg-glass-border)",
            color: "var(--text-muted)",
          }}
        >
          + Создать комнату
        </button>
      )}
    </div>
  );
}
