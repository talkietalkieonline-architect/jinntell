"use client";
import { useEffect, useState } from "react";
import { getFeed, dismissFeed, getChannelsUnread, type FeedEvent, type ChannelUnread } from "@/services/api";

const KIND_ICON: Record<string, string> = { info: "ℹ️", reminder: "⏰", offer: "🏷️", event: "📅" };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

export default function FeedModal({ onClose, onOpenChat }: { onClose: () => void; onOpenChat?: (room: string) => void }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [channels, setChannels] = useState<ChannelUnread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getFeed().then((l) => { if (alive) setEvents(l); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    getChannelsUnread().then((c) => { if (alive) setChannels(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleDismiss = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try { await dismissFeed(id); } catch { /* noop */ }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[600px] max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>🔔 Лента</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>

        <div className="flex flex-col gap-3">
          {channels.map((ch) => (
            <button key={ch.agent_id} onClick={() => { onOpenChat?.(ch.link_room); onClose(); }} className="rounded-2xl p-3.5 flex items-center gap-3 text-left transition-all hover:scale-[1.01]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: `${ch.color}22`, border: `1.5px solid ${ch.color}55`, color: ch.color }}>📰</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{ch.unread} непрочитанных новостей →</p>
              </div>
              <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>{ch.unread}</span>
            </button>
          ))}

          {loading ? (
            <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
          ) : events.length === 0 && channels.length === 0 ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
              <p className="text-[13px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока тихо. Важные события появятся здесь.</p>
            </div>
          ) : (
            events.map((e) => {
              const clickable = !!e.link_room && !!onOpenChat;
              return (
                <div key={e.id} onClick={() => { if (clickable) { onOpenChat!(e.link_room!); onClose(); } }} className={`rounded-2xl p-3.5 relative transition-all ${clickable ? "cursor-pointer hover:scale-[1.01]" : ""}`} style={{ background: "var(--bg-glass)", border: `1px solid ${e.is_read ? "var(--bg-glass-border)" : "var(--accent)"}` }}>
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
    </div>
  );
}
