"use client";
import { useRef, useEffect } from "react";
import { mediaUrl } from "@/services/api";

export type OpenChat = { room: string; agentId: number; name: string; color: string; photo?: string | null; count?: number; online?: boolean };

/** Верхняя панель + горизонтальная лента открытых чатов (вместо боковых створок). */
export default function NavBar({
  onHeightChange,
  assistantName,
  assistantPhoto,
  assistantRoom,
  openChats,
  activeRoom,
  view,
  activeAgent,
  roomMembers,
  onInviteJinn,
  onSelectChat,
  onCloseChat,
  onFavorites,
  onFeed,
}: {
  onHeightChange?: (h: number) => void;
  assistantName: string;
  assistantPhoto?: string | null;
  assistantRoom: string;
  openChats: OpenChat[];
  activeRoom: string;
  view: "feed" | "chat";
  activeAgent: { name: string; profession: string; brand: string; color: string; photo_url?: string } | null;
  roomMembers: { id: number; name: string; color: string; photo_url?: string }[];
  onInviteJinn: () => void;
  onSelectChat: (room: string) => void;
  onCloseChat: (room: string) => void;
  onFavorites: () => void;
  onFeed: () => void;
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

  const isActive = (room: string) => view === "chat" && activeRoom === room;

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 right-0 px-3 pt-3 pb-2"
      style={{ zIndex: 40, background: "var(--bar-bg)" }}
    >
      {/* Панель: лого + иконки */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[11px] uppercase tracking-[0.3em] font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          JinnTell
        </span>
        <div className="flex items-center gap-1.5">
          <PanelBtn title="Собеседники" onClick={onFavorites}>
            ☆
          </PanelBtn>
          <PanelBtn active={view === "feed"} title="Лента" onClick={onFeed}>
            🔔
          </PanelBtn>
        </div>
      </div>

      {/* Лента открытых чатов */}
      <div className="flex items-end gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {/* Помощник — закреплён первым */}
        <ChatAvatar
          active={isActive(assistantRoom)}
          name={assistantName}
          color="var(--accent)"
          photo={assistantPhoto}
          onClick={() => onSelectChat(assistantRoom)}
        />
        {openChats.map((c) => (
          <ChatAvatar
            key={c.room}
            active={isActive(c.room)}
            name={c.name}
            color={c.color}
            photo={c.photo}
            count={c.count}
            online={c.online}
            onClick={() => onSelectChat(c.room)}
            onClose={() => onCloseChat(c.room)}
          />
        ))}
      </div>

      {/* Шапка активного чата */}
      {view === "chat" && (() => {
        const isAssistant = activeRoom === assistantRoom;
        const isRoom = roomMembers.length > 0;
        const activeOpen = openChats.find((c) => c.room === activeRoom);
        const inviteBtn = (
          <button
            onClick={onInviteJinn}
            title="Позвать джинна"
            className="ml-auto shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium transition-all hover:scale-105"
            style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "var(--accent)" }}
          >
            + джинн
          </button>
        );
        if (isRoom) {
          return (
            <div
              className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-1.5"
              style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
            >
              <div className="flex shrink-0">
                {roomMembers.slice(0, 3).map((m, i) => (
                  <div
                    key={m.id}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold overflow-hidden"
                    style={{ background: m.photo_url ? "transparent" : "var(--bg-glass)", border: `1.5px solid ${m.color}`, color: m.color, marginLeft: i === 0 ? 0 : -10 }}
                  >
                    {m.photo_url ? (
                      <img src={m.photo_url.startsWith("data:") ? m.photo_url : mediaUrl(m.photo_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.name[0]
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{roomMembers.map((m) => m.name).join(" + ")}</span>
                <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>комната • {roomMembers.length} джиннов</span>
              </div>
              {inviteBtn}
            </div>
          );
        }
        const name = isAssistant ? assistantName : (activeAgent?.name || activeOpen?.name || "Джинн");
        const sub = isAssistant
          ? "ваш помощник"
          : [activeAgent?.profession, activeAgent?.brand].filter(Boolean).join(" • ");
        const color = isAssistant ? "var(--accent)" : (activeAgent?.color || activeOpen?.color || "var(--accent)");
        const photo = isAssistant ? assistantPhoto : (activeAgent?.photo_url || activeOpen?.photo || null);
        return (
          <div
            className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-1.5"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
          >
            <div
              className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold overflow-hidden"
              style={{ background: photo ? "transparent" : "var(--bg-glass)", border: `1.5px solid ${color}`, color }}
            >
              {photo ? (
                <img src={photo.startsWith("data:") ? photo : mediaUrl(photo)} alt="" className="w-full h-full object-cover" />
              ) : isAssistant ? (
                "\uD83E\uDDDE"
              ) : (
                name[0]
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{name}</span>
              {sub && <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{sub}</span>}
            </div>
            {isAssistant ? (
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>online</span>
              </div>
            ) : (
              inviteBtn
            )}
          </div>
        );
      })()}
    </div>
  );
}

function PanelBtn({
  children,
  title,
  active = false,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] transition-all hover:scale-110 active:scale-95"
      style={{
        background: active ? "var(--bg-glass-hover)" : "var(--bg-glass)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--bg-glass-border)",
      }}
    >
      {children}
    </button>
  );
}

function ChatAvatar({
  active,
  name,
  color,
  photo,
  onClick,
  onClose,
  count,
  online,
}: {
  active: boolean;
  name: string;
  color: string;
  photo?: string | null;
  onClick: () => void;
  onClose?: () => void;
  count?: number;
  online?: boolean;
}) {
  const size = active ? 54 : 42;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0 relative" style={{ width: 62 }}>
      <button
        onClick={onClick}
        className="rounded-full flex items-center justify-center font-bold transition-all overflow-hidden"
        style={{
          width: size,
          height: size,
          background: photo ? "transparent" : "var(--bg-glass)",
          border: active ? `2px solid ${color}` : "1.5px solid var(--bg-glass-border)",
          color,
        }}
      >
        {photo ? (
          <img
            src={photo.startsWith("data:") ? photo : mediaUrl(photo)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          name[0]
        )}
      </button>
      {onClose && active && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Закрыть чат"
          className="absolute top-0 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
          style={{
            background: "var(--bg-glass-hover)",
            border: "1px solid var(--bg-glass-border)",
            color: "var(--text-muted)",
          }}
        >
          ✕
        </button>
      )}
      {count && count > 1 ? (
        <span
          className="absolute top-0 left-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[8px] font-bold"
          style={{ background: "var(--accent)", color: "var(--bg-deep)" }}
        >
          {count}
        </span>
      ) : null}
      {online !== undefined && (
        <span
          className="absolute rounded-full"
          style={{ top: active ? 44 : 32, right: active ? 6 : 10, width: 9, height: 9, background: online ? "#2ecc71" : "#8a8a8a", border: "1.5px solid var(--bar-bg)" }}
        />
      )}
      <span
        className="text-[9px] truncate max-w-[58px] text-center"
        style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {name}
      </span>
    </div>
  );
}
