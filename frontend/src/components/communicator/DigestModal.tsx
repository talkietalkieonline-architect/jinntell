"use client";
import { useEffect, useState } from "react";
import { getDigest, deleteDigest, type DigestFull } from "@/services/api";

export default function DigestModal({ digestId, onClose, onOpenAgent, onDeleted }: {
  digestId: number;
  onClose: () => void;
  onOpenAgent?: (agentId: number, meta?: { name?: string; color?: string }) => void;
  onDeleted?: (id: number) => void;
}) {
  const [data, setData] = useState<DigestFull | null>(null);
  const [loading, setLoading] = useState(true);
  // Документ, написанный самим помощником (не опрос джиннов): у всех секций нет agent_id.
  const isDoc = !!data && data.sections.length > 0 && data.sections.every((s) => !s.agent_id);

  useEffect(() => {
    let alive = true;
    getDigest(digestId).then((d) => { if (alive) setData(d); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [digestId]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[600px] max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>📑 {data?.query || "Подборка"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>{isDoc ? "Документ от помощника." : "Собрано помощником из мнений джиннов Города. Под каждым — кто ответил; тапни, чтобы уточнить у него."}</p>

        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : !data || data.sections.length === 0 ? (
          <p className="text-[13px] text-center py-8" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Подборка пуста.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.sections.map((s, i) => (
              <div key={i} className="rounded-2xl p-3.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{s.text}</p>
                {s.agent_id ? (
                  <button
                    onClick={() => onOpenAgent?.(s.agent_id, { name: s.agent_name, color: s.color })}
                    className="mt-2.5 flex items-center gap-2 text-[12px] font-semibold transition-all hover:opacity-80"
                    style={{ color: s.color || "var(--accent)" }}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: `${s.color || "var(--accent)"}22`, border: `1.5px solid ${s.color || "var(--accent)"}` }}>🧞</span>
                    {s.agent_name} · спросить →
                  </button>
                ) : (
                  <p className="mt-2.5 text-[12px] font-semibold" style={{ color: s.color || "var(--accent)" }}>— {s.agent_name}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {data && (
          <button onClick={async () => { try { await deleteDigest(data.id); } catch { /* noop */ } onDeleted?.(data.id); onClose(); }} className="w-full mt-4 py-2 rounded-xl text-[12px]" style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}>
            {isDoc ? "Удалить документ" : "Удалить подборку"}
          </button>
        )}
      </div>
    </div>
  );
}
