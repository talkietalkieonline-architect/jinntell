"use client";
import { useEffect, useState } from "react";
import { getDigest, deleteDigest, shareDigest, getContacts, mediaUrl, type DigestFull, type ContactOut } from "@/services/api";

const KIND_EMOJI: Record<string, string> = { doc: "📑", image: "🖼", video: "🎬", file: "📎", link: "🔗" };
function _mediaHref(u: string) { return (u.startsWith("http") || u.startsWith("data:")) ? u : mediaUrl(u); }

export default function DigestModal({ digestId, onClose, onOpenAgent, onDeleted }: {
  digestId: number;
  onClose: () => void;
  onOpenAgent?: (agentId: number, meta?: { name?: string; color?: string }) => void;
  onDeleted?: (id: number) => void;
}) {
  const [data, setData] = useState<DigestFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactOut[]>([]);
  const [shareBusy, setShareBusy] = useState<number | null>(null);
  const openShare = () => { setShareOpen((v) => !v); if (contacts.length === 0) getContacts().then(setContacts).catch(() => {}); };
  const doShare = async (c: ContactOut) => {
    setShareBusy(c.id);
    try { await shareDigest(digestId, c.id); setShareOpen(false); alert(`Отправлено: ${c.display_name}`); }
    catch (e) { alert(e instanceof Error ? e.message : "Не удалось поделиться"); }
    finally { setShareBusy(null); }
  };
  const kind = data?.kind || "doc";
  const isMedia = !!data && kind !== "doc" && !!data.media_url;
  // Документ, написанный самим помощником (не опрос джиннов): у всех секций нет agent_id.
  const isDoc = !isMedia && !!data && data.sections.length > 0 && data.sections.every((s) => !s.agent_id);

  useEffect(() => {
    let alive = true;
    getDigest(digestId).then((d) => { if (alive) setData(d); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [digestId]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[600px] max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{KIND_EMOJI[kind] || "📑"} {data?.query || "Портфель"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>{isMedia ? (data?.source_agent_name ? `Результат от «${data.source_agent_name}».` : "Результат работы джинна.") : isDoc ? "Документ от помощника." : "Собрано помощником из мнений джиннов Города. Под каждым — кто ответил; тапни, чтобы уточнить у него."}</p>

        {isMedia && data?.media_url && (
          <div className="mb-3">
            {kind === "image" && <img src={_mediaHref(data.media_url)} alt="" className="w-full rounded-xl" style={{ maxHeight: "60vh", objectFit: "contain", background: "var(--bg-glass)" }} />}
            {kind === "video" && <video src={_mediaHref(data.media_url)} controls className="w-full rounded-xl" style={{ maxHeight: "60vh", background: "#000" }} />}
            {(kind === "file" || kind === "link") && (
              <a href={_mediaHref(data.media_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl p-3 text-sm font-semibold" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--accent)" }}>
                {KIND_EMOJI[kind]} Открыть {kind === "file" ? "файл" : "ссылку"} →
              </a>
            )}
            {data.sections?.[0]?.text && <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{data.sections[0].text}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-[13px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.55 }}>Загрузка…</p>
        ) : isMedia ? null : !data || data.sections.length === 0 ? (
          <p className="text-[13px] text-center py-8" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Пусто.</p>
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
          <button onClick={openShare} className="w-full mt-4 py-2 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "var(--bg-deep)" }}>
            📤 Поделиться
          </button>
        )}
        {shareOpen && (
          <div className="mt-2 rounded-xl p-2 max-h-52 overflow-y-auto" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
            <div className="text-[11px] px-1 pb-1" style={{ color: "var(--text-muted)" }}>Кому отправить (из контактов):</div>
            {contacts.length === 0 && <div className="text-[11px] px-1 py-2" style={{ color: "var(--text-muted)", opacity: 0.7 }}>Нет контактов.</div>}
            {contacts.map((c) => (
              <button key={c.id} onClick={() => doShare(c)} disabled={shareBusy === c.id} className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-all hover:bg-[var(--bg-glass-hover)]">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] overflow-hidden shrink-0" style={{ background: `${c.avatar_color || "var(--accent)"}22`, border: `1.5px solid ${c.avatar_color || "var(--accent)"}` }}>{c.avatar_url ? <img src={c.avatar_url.startsWith("data:") ? c.avatar_url : mediaUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" /> : "👤"}</span>
                <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{c.display_name}</span>
                <span className="ml-auto text-[11px]" style={{ color: "var(--accent)" }}>{shareBusy === c.id ? "…" : "отправить"}</span>
              </button>
            ))}
          </div>
        )}
        {data && (
          <button onClick={async () => { try { await deleteDigest(data.id); } catch { /* noop */ } onDeleted?.(data.id); onClose(); }} className="w-full mt-2 py-2 rounded-xl text-[12px]" style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}>
            {isMedia ? "Удалить из Портфеля" : isDoc ? "Удалить документ" : "Удалить подборку"}
          </button>
        )}
      </div>
    </div>
  );
}
