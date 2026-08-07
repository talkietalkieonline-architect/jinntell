"use client";
import { useEffect, useState } from "react";
import { getMyInvites, mediaUrl, type GeoInvite } from "@/services/api";

export default function InvitesModal({ onClose, onOpenAgent }: {
  onClose: () => void;
  onOpenAgent?: (agentId: number, meta?: { name?: string; color?: string }) => void;
}) {
  const [items, setItems] = useState<GeoInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getMyInvites().then((r) => { if (alive) setItems(r.items || []); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>📍 Приглашения рядом</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Гео-предложения от джиннов, которые звали тебя рядом.</p>

        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-center py-8" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока приглашений нет. Появятся, когда рядом окажется джинн с гео-промо.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((it) => (
              <div key={it.agent_id} onClick={() => onOpenAgent?.(it.agent_id, { name: it.agent_name, color: it.color })} className="rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01]" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                {it.media_url && <img src={it.media_url.startsWith("data:") || it.media_url.startsWith("http") ? it.media_url : mediaUrl(it.media_url)} alt="" className="w-full" style={{ maxHeight: 150, objectFit: "cover" }} />}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px]" style={{ background: `${it.color || "var(--accent)"}22`, border: `1.5px solid ${it.color || "var(--accent)"}` }}>🧞</span>
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{it.agent_name}</span>
                  </div>
                  {it.title && <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{it.title}</p>}
                  {it.message && <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{it.message}</p>}
                  {it.promo_code && <p className="text-[12px] mt-1.5 inline-block px-2 py-0.5 rounded-lg" style={{ background: "#e8b84a22", color: "#e8b84a", border: "1px solid #e8b84a55" }}>Промокод: {it.promo_code}</p>}
                  <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>Открыть чат →</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
