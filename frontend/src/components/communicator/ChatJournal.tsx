"use client";
import { mediaUrl } from "@/services/api";
import type { OpenChat } from "./NavBar";

/** Журнал чатов в полосе помощника: открытые + закрытые (с быстрым возвратом). */
export default function ChatJournal({
  openChats,
  archivedChats,
  onSelect,
  onReopen,
}: {
  openChats: OpenChat[];
  archivedChats: OpenChat[];
  onSelect: (room: string) => void;
  onReopen: (room: string) => void;
}) {
  const Row = ({ c, action, onClick }: { c: OpenChat; action: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 transition-all hover:scale-[1.01]"
      style={{ background: "var(--bg-glass-hover)" }}
    >
      <div
        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold overflow-hidden"
        style={{ background: c.photo ? "transparent" : "var(--bg-glass)", border: `1.5px solid ${c.color}`, color: c.color }}
      >
        {c.photo ? (
          <img src={c.photo.startsWith("data:") ? c.photo : mediaUrl(c.photo)} alt="" className="w-full h-full object-cover" />
        ) : (
          c.name[0]
        )}
      </div>
      <span className="text-[13px] font-medium truncate flex-1 text-left" style={{ color: "var(--text-primary)" }}>{c.name}</span>
      <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }}>{action}</span>
    </button>
  );

  return (
    <div
      className="rounded-2xl p-3 w-full flex flex-col gap-2"
      style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}
    >
      <p className="text-[12px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Журнал чатов</p>

      {openChats.length === 0 && archivedChats.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
          Здесь будут ваши чаты с джиннами — открытые и закрытые, с быстрым возвратом.
        </p>
      ) : (
        <>
          {openChats.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Открытые</p>
              {openChats.map((c) => (
                <Row key={c.room} c={c} action="открыть →" onClick={() => onSelect(c.room)} />
              ))}
            </div>
          )}
          {archivedChats.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Закрытые</p>
              {archivedChats.map((c) => (
                <Row key={c.room} c={c} action="вернуть ↩" onClick={() => onReopen(c.room)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
