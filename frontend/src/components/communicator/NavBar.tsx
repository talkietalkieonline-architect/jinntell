"use client";
import { useRef, useEffect, useState } from "react";
import { mediaUrl } from "@/services/api";

import { FrameDeco, frameRing } from "@/components/communicator/avatarFrame";
export type OpenChat = { room: string; agentId: number; name: string; color: string; photo?: string | null; count?: number; online?: boolean; frame?: string | null };

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
  onCall,
  onSelectChat,
  onCloseChat,
  onFavorites,
  onFeed,
  onSettings,
  onChatAction,
  mutedRooms,
  activeIsFav,
}: {
  onHeightChange?: (h: number) => void;
  assistantName: string;
  assistantPhoto?: string | null;
  assistantRoom: string;
  openChats: OpenChat[];
  activeRoom: string;
  view: "feed" | "chat" | "flow";
  activeAgent: { name: string; profession: string; brand: string; color: string; photo_url?: string } | null;
  roomMembers: { id: number; name: string; color: string; photo_url?: string }[];
  onInviteJinn: () => void;
  onCall?: () => void;
  onSelectChat: (room: string) => void;
  onCloseChat: (room: string) => void;
  onFavorites: () => void;
  onFeed: () => void;
  onSettings?: () => void;
  onChatAction?: (action: string) => void;
  mutedRooms?: string[];
  activeIsFav?: boolean;
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

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const h = () => setMenuOpen(false);
    const t = setTimeout(() => document.addEventListener("click", h), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", h); };
  }, [menuOpen]);
  const CHAT_MENU: Record<string, { a: string; label: string; danger?: boolean }[]> = {
    assistant: [ { a: "settings", label: "⚙️ Настройки помощника" }, { a: "search", label: "🔍 Поиск по чату" }, { a: "clear", label: "🧹 Очистить историю" } ],
    dm: [ { a: "wallpaper", label: "🖼 Сменить обои" }, { a: "search", label: "🔍 Поиск по чату" }, { a: "mute", label: "🔕 Приглушить" }, { a: "clear", label: "🧹 Очистить историю" }, { a: "close", label: "🗑 Удалить чат", danger: true } ],
    jinn: [ { a: "share", label: "🔗 Поделиться ссылкой" }, { a: "fav", label: activeIsFav ? "⭐ Убрать из избранного" : "⭐ В избранное" }, { a: "search", label: "🔍 Поиск по чату" }, { a: "mute", label: "🔕 Приглушить" }, { a: "report", label: "⚠️ Пожаловаться", danger: true }, { a: "close", label: "❌ Закрыть чат" } ],
    room: [ { a: "invite", label: "➕ Добавить джинна" }, { a: "search", label: "🔍 Поиск по чату" }, { a: "clear", label: "🧹 Очистить историю" }, { a: "close", label: "🚪 Закрыть комнату" } ],
  };
  const renderMenu = (type: string) => (
    <div className="relative shrink-0">
      <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} title="Меню чата" className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80" style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-11 rounded-xl py-1.5 px-1 animate-fade-in" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", minWidth: 200, zIndex: 80 }} onClick={(e) => e.stopPropagation()}>
          {(CHAT_MENU[type] || []).map((it) => (
            <button key={it.a} onClick={() => { setMenuOpen(false); onChatAction?.(it.a); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-all hover:bg-[var(--bg-glass-hover)]" style={{ color: it.danger ? "var(--danger)" : "var(--text-secondary)" }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );

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
          <PanelBtn title="Настройки" onClick={() => onSettings?.()}>
            ⚙️
          </PanelBtn>
        </div>
      </div>

      {/* Лента открытых чатов: помощник закреплён слева, остальные скроллятся */}
      <div className="flex items-end gap-2 px-1">
        {/* Помощник — всегда первый, не уезжает при скролле */}
        <div className="shrink-0">
          <ChatAvatar
            active={isActive(assistantRoom)}
            name={assistantName}
            color="var(--accent)"
            photo={assistantPhoto}
            onClick={() => onSelectChat(assistantRoom)}
          />
        </div>
        {/* Полоса открытых чатов — только в чате (на главном она дублирует полосы дома) */}
        {view !== "feed" && openChats.length > 0 && (
          <div className="w-px self-stretch my-1 shrink-0" style={{ background: "var(--bg-glass-border)" }} />
        )}
        {view !== "feed" && (
          <div className="flex items-end gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {openChats.map((c) => (
              <ChatAvatar
                key={c.room}
                active={isActive(c.room)}
                name={c.name}
                color={c.color}
                photo={c.photo}
                frame={c.frame}
                count={c.count}
                online={c.online}
                muted={mutedRooms?.includes(c.room)}
                onClick={() => onSelectChat(c.room)}
                onClose={() => onCloseChat(c.room)}
              />
            ))}
          </div>
        )}
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
              {renderMenu("room")}
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
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {isAssistant ? (
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>online</span></div>
              ) : activeRoom.startsWith("dm-") ? (
                <button onClick={onCall} title="Видеозвонок" className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "#2ecc71" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                </button>
              ) : null}
              {renderMenu(isAssistant ? "assistant" : activeRoom.startsWith("dm-") ? "dm" : "jinn")}
            </div>
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
  frame,
  onClick,
  onClose,
  count,
  online,
  muted,
}: {
  active: boolean;
  name: string;
  color: string;
  photo?: string | null;
  frame?: string | null;
  onClick: () => void;
  onClose?: () => void;
  count?: number;
  online?: boolean;
  muted?: boolean;
}) {
  const size = active ? 54 : 42;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0 relative" style={{ width: 62 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <button
          onClick={onClick}
          className="rounded-full flex items-center justify-center font-bold transition-all overflow-hidden"
          style={{
            width: size,
            height: size,
            background: photo ? "transparent" : "var(--bg-glass)",
            border: active ? `2px solid ${color}` : "1.5px solid var(--bg-glass-border)",
            color,
            boxShadow: frameRing(frame),
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
        <FrameDeco frame={frame} size={size} />
      </div>
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
      {count && count > 0 ? (
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
      {muted && (
        <span className="absolute" style={{ top: active ? 40 : 28, left: active ? 4 : 8, fontSize: 11, lineHeight: 1 }}>🔕</span>
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
