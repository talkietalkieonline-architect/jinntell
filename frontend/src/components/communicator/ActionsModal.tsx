"use client";
import { useEffect, useState } from "react";
import { getMyActivity, type MyActivityItem } from "@/services/api";

const ACTION_LABEL: Record<string, string> = {
  "assistant.command": "Команда помощнику",
  "assistant.act": "Действие помощника",
  "chat.open": "Открыт чат",
  "chat.close": "Закрыт чат",
  "chat.summon": "Позван джинн",
  "call.start": "Звонок",
  "flow.open": "Открыт Поток",
  "favorite.add": "Добавлен в избранное",
};
function label(a: string) { return ACTION_LABEL[a] || a; }

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} дн`;
}

export default function ActionsModal({ onClose, assistantName }: { onClose: () => void; assistantName: string }) {
  const [items, setItems] = useState<MyActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getMyActivity().then((r) => { if (alive) setItems(r.items); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] max-h-[82vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>📋 Действия · {assistantName}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Что помощник делал для тебя — прозрачная память действий.</p>

        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-center py-8" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пока помощник ничего не делал.</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="py-2.5 flex items-start gap-3" style={{ borderTop: "1px solid var(--bg-glass-border)" }}>
              <span className="text-base mt-0.5">{it.actor === "assistant" ? "🧞" : "👤"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label(it.action)}{it.result ? ` · ${it.result}` : ""}</span>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{ago(it.created_at)}</span>
                </div>
                {(it.detail || it.target_name) && <p className="text-[12px] mt-0.5 leading-snug break-words" style={{ color: "var(--text-secondary)" }}>{it.detail || it.target_name}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
