"use client";
import { useRef, useEffect } from "react";
import type { AgentRoomInfo } from "@/hooks/useChat";

/** Верхняя панель — лого + ЭФИР / заголовок агента */
export default function TopBar({
  onHeightChange,
  agentInfo,
  onBackToGeneral,
}: {
  onHeightChange?: (h: number) => void;
  agentInfo?: import("@/hooks/useChat").AgentRoomInfo | null;
  onBackToGeneral?: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barRef.current || !onHeightChange) return;
    const ro = new ResizeObserver(() => {
      if (barRef.current) onHeightChange(barRef.current.offsetHeight);
    });
    ro.observe(barRef.current);
    onHeightChange(barRef.current.offsetHeight);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 right-0 px-4 pt-3 pb-2"
      style={{ zIndex: 40, background: "var(--bar-bg)" }}
    >
      {/* Лого */}
      <div className="flex items-baseline gap-3 mb-1">
        <span
          className="text-[10px] uppercase tracking-[0.3em]"
          style={{ color: "var(--text-muted)" }}
        >
          JinnTell
        </span>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Город джиннов
        </h1>
      </div>

      {/* Заголовок агента (личный чат) */}
      {agentInfo ? (
        <div
          className="flex items-center gap-3 rounded-lg px-3 py-1.5 animate-fade-in"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--bg-glass-border)",
          }}
        >
          {/* Кнопка назад */}
          <button
            onClick={onBackToGeneral}
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              background: "var(--bg-glass-hover)",
              color: "var(--text-secondary)",
            }}
            title="Назад в общую комнату"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Аватар агента */}
          <div
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
            style={{
              background: `${agentInfo.color}22`,
              border: `1.5px solid ${agentInfo.color}55`,
              color: agentInfo.color,
            }}
          >
            {agentInfo.name[0]}
          </div>

          {/* Имя + профессия */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {agentInfo.name}
            </span>
            <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
              {agentInfo.profession}{agentInfo.brand ? ` • ${agentInfo.brand}` : ""}
            </span>
          </div>

          {/* online индикатор */}
          <div className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>online</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
