"use client";
/**
 * Реестр очереди для ОПЕРАТОРА АЗС: /operator/{agentId}
 * Вход по телефону (роль «оператор станции» — привязка station_operators). Подтверждение талона = запись в
 * списке станции на сервере: сканер QR / ручной код / поиск по гос-номеру → сверка → «Подъехал» → «Заправлен».
 * Остатки топлива и запас под живую очередь — оператор правит здесь или сообщает джину в чате.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { login } from "@/services/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface QRow {
  code: string; number: number; client_name: string; car_plate: string; fuel_type: string; liters: number;
  status: string; status_ru: string; created_at: string | null; arrived_at: string | null; agent_id?: number; slot_hhmm?: string;
}
interface Fuel { stock: number | null; reserved: number; reserved_cars: number; buffer: number | null; bookable: number | null; updated_hours_ago: number | null; stale: boolean; }
interface StationData {
  station: { agent_id: number; name: string; limit_per_car: number; buffer_pct: number };
  availability: { buffer_pct: number; limit_per_car: number; fuels: Record<string, Fuel> };
  queue: QRow[];
}
interface Checked extends QRow { station_name?: string; can_operate?: boolean; verdict?: { ok: boolean; text: string } }

const FUELS = ["АИ-92", "АИ-95", "АИ-98", "ДТ", "Газ"];
const C = { text: "#f5f0e8", muted: "rgba(245,240,232,0.5)", card: "#15151e", line: "rgba(255,255,255,0.1)", gold: "#e0b34a", green: "#42C593", red: "#e05555" };
const tok = () => (typeof window !== "undefined" ? localStorage.getItem("jinntell_token") : null);
const authH = (): Record<string, string> => { const t = tok(); return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }; };
const fmtTime = (iso: string | null) => { try { return iso ? new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }) : ""; } catch { return ""; } };
const codeFrom = (raw: string) => { const m = raw.toUpperCase().match(/[QZ]-[0-9A-F]{6,12}/); return m ? m[0] : ""; };
interface ORow { code: string; kind: string; kind_ru: string; items: { name: string; qty: number; price: number }[]; total: number;
  client_name: string; car_plate: string; ready_hhmm: string; queue_code: string | null; status: string; status_ru: string; verdict?: { ok: boolean; text: string }; can_operate?: boolean }

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export default function OperatorPage() {
  const params = useParams();
  const agentId = (params.agentId as string) || "";
  const [data, setData] = useState<StationData | null>(null);
  const [orders, setOrders] = useState<ORow[]>([]);
  const [checkedOrder, setCheckedOrder] = useState<ORow | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  // вход
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  // проверка талона
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checkErr, setCheckErr] = useState("");
  const [manual, setManual] = useState("");
  const [plate, setPlate] = useState("");
  const [found, setFound] = useState<QRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // остатки
  const [stockEdit, setStockEdit] = useState<Record<string, string> | null>(null);
  const [bufEdit, setBufEdit] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/queue/station/${agentId}`, { headers: authH() })
      .then(async (r) => {
        if (r.status === 401) { setNeedLogin(true); return null; }
        if (r.status === 403) throw new Error("Этот аккаунт не оператор данной АЗС.");
        if (!r.ok) throw new Error("Не удалось загрузить реестр");
        return r.json();
      })
      .then((d: StationData | null) => { if (d) { setData(d); setErr(""); setNeedLogin(false); } })
      .catch((e) => setErr(e.message));
    fetch(`${API_BASE}/api/queue/station/${agentId}/orders`, { headers: authH() })
      .then((r) => (r.ok ? r.json() : [])).then((d: ORow[]) => setOrders(d)).catch(() => {});
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    if (!tok()) { setNeedLogin(true); return; }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [agentId, load]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await login(phone.trim(), pass); setNeedLogin(false); load(); }
    catch { setErr("Неверный телефон или пароль."); }
  };

  const check = async (raw: string) => {
    const code = codeFrom(raw);
    setCheckErr(""); setChecked(null); setFound(null); setCheckedOrder(null);
    if (code.startsWith("Z-")) {
      try {
        const r = await fetch(`${API_BASE}/api/queue/order/${code}`, { headers: authH() });
        if (r.status === 404) { setCheckErr(`Заказа ${code} НЕТ в списке — вероятно, подделка.`); return; }
        const d: ORow & { agent_id: number } = await r.json();
        if (String(d.agent_id) !== String(agentId)) { setCheckErr("Заказ другой АЗС — не выдавать здесь."); return; }
        setCheckedOrder(d);
      } catch { setCheckErr("Ошибка сети."); }
      return;
    }
    if (!code) { setCheckErr("Это не талон JinnTell: в QR нет кода вида Q-…  Возможна подделка — ищите по гос-номеру."); return; }
    try {
      const r = await fetch(`${API_BASE}/api/queue/${code}?station=${agentId}`, { headers: authH() });
      if (r.status === 404) { setCheckErr(`Талона ${code} НЕТ в списке — вероятно, подделка. Ищите по гос-номеру.`); return; }
      if (!r.ok) { setCheckErr("Не удалось проверить талон."); return; }
      setChecked(await r.json());
    } catch { setCheckErr("Ошибка сети."); }
  };

  const act = async (code: string, what: "arrive" | "serve") => {
    setBusy(code + what);
    try {
      const r = await fetch(`${API_BASE}/api/queue/${code}/${what}`, { method: "POST", headers: authH() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.detail || "Не удалось отметить."); }
      else { const d = await r.json(); if (checked?.code === code) setChecked({ ...checked, ...d, verdict: { ok: true, text: what === "arrive" ? "Отмечен «подъехал»" : "Заправлен — талон закрыт" } }); }
      load();
    } catch { setErr("Ошибка сети."); }
    finally { setBusy(""); }
  };

  const orderAct = async (code: string, action: "ready" | "done") => {
    setBusy(code + action);
    try {
      const r = await fetch(`${API_BASE}/api/queue/order/${code}/${action}`, { method: "POST", headers: authH() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.detail || "Не удалось отметить."); }
      else { const d = await r.json(); if (checkedOrder?.code === code) setCheckedOrder({ ...checkedOrder, ...d, verdict: { ok: true, text: action === "ready" ? "Отмечен «готов»" : "Выдан — заказ закрыт" } }); }
      load();
    } catch { setErr("Ошибка сети."); }
    finally { setBusy(""); }
  };

  const orderCard = (o: ORow) => (
    <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ ...box, borderColor: o.verdict ? (o.verdict.ok ? "rgba(66,197,147,0.5)" : "rgba(224,85,85,0.5)") : C.line }}>
      {o.verdict && <div className="text-sm font-semibold" style={{ color: o.verdict.ok ? C.green : C.red }}>{o.verdict.ok ? "✓ " : "⚠ "}{o.verdict.text}</div>}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "rgba(224,179,74,0.15)", color: C.gold }}>{o.kind_ru}</span>
        <span className="text-sm font-semibold" style={{ color: C.text }}>{o.client_name}{o.car_plate ? ` · ${o.car_plate}` : ""}</span>
        {o.ready_hhmm && <span className="text-[13px] font-semibold" style={{ color: C.gold }}>к {o.ready_hhmm}</span>}
      </div>
      <div className="text-[13px]" style={{ color: C.text }}>{o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</div>
      <div className="text-[11px]" style={{ color: C.muted }}>{o.code} · {o.status_ru}{o.total ? ` · еда/услуги ${o.total} ₽ на кассе` : ""}{o.queue_code ? ` · талон ${o.queue_code}` : ""}</div>
      {(o.status === "new" || o.status === "ready") && (
        <div className="flex gap-2">
          {o.status === "new" && <button onClick={() => orderAct(o.code, "ready")} disabled={!!busy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "#d9a534", color: "#161311" }}>Готов</button>}
          <button onClick={() => orderAct(o.code, "done")} disabled={!!busy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold" style={{ background: C.green, color: "#06130d" }}>Выдан</button>
        </div>
      )}
    </div>
  );

  const findPlate = async () => {
    setFound(null); setCheckErr(""); setChecked(null);
    try {
      const r = await fetch(`${API_BASE}/api/queue/station/${agentId}/find?plate=${encodeURIComponent(plate)}`, { headers: authH() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setCheckErr(d.detail || "Поиск не удался."); return; }
      setFound(await r.json());
    } catch { setCheckErr("Ошибка сети."); }
  };

  // ── сканер QR (BarcodeDetector; на iPhone — обычная камера телефона открывает талон со сверкой) ──
  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setScanning(false);
  }, []);
  const startScan = async () => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD) { setCheckErr("Сканер в браузере недоступен. Наведите обычную камеру телефона на QR — откроется талон со сверкой. Или введите код / гос-номер ниже."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream; setScanning(true);
      setTimeout(async () => {
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; await v.play().catch(() => {});
        const det = new BD({ formats: ["qr_code"] });
        const tick = async () => {
          if (!streamRef.current) return;
          try { const res = await det.detect(v); if (res[0]?.rawValue) { stopScan(); check(res[0].rawValue); return; } } catch { /* кадр не готов */ }
          requestAnimationFrame(tick);
        };
        tick();
      }, 50);
    } catch { setCheckErr("Нет доступа к камере."); setScanning(false); }
  };
  useEffect(() => () => stopScan(), [stopScan]);

  const saveStock = async () => {
    if (!stockEdit) return;
    const stock: Record<string, number> = {};
    Object.entries(stockEdit).forEach(([k, v]) => { if (v.trim() !== "" && !isNaN(Number(v))) stock[k] = Number(v); });
    try {
      const r = await fetch(`${API_BASE}/api/queue/station/${agentId}/stock`, { method: "PUT", headers: authH(), body: JSON.stringify({ stock, buffer_pct: bufEdit === "" ? undefined : Number(bufEdit) }) });
      if (!r.ok) throw new Error();
      setStockEdit(null); load();
    } catch { setErr("Не удалось сохранить остатки."); }
  };

  const box = { background: C.card, border: `1px solid ${C.line}` };
  const input = "w-full rounded-lg px-3 py-2 text-sm outline-none";
  const inputStyle = { background: "rgba(255,255,255,0.06)", color: C.text, border: `1px solid ${C.line}` };

  if (needLogin) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0a0a0a" }}>
      <form onSubmit={doLogin} className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-3" style={box}>
        <div className="text-center mb-1">
          <div className="text-lg font-bold" style={{ color: C.text }}>⛽ Вход оператора АЗС</div>
          <div className="text-xs" style={{ color: C.muted }}>Телефон и пароль от аккаунта оператора</div>
        </div>
        <input className={input} style={inputStyle} placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" />
        <input className={input} style={inputStyle} placeholder="Пароль" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        <button className="py-2.5 rounded-xl font-semibold" style={{ background: "#d9a534", color: "#161311" }}>Войти</button>
        {err && <div className="text-xs text-center" style={{ color: C.red }}>{err}</div>}
      </form>
    </div>
  );

  const q = data?.queue || [];
  const waiting = q.filter((r) => r.status === "waiting").length;
  const arrived = q.filter((r) => r.status === "arrived").length;
  const fuels = data?.availability.fuels || {};

  const entryCard = (r: Checked | QRow, verdict?: { ok: boolean; text: string }) => (
    <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ ...box, borderColor: verdict ? (verdict.ok ? "rgba(66,197,147,0.5)" : "rgba(224,85,85,0.5)") : C.line }}>
      {verdict && <div className="text-sm font-semibold" style={{ color: verdict.ok ? C.green : C.red }}>{verdict.ok ? "✓ " : "⚠ "}{verdict.text}</div>}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "rgba(224,179,74,0.15)", color: C.gold }}>{r.number}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-wide" style={{ color: C.text }}>{r.car_plate}</span>
            {r.slot_hhmm && <span className="text-[13px] font-semibold" style={{ color: r.status === "expired" ? C.red : C.gold }}>к {r.slot_hhmm}</span>}
          </div>
          <div className="text-[12px]" style={{ color: C.muted }}>{r.client_name || "—"} · {r.fuel_type} {r.liters} л · заявка {fmtTime(r.created_at)}{r.arrived_at ? ` · подъехал ${fmtTime(r.arrived_at)}` : ""}</div>
          <div className="text-[11px]" style={{ color: C.muted }}>{r.code} · {r.status_ru}</div>
        </div>
      </div>
      {(r.status === "waiting" || r.status === "arrived") && (!("can_operate" in r) || r.can_operate) && (
        <div className="flex gap-2">
          {r.status === "waiting" && <button onClick={() => act(r.code, "arrive")} disabled={!!busy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "#d9a534", color: "#161311" }}>{busy === r.code + "arrive" ? "…" : "Подъехал"}</button>}
          <button onClick={() => act(r.code, "serve")} disabled={!!busy} className="flex-1 py-2 rounded-lg text-[13px] font-semibold" style={{ background: C.green, color: "#06130d" }}>{busy === r.code + "serve" ? "…" : "Заправлен"}</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: "#0a0a0a", height: "100dvh", overflowY: "auto" }}>
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold" style={{ color: C.text }}>⛽ {data?.station.name || `АЗС #${agentId}`}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>ждём {waiting} · подъехали {arrived} · обновляется само</div>
          </div>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-[12px]" style={{ background: "rgba(255,255,255,0.08)", color: C.text, border: `1px solid ${C.line}` }}>↻</button>
        </div>
        {err && <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(224,85,85,0.12)", color: C.red }}>{err}</div>}

        {/* Проверка талона */}
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={box}>
          <div className="text-sm font-semibold" style={{ color: C.text }}>Проверить талон</div>
          {scanning ? (
            <div className="flex flex-col gap-2">
              <video ref={videoRef} playsInline muted className="w-full rounded-xl" style={{ maxHeight: 320, background: "#000" }} />
              <button onClick={stopScan} className="py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.08)", color: C.text }}>Остановить</button>
            </div>
          ) : (
            <button onClick={startScan} className="py-3 rounded-xl font-semibold" style={{ background: "#d9a534", color: "#161311" }}>📷 Сканировать QR</button>
          )}
          <div className="flex gap-2">
            <input className={input} style={inputStyle} placeholder="Код с талона, Q-…" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button onClick={() => check(manual)} className="px-3 rounded-lg text-sm shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: C.text }}>Проверить</button>
          </div>
          <div className="flex gap-2">
            <input className={input} style={inputStyle} placeholder="Гос-номер машины" value={plate} onChange={(e) => setPlate(e.target.value)} />
            <button onClick={findPlate} className="px-3 rounded-lg text-sm shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: C.text }}>Найти</button>
          </div>
          <div className="text-[11px]" style={{ color: C.muted }}>Подтверждение — только запись в этом списке. Сверьте гос-номер с машиной. Нет в списке — не обслуживать по талону.</div>
          {checkErr && <div className="text-sm font-semibold" style={{ color: C.red }}>⚠ {checkErr}</div>}
          {checked && entryCard(checked, checked.verdict || { ok: false, text: "Талон другой АЗС" })}
          {checkedOrder && orderCard(checkedOrder)}
          {found && (found.length ? found.map((r) => <div key={r.code}>{entryCard(r)}</div>)
            : <div className="text-sm" style={{ color: C.red }}>⚠ По этому номеру за сутки записей нет.</div>)}
        </div>

        {/* Остатки */}
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={box}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: C.text }}>Остатки и запись</div>
            {!stockEdit && <button className="text-[12px]" style={{ color: C.gold }} onClick={() => {
              const init: Record<string, string> = {};
              FUELS.concat(Object.keys(fuels)).forEach((k) => { init[k] = fuels[k]?.stock != null ? String(fuels[k].stock) : ""; });
              setStockEdit(init); setBufEdit(String(data?.availability.buffer_pct ?? 30));
            }}>Обновить остатки</button>}
          </div>
          {stockEdit ? (
            <div className="flex flex-col gap-2">
              {Object.keys(stockEdit).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-16 text-sm" style={{ color: C.text }}>{k}</span>
                  <input className={input} style={inputStyle} inputMode="numeric" placeholder="литры" value={stockEdit[k]} onChange={(e) => setStockEdit({ ...stockEdit, [k]: e.target.value })} />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: C.muted }}>Запас под живую очередь, %</span>
                <input className={input} style={{ ...inputStyle, maxWidth: 90 }} inputMode="numeric" value={bufEdit} onChange={(e) => setBufEdit(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveStock} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: C.green, color: "#06130d" }}>Сохранить</button>
                <button onClick={() => setStockEdit(null)} className="px-3 py-2 rounded-lg text-sm" style={{ color: C.muted }}>Отмена</button>
              </div>
            </div>
          ) : Object.keys(fuels).length === 0 ? (
            <div className="text-sm" style={{ color: C.muted }}>Остатки не заданы. Нажмите «Обновить остатки» или назовите их джину станции в чате.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>
                <thead><tr style={{ color: C.muted }}><th className="text-left py-1">Топливо</th><th className="text-right">Остаток</th><th className="text-right">Бронь</th><th className="text-right">Запас</th><th className="text-right">Можно ещё</th></tr></thead>
                <tbody>
                  {Object.entries(fuels).map(([k, f]) => (
                    <tr key={k} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-1.5">{k}{f.stale && f.stock != null ? <span style={{ color: C.gold }}> · {f.updated_hours_ago} ч</span> : null}</td>
                      <td className="text-right">{f.stock ?? "—"}</td>
                      <td className="text-right">{f.reserved} <span style={{ color: C.muted }}>({f.reserved_cars})</span></td>
                      <td className="text-right">{f.buffer ?? "—"}</td>
                      <td className="text-right" style={{ color: f.bookable == null ? C.muted : f.bookable > 0 ? C.green : C.red, fontWeight: 600 }}>{f.bookable ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] mt-1" style={{ color: C.muted }}>Запас {data?.availability.buffer_pct}% остатка не бронируется — он для живой очереди у колонок. Лимит {data?.availability.limit_per_car} л на машину.</div>
            </div>
          )}
        </div>

        {/* Заказы к приезду */}
        {orders.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold" style={{ color: C.text }}>Предзаказы к приезду · {orders.length}</div>
            {orders.map((o) => <div key={o.code}>{orderCard(o)}</div>)}
          </div>
        )}

        {/* Список */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold" style={{ color: C.text }}>Список очереди</div>
          {q.length === 0 ? (
            <div className="text-center py-10" style={{ color: C.muted }}><div className="text-3xl mb-2">🅿️</div>Очередь пуста</div>
          ) : q.map((r) => <div key={r.code}>{entryCard(r)}</div>)}
        </div>
      </div>
    </div>
  );
}
