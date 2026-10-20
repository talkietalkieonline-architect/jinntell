"use client";
/**
 * Талон в очередь на заправку: /q/{code}
 * Водитель — видит свой талон с QR. Оператор АЗС (вход по телефону) отсканировал QR камерой телефона →
 * попал сюда → видит СВЕРКУ со списком станции (подтверждение — запись на сервере, не картинка) →
 * «Подъехал» → «Заправлен». Талон одноразовый: повторный показ виден как «уже использован».
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface QEntry {
  code: string; number: number; client_name: string; car_plate: string; fuel_type: string; liters: number;
  status: string; status_ru: string; agent_id: number; station_name: string; created_at: string | null;
  arrived_at: string | null; served_at: string | null; can_operate: boolean; slot_hhmm: string;
  verdict?: { ok: boolean; text: string };
}

const tok = () => (typeof window !== "undefined" ? localStorage.getItem("jinntell_token") : null);
const authH = (): Record<string, string> => { const t = tok(); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
};

export default function PassPage() {
  const params = useParams();
  const code = ((params.code as string) || "").toUpperCase();
  return code.startsWith("Z-") ? <OrderPass code={code} /> : <QueuePass code={code} />;
}

interface OEntry {
  code: string; kind_ru: string; items: { name: string; qty: number; price: number; fuel?: boolean }[]; total: number; client_name: string;
  car_plate: string; ready_hhmm: string; status: string; status_ru: string; station_name: string; can_operate: boolean;
  verdict?: { ok: boolean; text: string };
}

/** Заказ к приезду (кофе/услуга): водителю — QR и состав; оператору — сверка и «Готов»/«Выдан». */
function OrderPass({ code }: { code: string }) {
  const [o, setO] = useState<OEntry | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/queue/order/${code}`, { headers: authH() })
      .then((r) => { if (!r.ok) throw new Error("Этого заказа нет в списке станции"); return r.json(); })
      .then(setO).catch((e) => setErr(e.message));
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const act = async (a: "ready" | "done") => {
    const r = await fetch(`${API_BASE}/api/queue/order/${code}/${a}`, { method: "POST", headers: authH() });
    if (r.ok) { setNote(a === "ready" ? "✓ Готов" : "✓ Выдан"); load(); } else { const d = await r.json().catch(() => ({})); setNote(d.detail || "Не удалось"); }
  };
  const muted = { color: "rgba(245,240,232,0.55)" };
  const wrap = "min-h-screen flex items-center justify-center p-6";
  if (err) return <div className={wrap} style={{ background: "#0a0a0a" }}><div className="text-center"><div className="text-5xl mb-3">⛔</div><div className="text-lg font-bold" style={{ color: "#f5f0e8" }}>Заказа нет в списке</div><div className="text-sm" style={muted}>{err}</div></div></div>;
  if (!o) return <div className={wrap} style={{ background: "#0a0a0a" }}><div className="text-sm" style={muted}>Загрузка…</div></div>;
  const closed = o.status === "done" || o.status === "cancelled";
  return (
    <div className={wrap} style={{ background: "#0a0a0a" }}>
      <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4" style={{ background: "#15151e", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="text-center"><div className="text-sm uppercase tracking-widest" style={{ color: "#e0b34a" }}>Предзаказ к приезду</div><div className="text-xs mt-1" style={muted}>{o.station_name}</div></div>
        {o.can_operate && o.verdict && <div className="rounded-xl p-3 text-sm font-semibold text-center" style={o.verdict.ok ? { background: "rgba(66,197,147,0.15)", color: "#42C593" } : { background: "rgba(224,85,85,0.15)", color: "#e05555" }}>{o.verdict.ok ? "✓ " : "⚠ "}{o.verdict.text}</div>}
        {!o.can_operate && <div className="flex justify-center"><img src={`${API_BASE}/api/queue/${o.code}/qr.svg`} alt="QR заказа" width={160} height={160} style={{ background: "#fff", borderRadius: 14, padding: 8, opacity: closed ? 0.35 : 1 }} /></div>}
        <div className="rounded-2xl p-4 text-sm flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", color: "#f5f0e8" }}>
          <div className="font-semibold">{o.client_name}{o.car_plate ? ` · ${o.car_plate}` : ""}</div>
          {o.items.map((i, k) => <div key={k} className="flex justify-between"><span>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ""}</span><span style={muted}>{"fuel" in i ? "по колонке" : i.price ? `${i.price * i.qty} ₽` : "бесплатно"}</span></div>)}
          <div className="flex justify-between pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}><span style={muted}>К времени</span><b>{o.ready_hhmm || "—"}</b></div>
          <div className="flex justify-between"><span style={muted}>Еда и услуги (на кассе)</span><b>{o.total ? `${o.total} ₽` : "—"}</b></div>
          <div className="flex justify-between"><span style={muted}>Статус</span><span>{o.status_ru}</span></div>
          <div className="flex justify-between"><span style={muted}>Код</span><span style={{ color: "#e0b34a", fontWeight: 700 }}>{o.code}</span></div>
        </div>
        {o.can_operate && !closed && (
          <div className="flex gap-2">
            {o.status === "new" && <button onClick={() => act("ready")} className="flex-1 py-3 rounded-xl font-semibold" style={{ background: "#d9a534", color: "#161311" }}>Готов</button>}
            <button onClick={() => act("done")} className="flex-1 py-3 rounded-xl font-semibold" style={{ background: "#42C593", color: "#06130d" }}>Выдан</button>
          </div>
        )}
        {!o.can_operate && !closed && <p className="text-center text-[12px]" style={muted}>Покажите QR на кассе. Оплата — на станции.</p>}
        {note && <p className="text-center text-xs" style={{ color: "rgba(245,240,232,0.8)" }}>{note}</p>}
      </div>
    </div>
  );
}

function QueuePass({ code }: { code: string }) {
  const [entry, setEntry] = useState<QEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/queue/${code}`, { headers: authH() })
      .then((r) => { if (!r.ok) throw new Error("Этого талона нет в списке станции"); return r.json(); })
      .then((d: QEntry) => { setEntry(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [code]);

  useEffect(() => { if (code) load(); }, [code, load]);

  const act = async (what: "arrive" | "serve") => {
    setBusy(true); setNote("");
    try {
      const r = await fetch(`${API_BASE}/api/queue/${code}/${what}`, { method: "POST", headers: authH() });
      if (r.ok) { setNote(what === "arrive" ? "✓ Отмечено: подъехал" : "✓ Отмечено: заправлен"); load(); }
      else { const d = await r.json().catch(() => ({})); setNote(d.detail || "Не удалось отметить."); }
    } catch { setNote("Ошибка сети."); }
    finally { setBusy(false); }
  };

  const wrap = "min-h-screen flex items-center justify-center p-6";
  const bg = { background: "#0a0a0a" } as const;
  const muted = { color: "rgba(245,240,232,0.55)" };

  if (loading) return <div className={wrap} style={bg}><div className="text-sm" style={muted}>Загрузка…</div></div>;
  if (err || !entry) return (
    <div className={wrap} style={bg}>
      <div className="text-center max-w-xs">
        <div className="text-5xl mb-4">⛔</div>
        <div className="text-lg font-bold mb-1" style={{ color: "#f5f0e8" }}>Талона нет в списке</div>
        <div className="text-sm" style={muted}>{err || "Проверьте код."} Возможно, QR поддельный — найдите запись по гос-номеру в реестре оператора.</div>
      </div>
    </div>
  );

  const closed = entry.status === "served" || entry.status === "cancelled" || entry.status === "expired";
  const row = (k: string, v: string | number, strong = false) => (
    <div className="flex justify-between py-1 text-sm gap-3">
      <span style={muted}>{k}</span>
      <span style={{ color: "#f5f0e8", fontWeight: strong ? 700 : 500, textAlign: "right" }}>{v}</span>
    </div>
  );

  return (
    <div className={wrap} style={bg}>
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: "#15151e", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="text-center mb-4">
          <div className="text-sm uppercase tracking-widest" style={{ color: "#e0b34a" }}>Талон в очередь</div>
          <div className="text-xs mt-1" style={muted}>{entry.station_name || "АЗС"}</div>
        </div>

        {entry.can_operate && entry.verdict && (
          <div className="mb-4 rounded-xl p-3 text-sm font-semibold text-center" style={entry.verdict.ok
            ? { background: "rgba(66,197,147,0.15)", color: "#42C593", border: "1px solid rgba(66,197,147,0.35)" }
            : { background: "rgba(224,85,85,0.15)", color: "#e05555", border: "1px solid rgba(224,85,85,0.35)" }}>
            {entry.verdict.ok ? "✓ " : "⚠ "}{entry.verdict.text}
          </div>
        )}
        {!entry.can_operate && entry.verdict && !entry.verdict.ok && (
          <div className="mb-4 rounded-xl p-3 text-sm font-semibold text-center" style={{ background: "rgba(224,85,85,0.15)", color: "#e05555" }}>⚠ {entry.verdict.text}</div>
        )}

        {!entry.can_operate && (
          <div className="flex justify-center mb-4">
            <img src={`${API_BASE}/api/queue/${entry.code}/qr.svg`} alt="QR талона" width={176} height={176}
                 style={{ background: "#fff", borderRadius: 14, padding: 8, opacity: closed ? 0.35 : 1 }} />
          </div>
        )}

        <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {row("Номер в очереди", entry.number, true)}
          {row("Гос-номер", entry.car_plate, true)}
          {entry.client_name && row("Имя", entry.client_name)}
          {row("Топливо", `${entry.fuel_type} · ${entry.liters} л`)}
          {entry.slot_hhmm && row("Время заправки", entry.slot_hhmm, true)}
          {row("Заявка", fmt(entry.created_at))}
          {entry.arrived_at && row("Подъехал", fmt(entry.arrived_at))}
          {entry.served_at && row("Заправлен", fmt(entry.served_at))}
          {row("Статус", entry.status_ru)}
          <div className="flex justify-between py-1 text-sm"><span style={muted}>Код</span><span style={{ color: "#e0b34a", fontWeight: 700 }}>{entry.code}</span></div>
        </div>

        {entry.can_operate ? (
          closed ? null : (
            <div className="flex flex-col gap-2">
              {entry.status === "waiting" && (
                <button onClick={() => act("arrive")} disabled={busy} className="w-full py-3 rounded-xl font-semibold active:scale-[0.98]" style={{ background: "#d9a534", color: "#161311" }}>
                  {busy ? "…" : "Подъехал"}
                </button>
              )}
              <button onClick={() => act("serve")} disabled={busy} className="w-full py-3 rounded-xl font-semibold active:scale-[0.98]" style={{ background: "#42C593", color: "#06130d" }}>
                {busy ? "…" : "Заправлен"}
              </button>
              <a href={`/operator/${entry.agent_id}`} className="text-center text-xs mt-1" style={{ color: "#e0b34a" }}>← Реестр станции</a>
            </div>
          )
        ) : (
          entry.status === "expired"
            ? <div className="text-center py-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(224,85,85,0.15)", color: "#e05555" }}>Талон сгорел — опоздание к {entry.slot_hhmm}. Запишитесь снова у джина АЗС.</div>
            : !closed && <p className="text-center text-[12px]" style={muted}>Подъезжайте к {entry.slot_hhmm || "назначенному времени"} и покажите QR оператору. При опоздании талон сгорает.</p>
        )}
        {note && <p className="text-center text-xs mt-3" style={{ color: "rgba(245,240,232,0.8)" }}>{note}</p>}
      </div>
    </div>
  );
}
