"use client";
import { useEffect, useState } from "react";
import { getFeed, dismissFeed, type FeedEvent } from "@/services/api";

interface Props {
  topPad: number;
  bottomPad: number;
  assistantName: string;
  onOpenAssistant: () => void;
  onOpenChat?: (room: string) => void;
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

export default function HomeRoom({ topPad, bottomPad, assistantName, onOpenAssistant, onOpenChat }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getFeed()
      .then((list) => { if (alive) setEvents(list); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const handleDismiss = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try { await dismissFeed(id); } catch { /* noop */ }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 12 }}>
      <div className="w-full max-w-[620px] mx-auto px-4 flex flex-col gap-3">
        {/* Заголовок Ленты */}
        <div className="flex items-center gap-2 px-1 pt-1">
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
