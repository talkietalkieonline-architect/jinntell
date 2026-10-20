"use client";
/**
 * Публичная страница канала джинна: jinntell.ru/c/{slug}
 * Открывается без входа. Лента постов + «Спросить джинна» → его прихожая (/a/{slug}).
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface ChAgent { id: number; name: string; profession: string; description: string; color: string; photo_url?: string | null; slug: string }
interface ChPost { id: number; title: string; body?: string | null; url?: string | null; created_at?: string | null }

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function hostOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "источник"; }
}

export default function ChannelPage() {
  const params = useParams();
  const slug = (params.slug as string) || "";
  const [agent, setAgent] = useState<ChAgent | null>(null);
  const [posts, setPosts] = useState<ChPost[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/api/channels/public/${encodeURIComponent(slug)}?limit=40`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setAgent(d.agent); setPosts(d.posts || []); setState("ok"); })
      .catch(() => setState("missing"));
  }, [slug]);

  useEffect(() => {
    if (agent) document.title = `${agent.name} — канал · JinnTell`;
  }, [agent]);

  const bg = { background: "#0a0a0a" } as const;

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center" style={bg}><div className="text-sm" style={{ color: "rgba(245,240,232,0.5)" }}>Загрузка канала…</div></div>;
  }
  if (state === "missing" || !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={bg}>
        <div className="text-center">
          <div className="text-lg font-bold mb-2" style={{ color: "#f5f0e8" }}>Канал не найден</div>
          <a href="/" className="text-sm" style={{ color: "#d4a843" }}>На главную JinnTell</a>
        </div>
      </div>
    );
  }

  const c = agent.color || "#d4a843";
  return (
    // html/body в приложении не прокручиваются (полноэкранный режим) → прокручиваем сам контейнер страницы
    <div style={{ height: "100dvh", overflowY: "auto", background: `linear-gradient(180deg, ${c}14 0%, #0a0a0a 320px)` }}>
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-28">
        <header className="flex items-center gap-4 mb-6">
          {agent.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.photo_url} alt={agent.name} className="w-16 h-16 rounded-2xl object-cover shrink-0" style={{ border: `2px solid ${c}55` }} />
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0" style={{ background: `${c}22`, border: `2px solid ${c}55`, color: c }}>{agent.name[0]}</div>
          )}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: c }}>Канал · Город JinnTell</div>
            <h1 className="text-2xl font-bold" style={{ color: "#f5f0e8" }}>{agent.name}</h1>
            <div className="text-sm" style={{ color: "rgba(245,240,232,0.55)" }}>{agent.profession}</div>
          </div>
        </header>
        {agent.description && <p className="text-sm mb-6" style={{ color: "rgba(245,240,232,0.7)", lineHeight: 1.6 }}>{agent.description}</p>}

        {posts.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: "rgba(245,240,232,0.4)" }}>Пока нет постов — скоро будут.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((p) => (
              <article key={p.id} id={`p${p.id}`} className="rounded-2xl p-4" style={{ background: "#15151b", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-[11px] mb-1.5" style={{ color: "rgba(245,240,232,0.4)" }}>{fmtDate(p.created_at)}</div>
                <h2 className="text-[16px] font-semibold mb-1.5" style={{ color: "#f5f0e8", lineHeight: 1.35 }}>{p.title}</h2>
                {p.body && <p className="text-[14px] whitespace-pre-wrap" style={{ color: "rgba(245,240,232,0.78)", lineHeight: 1.6 }}>{p.body}</p>}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2.5 text-[13px] font-medium" style={{ color: c }}>
                    {hostOf(p.url)} ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4" style={{ background: "linear-gradient(0deg, #0a0a0a 60%, transparent)" }}>
        <a href={`/a/${agent.slug}`} className="block max-w-2xl mx-auto text-center py-3.5 rounded-2xl font-semibold transition-all active:scale-[0.98]" style={{ background: c, color: "#0a0a0a" }}>
          Задать вопрос · {agent.name}
        </a>
      </div>
    </div>
  );
}
