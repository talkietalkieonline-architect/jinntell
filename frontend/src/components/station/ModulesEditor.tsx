"use client";
/**
 * Модули отраслевой заготовки джина (backend services/industry_presets.py).
 * Кабинет бизнеса: бизнес сам включает модули своей заготовки, ведёт меню/прайс, лимиты очереди и операторов.
 * Админка (admin=true): то же + выбор заготовки (назначаем при оформлении аренды).
 */
import { useEffect, useState } from "react";
import type { ModulesApi, ModulesState, ModuleItem } from "@/services/api";

const THEMES = {
  cabinet: { text: "var(--text-primary)", muted: "var(--text-muted)", card: "var(--bg-glass)", line: "var(--bg-glass-border)", accent: "var(--accent)", onAccent: "var(--bg-deep)", input: "var(--bg-deep)", danger: "#e05555" },
  admin: { text: "#f3f4f6", muted: "#9ca3af", card: "#111827", line: "#1f2937", accent: "#f59e0b", onAccent: "#000", input: "#030712", danger: "#f87171" },
};

export default function ModulesEditor({ api, admin = false }: { api: ModulesApi; admin?: boolean }) {
  const T = THEMES[admin ? "admin" : "cabinet"];
  const [st, setSt] = useState<ModulesState | null>(null);
  const [mods, setMods] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ModulesState["catalog"]>({});
  const [settings, setSettings] = useState<ModulesState["settings"]>({});
  const [industry, setIndustry] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState({ phone: "", password: "", name: "" });

  const take = (s: ModulesState) => {
    setSt(s); setMods(s.modules.filter((m) => m.on).map((m) => m.id));
    setCatalog(s.catalog || {}); setSettings(s.settings || {}); setIndustry(s.industry || "");
  };
  useEffect(() => { api.load().then(take).catch(() => setNote("Не удалось загрузить модули.")); }, [api]);

  const save = async (patch?: Partial<{ industry: string | null; modules: string[] }>) => {
    setBusy(true); setNote("");
    try {
      const body = patch && "industry" in patch ? { industry: patch.industry } : { modules: patch?.modules ?? mods, catalog, settings };
      take(await api.save(body)); setNote("Сохранено.");
    } catch (e) { setNote(e instanceof Error ? e.message : "Не удалось сохранить."); }
    setBusy(false);
  };
  const toggle = (id: string) => { const next = mods.includes(id) ? mods.filter((x) => x !== id) : [...mods, id]; setMods(next); save({ modules: next }); };

  const addOp = async () => {
    setNote("");
    try { const r = await api.addOperator(op.phone, op.password, op.name); setSt(st ? { ...st, operators: r.operators } : st); setOp({ phone: "", password: "", name: "" }); setNote("Оператор добавлен."); }
    catch (e) { setNote(e instanceof Error ? e.message : "Не удалось добавить оператора."); }
  };
  const delOp = async (uid: number) => {
    try { const r = await api.removeOperator(uid); setSt(st ? { ...st, operators: r.operators } : st); } catch { setNote("Не удалось убрать оператора."); }
  };

  if (!st) return <div className="text-sm py-4" style={{ color: T.muted }}>{note || "Загрузка…"}</div>;

  const box = { background: T.card, border: `1px solid ${T.line}` };
  const inp = "rounded-lg px-2.5 py-1.5 text-sm outline-none";
  const inpS = { background: T.input, border: `1px solid ${T.line}`, color: T.text };
  const btn = { background: T.accent, color: T.onAccent };
  const needsOperator = st.modules.some((m) => m.operator && mods.includes(m.id));

  const editList = (key: "cafe" | "services", title: string) => {
    const list: ModuleItem[] = catalog[key] || [];
    const set = (l: ModuleItem[]) => setCatalog({ ...catalog, [key]: l });
    return (
      <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
        <div className="text-[12px] font-semibold" style={{ color: T.text }}>{title}</div>
        {list.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input className={`${inp} flex-1 min-w-0`} style={inpS} value={it.name} onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input className={`${inp} w-20`} style={inpS} inputMode="numeric" value={String(it.price)} onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, price: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
            <span className="text-[11px]" style={{ color: T.muted }}>₽</span>
            <button onClick={() => set(list.filter((_, k) => k !== i))} className="text-[12px] px-1" style={{ color: T.danger }} aria-label="Удалить">✕</button>
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => set([...list, { name: "", price: 0 }])} className="text-[12px]" style={{ color: T.accent }}>+ позиция</button>
          <span className="text-[11px]" style={{ color: T.muted }}>Цена 0 — бесплатно</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {admin && (
        <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
          <div className="text-[12px] font-semibold" style={{ color: T.text }}>Отраслевая заготовка (назначаем при оформлении аренды)</div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inp} style={inpS}>
              <option value="">— без заготовки —</option>
              {st.industries.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <button disabled={busy || industry === (st.industry || "")} onClick={() => save({ industry: industry || null })} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40" style={btn}>Назначить</button>
          </div>
          <div className="text-[11px]" style={{ color: T.muted }}>Весь функционал заготовки включается сразу; опции «по необходимости» (очередь за топливом) бизнес включает сам в кабинете.</div>
        </div>
      )}

      {!st.industry ? (
        <div className="text-[12px] rounded-xl p-3" style={{ ...box, color: T.muted }}>
          {admin ? "Назначьте заготовку — появятся её модули." : "Для этого джина отраслевая заготовка не подключена. Напишите нам — подберём."}
        </div>
      ) : (
        <>
          <div className="text-[12px]" style={{ color: T.muted }}>
            Заготовка: <b style={{ color: T.text }}>{st.industry_label}</b>. Базовое (информирование, цены, акции из канала, ответы по базе) работает всегда; ниже — что включено дополнительно.
          </div>
          {st.modules.map((m) => {
            const on = mods.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} disabled={busy}
                className="flex items-center justify-between rounded-xl px-4 py-2.5 text-left"
                style={{ ...box, borderColor: on ? T.accent : T.line }}>
                <div className="min-w-0 pr-2">
                  <div className="text-[13px] font-medium" style={{ color: T.text }}>{m.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>{m.desc}</div>
                </div>
                <div className="w-9 h-5 rounded-full flex items-center px-0.5 shrink-0" style={{ background: on ? T.accent : T.line, justifyContent: on ? "flex-end" : "flex-start" }}>
                  <div className="w-4 h-4 rounded-full" style={{ background: admin ? "#000" : "var(--bg-deep)" }} />
                </div>
              </button>
            );
          })}

          {mods.includes("cafe") && editList("cafe", "Меню кафе")}
          {mods.includes("services") && editList("services", "Прайс услуг АЗС")}

          {mods.includes("pay_qr") && (() => {
            const pay = catalog.pay || {};
            const setPay = (k: string, v: string) => setCatalog({ ...catalog, pay: { ...pay, [k]: v } });
            const field = (k: "name" | "inn" | "acc" | "bank" | "bic" | "corr", label: string, ph: string) => (
              <label key={k} className="flex flex-col gap-1 text-[11px]" style={{ color: T.muted }}>{label}
                <input className={inp} style={inpS} placeholder={ph} value={pay[k] || ""} onChange={(e) => setPay(k, e.target.value)} />
              </label>
            );
            return (
              <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
                <div className="text-[12px] font-semibold" style={{ color: T.text }}>Оплата через СБП</div>
                <div className="text-[11px]" style={{ color: T.muted }}>Вставьте платёжную ссылку СБП из вашего банка (Сбер, Т-Банк, Точка, Альфа и др. выдают её бизнесу). Гость получит талон с кнопкой «Оплатить N ₽ через СБП» — откроется его банк, деньги придут напрямую вам. JinnTell в платеже не участвует.</div>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: T.muted }}>Ссылка на оплату СБП
                  <input className={inp} style={inpS} placeholder="https://qr.nspk.ru/…" value={pay.sbp_link || ""} onChange={(e) => setPay("sbp_link", e.target.value.trim())} />
                </label>
                <details>
                  <summary className="text-[11px] cursor-pointer" style={{ color: T.accent }}>QR для экрана на кассе (необязательно): реквизиты</summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {field("name", "Получатель", "ООО «Кофейня»")}
                    {field("inn", "ИНН", "7800000000")}
                    {field("acc", "Расчётный счёт", "40702810…")}
                    {field("bank", "Банк", "ПАО Сбербанк")}
                    {field("bic", "БИК", "044525225")}
                    {field("corr", "Корр. счёт", "30101810…")}
                  </div>
                </details>
              </div>
            );
          })()}

          {mods.includes("queue") && (
            <div className="rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2" style={box}>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: T.muted }}>Лимит на машину, л
                <input className={inp} style={inpS} inputMode="numeric" value={settings.queue_limit_liters ?? ""} onChange={(e) => setSettings({ ...settings, queue_limit_liters: Number(e.target.value) || 0 })} /></label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: T.muted }}>Запас под живую очередь, %
                <input className={inp} style={inpS} inputMode="numeric" value={settings.queue_buffer_pct ?? ""} onChange={(e) => setSettings({ ...settings, queue_buffer_pct: Number(e.target.value) || 0 })} /></label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: T.muted }}>Шаг окон записи, мин
                <input className={inp} style={inpS} inputMode="numeric" value={settings.queue_slot_min ?? ""} onChange={(e) => setSettings({ ...settings, queue_slot_min: Number(e.target.value) || 0 })} /></label>
            </div>
          )}

          {(mods.includes("cafe") || mods.includes("services") || mods.includes("queue") || mods.includes("pay_qr")) && (
            <button onClick={() => save()} disabled={busy} className="py-2.5 rounded-xl text-sm font-semibold" style={btn}>{busy ? "Сохраняю…" : "Сохранить меню и настройки"}</button>
          )}

          {needsOperator && (
            <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
              <div className="text-[12px] font-semibold" style={{ color: T.text }}>Операторы станции</div>
              <div className="text-[11px]" style={{ color: T.muted }}>
                Оператор входит по телефону на <a href={st.operator_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>{st.operator_url.replace("https://", "")}</a> — видит очередь и заказы, сканирует QR, сообщает джину остатки.
              </div>
              {st.operators.map((o) => (
                <div key={o.user_id} className="flex items-center justify-between text-[13px]" style={{ color: T.text }}>
                  <span>{o.name} · {o.phone}</span>
                  <button onClick={() => delOp(o.user_id)} className="text-[12px]" style={{ color: T.danger }}>убрать</button>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input className={inp} style={inpS} placeholder="Телефон" inputMode="tel" value={op.phone} onChange={(e) => setOp({ ...op, phone: e.target.value })} />
                <input className={inp} style={inpS} placeholder="Имя" value={op.name} onChange={(e) => setOp({ ...op, name: e.target.value })} />
                <input className={inp} style={inpS} placeholder="Пароль (для нового)" type="password" autoComplete="new-password" value={op.password} onChange={(e) => setOp({ ...op, password: e.target.value })} />
              </div>
              <button onClick={addOp} className="self-start px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={btn}>Добавить оператора</button>
            </div>
          )}
        </>
      )}
      {note && <div className="text-[12px]" style={{ color: T.muted }}>{note}</div>}
    </div>
  );
}
