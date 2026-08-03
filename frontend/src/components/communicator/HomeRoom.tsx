"use client";
import { useEffect, useState, type ReactNode } from "react";
import { getFeed, dismissFeed, getChannelsUnread, mediaUrl, type FeedEvent, type ChannelUnread } from "@/services/api";
import { type OpenChat } from "@/components/communicator/NavBar";

interface Props {
  topPad: number;
  bottomPad: number;
  assistantName: string;
  assistantPhoto?: string | null;
  openChats?: OpenChat[];
  onOpenAssistant: () => void;
  onOpenFlow?: () => void;
  onOpenChat?: (room: string) => void;
}

// Кружок (коллекция или разговор): аватар/эмодзи + подпись
function Circle({ label, photo, color, emoji, pinned, badge, onClick }: {
  label: string; photo?: string | null; color?: string; emoji?: string; pinned?: boolean; badge?: number; onClick?: () => void;
}) {
  const src = photo ? (photo.startsWith("http") || photo.startsWith("data:") || photo.startsWith("blob:") ? photo : mediaUrl(photo)) : null;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 shrink-0 w-[64px] transition-transform hover:scale-105">
      <div className="relative w-14 h-14 rounded-full flex items-center justify-center overflow-hidden" style={{ border: pinned ? "2px solid var(--accent)" : `2px solid ${color || "var(--bg-glass-border)"}`, background: color ? `${color}22` : "var(--bg-glass)" }}>
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">{emoji || "💬"}</span>}
        {!!badge && badge > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{badge}</span>}
      </div>
      <span className="text-[10px] leading-tight truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </button>
  );
}

// Полоса — заголовок + горизонтальный скролл кружков
function Strip({ title, children, empty }: { title: string; children: ReactNode; empty?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.15em] mb-1.5 px-1 font-semibold" style={{ color: "var(--text-muted)" }}>{title}</div>
      <div className="flex gap-3 overflow-x-auto pb-1.5 home-strip" style={{ scrollbarWidth: "none" }}>
        {children}
        {empty && <span className="text-[11px] self-center px-2" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{empty}</span>}
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, string> = {
  info: "ℹ️",
  reminder: "⏰",
  offer: "🏷️",
  event: "📅",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

export default function HomeRoom({ topPad, bottomPad, assistantName, assistantPhoto, openChats = [], onOpenAssistant, onOpenFlow, onOpenChat }: Props) {
  const jinnChats = openChats.filter((c) => c.room.startsWith("agent-") || c.room.startsWith("room-"));
  const peopleChats = openChats.filter((c) => c.room.startsWith("dm-"));
  const [hint, setHint] = useState("");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [channels, setChannels] = useState<ChannelUnread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getFeed().then((list) => { if (alive) setEvents(list); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
      getChannelsUnread().then((c) => { if (alive) setChannels(c); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 20000);
    const onPing = () => load();
    window.addEventListener("jinntell_feed_ping", onPing);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("jinntell_feed_ping", onPing); };
  }, []);

  const handleDismiss = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try { await dismissFeed(id); } catch { /* noop */ }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto flex justify-center" style={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 12 }}>
      <div className="w-full max-w-[620px] px-4 flex flex-col gap-4">
        {/* ПОЛОСА 1 — Коллекции (Поток и Помощник закреплены, далее Лента, Приглашения, Действия) */}
        <Strip title="Ленты и подборки">
          <Circle label="Поток" emoji="🌀" pinned onClick={onOpenFlow} />
          <Circle label={assistantName} photo={assistantPhoto} emoji="🧞" pinned onClick={onOpenAssistant} />
          <Circle label="Лента" emoji="🔔" color="#5ea0e8" onClick={() => { const el = document.getElementById("home-feed"); el?.scrollIntoView({ behavior: "smooth" }); }} />
          <Circle label="Приглашения" emoji="📍" color="#c0563a" onClick={() => setHint("«Приглашения» — здесь появятся гео-предложения рядом (гео-промо). Экран в разработке.")} />
          <Circle label="Действия" emoji="📋" color="#4a9e7f" onClick={() => setHint("«Действия помощника» — журнал того, что делал помощник. Экран в разработке.")} />
        </Strip>
        {hint && (
          <div onClick={() => setHint("")} className="rounded-xl px-3 py-2 text-[12px] cursor-pointer" style={{ background: "var(--bg-glass)", border: "1px solid var(--accent)", color: "var(--text-secondary)" }}>
            {hint} <span style={{ color: "var(--text-muted)" }}>· закрыть</span>
          </div>
        )}

        {/* ПОЛОСА 2 — Джинны (чаты и комнаты) */}
        <Strip title="Джинны" empty={jinnChats.length === 0 ? "пока пусто — найди джинна в Городе" : undefined}>
          {jinnChats.map((c) => (
            <Circle key={c.room} label={c.name} photo={c.photo} color={c.color} emoji="🧞" badge={c.count} onClick={() => onOpenChat?.(c.room)} />
          ))}
        </Strip>

        {/* ПОЛОСА 3 — Люди */}
        <Strip title="Люди" empty={peopleChats.length === 0 ? "пока нет диалогов" : undefined}>
          {peopleChats.map((c) => (
            <Circle key={c.room} label={c.name} photo={c.photo} color={c.color} emoji="👤" badge={c.count} onClick={() => onOpenChat?.(c.room)} />
          ))}
        </Strip>

        {/* Заголовок Ленты */}
        <div id="home-feed" className="flex items-center gap-2 px-1 pt-1">
          <span className="text-base">🔔</span>
          <span className="text-[12px] uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--text-muted)" }}>Лента</span>
        </div>

        {/* Приветствие помощника */}
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>🧞</div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{assistantName}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>ваш помощник</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Здесь важное: напоминания, события и сообщения от джиннов. Чтобы задать вопрос — откройте чат.
          </p>
          <button onClick={onOpenAssistant} className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
            Чат с {assistantName}
          </button>
        </div>

        {/* Непрочитанное по каналам */}
        {channels.map((ch) => (
          <button key={ch.agent_id} onClick={() => onOpenChat?.(ch.link_room)} className="rounded-2xl p-3.5 flex items-center gap-3 text-left transition-all hover:scale-[1.01]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: `${ch.color}22`, border: `1.5px solid ${ch.color}55`, color: ch.color }}>📰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{ch.unread} непрочитанных новостей →</p>
            </div>
            <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{ch.unread}</span>
          </button>
        ))}

        {/* События */}
        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : events.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <p className="text-[13px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока тихо. Важные события появятся здесь.</p>
          </div>
        ) : (
          events.map((e) => {
            const clickable = !!e.link_room && !!onOpenChat;
            return (
              <div
                key={e.id}
                onClick={() => { if (clickable) onOpenChat!(e.link_room!); }}
                className={`rounded-2xl p-3.5 relative transition-all ${clickable ? "cursor-pointer hover:scale-[1.01]" : ""}`}
                style={{ background: "var(--bg-glass)", border: `1px solid ${e.is_read ? "var(--bg-glass-border)" : "var(--accent)"}` }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{e.icon || KIND_ICON[e.kind] || "ℹ️"}</span>
                  <div className="min-w-0 flex-1 pr-5">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{e.title}</p>
                    {e.body && <p className="text-[13px] mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>{e.body}</p>}
                    <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>{timeAgo(e.created_at)}{clickable ? " · открыть чат →" : ""}</p>
                  </div>
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); handleDismiss(e.id); }} title="Убрать" className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: "var(--bg-glass-hover)", color: "var(--text-muted)" }}>✕</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
