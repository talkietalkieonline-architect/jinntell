"use client";
import { useRef, useEffect, useState } from "react";
import { mediaUrl, type Presence } from "@/services/api";

export type OpenChat = { room: string; agentId: number; name: string; color: string; photo?: string | null; count?: number; online?: boolean; frame?: string | null };

/** Подпись присутствия для шапки DM: «в сети» / «был(а) N назад». */
function presenceLabel(p?: Presence | null): { text: string; online: boolean } {
  if (!p) return { text: "", online: false };
  if (p.is_online) return { text: "в сети", online: true };
  if (!p.last_seen) return { text: "не в сети", online: false };
  const diff = Date.now() - new Date(p.last_seen).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return { text: "был(а) только что", online: false };
  if (m < 60) return { text: `был(а) ${m} мин назад`, online: false };
  const h = Math.floor(m / 60);
  if (h < 24) return { text: `был(а) ${h} ч назад`, online: false };
  return { text: `был(а) ${Math.floor(h / 24)} дн назад`, online: false };
}

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
  onInvitePerson,
  assistantMuted,
  onToggleAssistant,
  dmPresence,
  onCall,
  onSelectChat,
  onCloseChat,
  onFavorites,
  onFeed,
  onSettings,
  onChatAction,
  mutedRooms,
  activeIsFav,
  userName,
  online,
  onLogout,
  onSwitchUser,
  onOpenSettings,
  onOpenOldFavorites,
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
  onInvitePerson?: () => void;
  assistantMuted?: boolean;
  onToggleAssistant?: () => void;
  dmPresence?: Presence | null;
  onCall?: () => void;
  onSelectChat: (room: string) => void;
  onCloseChat: (room: string) => void;
  onFavorites: () => void;
  onFeed: () => void;
  onSettings?: () => void;
  onChatAction?: (action: string) => void;
  mutedRooms?: string[];
  activeIsFav?: boolean;
  userName?: string | null;
  online?: boolean;
  onLogout?: () => void;
  onSwitchUser?: () => void;
  onOpenSettings?: (section?: string) => void;
  onOpenOldFavorites?: () => void;
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen && !appMenuOpen) return;
    const h = () => { setMenuOpen(false); setAppMenuOpen(false); };
    const t = setTimeout(() => document.addEventListener("click", h), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", h); };
  }, [menuOpen, appMenuOpen]);
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
      {/* Заголовок: JinnTell (меню) · имя пользователя · статус */}
      <div className="flex items-center justify-between mb-2 relative">
        <button onClick={(e) => { e.stopPropagation(); setAppMenuOpen((v) => !v); }} className="flex items-center gap-2 min-w-0 transition-opacity hover:opacity-80">
          <span className="text-[13px] uppercase tracking-[0.22em] font-bold shrink-0" style={{ color: "var(--accent)" }}>JinnTell</span>
          {userName && <span className="text-[13px] truncate" style={{ color: "var(--text-secondary)" }}>· {userName}</span>}
          <span className="text-[9px] shrink-0" style={{ color: "var(--text-muted)" }}>▾</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span title={online ? "В сети" : "Нет соединения"} className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: online ? "#3ecf6a" : "#e5484d", boxShadow: online ? "0 0 6px #3ecf6a88" : "0 0 6px #e5484d88" }} />
        </div>
        {appMenuOpen && (
          <div className="absolute left-0 top-9 rounded-xl py-1.5 px-1 animate-fade-in" style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", minWidth: 230, zIndex: 90 }} onClick={(e) => e.stopPropagation()}>
            {[
              { icon: "👤", label: "Настройки пользователя", sec: "Настройки пользователя" },
              { icon: "🎬", label: "Настройки действий", sec: "Настройки действий" },
              { icon: "🧞", label: "Настройки помощника", sec: "Настройки Помощника" },
              { icon: "🎨", label: "Настройка интерфейса", sec: "Настройка интерфейса" },
            ].map((it) => (
              <button key={it.sec} onClick={() => { setAppMenuOpen(false); onOpenSettings?.(it.sec); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-all hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}>{it.icon} {it.label}</button>
            ))}
            <div className="my-1 mx-2" style={{ borderTop: "1px solid var(--bg-glass-border)" }} />
            <button onClick={() => { setAppMenuOpen(false); onOpenOldFavorites?.(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-all hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}>⭐ Избранное (старое)</button>
            <div className="my-1 mx-2" style={{ borderTop: "1px solid var(--bg-glass-border)" }} />
            <button onClick={() => { setAppMenuOpen(false); onSwitchUser?.(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-all hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--text-secondary)" }}>🔄 Сменить пользователя</button>
            <button onClick={() => { setAppMenuOpen(false); onLogout?.(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-all hover:bg-[var(--bg-glass-hover)]" style={{ color: "var(--danger)" }}>🚪 Выход</button>
          </div>
        )}
      </div>

      {/* Шапка активного чата */}
      {view === "chat" && (() => {
        const isAssistant = activeRoom === assistantRoom;
        const isRoom = roomMembers.length > 0;
        const activeOpen = openChats.find((c) => c.room === activeRoom);
        // Помощник «с нами» — аватар в строке; тап = слушает/не слушает (mute-значок сверху, приглушение)
        const assistChip = !isAssistant ? (
          <button
            onClick={onToggleAssistant}
            title={assistantMuted ? "Помощник не слушает — включить" : "Помощник слушает — нажмите, чтобы выключить"}
            className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden transition-all"
            style={{ border: `1.5px solid ${assistantMuted ? "var(--bg-glass-border)" : "var(--accent)"}`, opacity: assistantMuted ? 0.5 : 1, background: assistantPhoto ? "transparent" : "var(--bg-glass)", color: "var(--accent)" }}
          >
            {assistantPhoto ? (
              <img src={assistantPhoto.startsWith("data:") ? assistantPhoto : mediaUrl(assistantPhoto)} alt="" className="w-full h-full object-cover" />
            ) : (
              "🧞"
            )}
            {assistantMuted ? (
              <span className="absolute -top-1 -right-1 text-[9px]">🔇</span>
            ) : (
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full" style={{ background: "#2ecc71", border: "1.5px solid var(--bar-bg)" }} />
            )}
          </button>
        ) : null;
        // «+ джинн» / «+ человек» — добавить участника в разговор (кружок появится в полосе)
        const addBtns = (
          <>
            <button onClick={onInviteJinn} title="Добавить джинна в разговор" className="shrink-0 px-2 h-9 rounded-lg text-[11px] font-medium transition-all hover:scale-105" style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "var(--accent)" }}>+ джинн</button>
            <button onClick={onInvitePerson} title="Добавить человека в разговор" className="shrink-0 px-2 h-9 rounded-lg text-[11px] font-medium transition-all hover:scale-105" style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>+ человек</button>
          </>
        );
        // ✕ — закрыть чат и вернуться на главный («поговорили — закрыли крестиком»)
        const closeBtn = (
          <button
            onClick={onFeed}
            title="Закрыть чат"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}
          >
            ✕
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
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {assistChip}
                {addBtns}
                {renderMenu("room")}
                {closeBtn}
              </div>
            </div>
          );
        }
        const name = isAssistant ? assistantName : (activeAgent?.name || activeOpen?.name || "Джинн");
        const isDm = activeRoom.startsWith("dm-");
        const pres = isDm ? presenceLabel(dmPresence) : null;
        const sub = isAssistant
          ? "ваш помощник"
          : isDm
          ? (pres?.text || "")
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
              {sub && (
                <span className="text-[10px] truncate flex items-center gap-1" style={{ color: pres?.online ? "#2ecc71" : "var(--text-muted)" }}>
                  {isDm && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pres?.online ? "#2ecc71" : "#8a8a8a" }} />}
                  {sub}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {isAssistant ? (
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>online</span></div>
              ) : (
                <>
                  {assistChip}
                  {addBtns}
                  {activeRoom.startsWith("dm-") && (
                    <button onClick={onCall} title="Видеозвонок" className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: "var(--bg-glass-hover)", border: "1px solid var(--bg-glass-border)", color: "#2ecc71" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                    </button>
                  )}
                </>
              )}
              {renderMenu(isAssistant ? "assistant" : activeRoom.startsWith("dm-") ? "dm" : "jinn")}
              {closeBtn}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
