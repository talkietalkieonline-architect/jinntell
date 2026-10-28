"use client";
/**
 * CRM отдела продаж JinnTell (/crm): воронка Новая → КП отправлено → Звонок → Переговоры → Клиент / Отказ.
 * Работают владелец, РОП, маркетолог, менеджер (users.crm_role). Бэкенд: app/api/crm.py.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { login } from "@/services/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const C = { bg: "#F3F4F1", card: "#FFFFFF", ink: "#17191B", muted: "#646A70", line: "#E2E4DF", accent: "#2F5D50", accentInk: "#FFFFFF", gold: "#9A7B2F", red: "#B4432F", newBg: "#FFF4D6" };
const STAGE_COLOR: Record<string, string> = { new: "#9A7B2F", kp: "#3A6EA5", call: "#7A5AA6", talks: "#2F5D50", won: "#2E8B57", lost: "#8A8F94" };
const EVENT_LABEL: Record<string, string> = { created: "Создана", note: "Заметка", kp_sent: "КП", call: "Звонок", meeting: "Встреча", stage: "Этап", lead: "Заявка" };

interface Me { id: number; name: string; role: string; role_label: string; can_manage_team: boolean; stages: { id: string; label: string }[] }
interface Company {
  id: number; name: string; email: string | null; phone: string | null; contact_name: string | null; city: string | null;
  industry: string | null; website: string | null; notes: string | null; stage: string; stage_label: string; source: string | null;
  responsible_user_id: number | null; responsible_name: string | null; next_action_at: string | null; next_action_note: string | null;
  lost_reason: string | null; is_new: boolean; created_at: string | null; updated_at: string | null;
  events?: { id: number; kind: string; text: string; author: string | null; created_at: string | null }[];
}
interface Member { id: number; name: string; email: string | null; phone: string | null; role: string; role_label: string }

const tok = () => (typeof window !== "undefined" ? localStorage.getItem("jinntell_token") : null);
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}/api/crm${path}`, { ...init, headers: { "Content-Type": "application/json", ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}) } });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const e = new Error(typeof d.detail === "string" ? d.detail : "Ошибка сервера") as Error & { status?: number };
    e.status = r.status; throw e;
  }
  return r.json();
}
const fmt = (iso: string | null, withTime = true) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("ru", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }); } catch { return ""; }
};
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.ink, fontSize: 14, outline: "none", fontFamily: "inherit" };
const btn = (primary = false): React.CSSProperties => ({ padding: "9px 14px", borderRadius: 10, border: primary ? "none" : `1px solid ${C.line}`, background: primary ? C.accent : C.card, color: primary ? C.accentInk : C.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" });

export default function CrmPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [denied, setDenied] = useState("");
  const [items, setItems] = useState<Company[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newCount, setNewCount] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [lp, setLp] = useState({ login: "", pass: "", err: "" });

  const loadMe = useCallback(async () => {
    if (!tok()) { setNeedLogin(true); return; }
    try { setMe(await api<Me>("/me")); setNeedLogin(false); setDenied(""); }
    catch (e) { const s = (e as { status?: number }).status; if (s === 401) setNeedLogin(true); else setDenied((e as Error).message); }
  }, []);
  const load = useCallback(async () => {
    const p = new URLSearchParams(); if (stage) p.set("stage", stage); if (q.trim()) p.set("q", q.trim());
    try { const d = await api<{ items: Company[]; counts: Record<string, number>; new: number }>(`/companies?${p}`); setItems(d.items); setCounts(d.counts); setNewCount(d.new); } catch { /* noop */ }
  }, [stage, q]);
  const openCompany = useCallback(async (id: number) => { try { setOpen(await api<Company>(`/companies/${id}`)); load(); } catch { /* noop */ } }, [load]);

  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { if (!me) return; load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [me, load]);
  useEffect(() => { // ссылка из «Мой день»: /crm?c=12
    if (!me) return;
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) openCompany(Number(c));
  }, [me, openCompany]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(lp.login.trim(), lp.pass); setLp({ login: "", pass: "", err: "" }); loadMe(); }
    catch { setLp({ ...lp, err: "Неверный логин или пароль." }); }
  };

  const page: React.CSSProperties = { minHeight: "100dvh", background: C.bg, color: C.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" };

  if (needLogin || denied) {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <form onSubmit={doLogin} style={{ width: "100%", maxWidth: 360, background: C.card, borderRadius: 18, padding: 24, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 12, letterSpacing: ".1em", color: C.gold, fontWeight: 700 }}>JINNTELL · CRM</div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Отдел продаж</h1>
          {denied && <p style={{ margin: 0, color: C.red, fontSize: 14 }}>{denied}. Попросите владельца или РОПа добавить вас в команду.</p>}
          <input style={input} placeholder="Телефон" value={lp.login} onChange={(e) => setLp({ ...lp, login: e.target.value })} autoComplete="username" />
          <input style={input} type="password" placeholder="Пароль" value={lp.pass} onChange={(e) => setLp({ ...lp, pass: e.target.value })} autoComplete="current-password" />
          {lp.err && <div style={{ color: C.red, fontSize: 13 }}>{lp.err}</div>}
          <button type="submit" style={btn(true)}>Войти</button>
        </form>
      </div>
    );
  }
  if (!me) return <div style={page} />;

  const active = ["new", "kp", "call", "talks"].reduce((s, k) => s + (counts[k] || 0), 0);
  return (
    <div style={page}>
      <header style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 16px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, letterSpacing: ".1em", color: C.gold, fontWeight: 700 }}>JINNTELL · CRM</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Отдел продаж</div>
            </div>
            {newCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 999, background: C.newBg, color: C.gold, fontSize: 12, fontWeight: 700 }}>Новых заявок: {newCount}</span>}
            <span style={{ fontSize: 12, color: C.muted }}>{me.name} · {me.role_label}</span>
            {me.can_manage_team && <button style={btn()} onClick={() => setTeamOpen(true)}>Команда</button>}
            <button style={btn(true)} onClick={() => setAdding(true)}>+ Компания</button>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {[{ id: "", label: `В работе · ${active}` }, ...me.stages.map((s) => ({ id: s.id, label: `${s.label} · ${counts[s.id] || 0}` }))].map((s) => (
              <button key={s.id || "all"} onClick={() => setStage(s.id)} style={{ ...btn(stage === s.id), padding: "6px 12px", fontWeight: 500,
                ...(stage !== s.id && s.id ? { borderColor: STAGE_COLOR[s.id] + "55" } : {}) }}>{s.label}</button>
            ))}
          </div>
          <input style={{ ...input, padding: "8px 12px" }} placeholder="Поиск: название, почта, город, контакт" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.filter((c) => stage || !["won", "lost"].includes(c.stage)).map((c) => (
          <button key={c.id} onClick={() => openCompany(c.id)} style={{ textAlign: "left", background: c.is_new ? C.newBg : C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", color: C.ink }}>
            <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: STAGE_COLOR[c.stage] }} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 650, fontSize: 15 }}>{c.name}{c.is_new && <span style={{ marginLeft: 8, fontSize: 11, color: C.gold, fontWeight: 700 }}>НОВАЯ</span>}</span>
              <span style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[c.email || c.phone, c.city, c.industry, c.source].filter(Boolean).join(" · ")}
              </span>
              {c.next_action_at && <span style={{ fontSize: 12, color: C.accent }}>→ {fmt(c.next_action_at)} {c.next_action_note || ""}</span>}
            </span>
            <span style={{ fontSize: 12, color: STAGE_COLOR[c.stage], fontWeight: 600, whiteSpace: "nowrap" }}>{c.stage_label}</span>
          </button>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 14 }}>
            Здесь пусто. Нашли компанию — нажмите «+ Компания»: достаточно названия и почты.
          </div>
        )}
      </main>

      {adding && <AddCompany onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); load(); openCompany(c.id); }} />}
      {open && <CompanyCard c={open} stages={me.stages} onClose={() => setOpen(null)} onChanged={() => openCompany(open.id)} />}
      {teamOpen && <Team me={me} onClose={() => setTeamOpen(false)} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,25,27,.35)", zIndex: 20, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, height: "100%", overflowY: "auto", background: C.bg, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={btn()} aria-label="Закрыть">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
);
const Label = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>{children}</div>;

const FIELDS: { k: keyof Company; label: string; ph: string }[] = [
  { k: "name", label: "Название *", ph: "ООО «Кофе Лайн»" }, { k: "email", label: "Почта *", ph: "info@company.ru" },
  { k: "contact_name", label: "Контакт", ph: "Имя, должность" }, { k: "phone", label: "Телефон", ph: "+7…" },
  { k: "city", label: "Город", ph: "Санкт-Петербург" }, { k: "industry", label: "Отрасль", ph: "кофейня, АЗС, ТЦ…" },
  { k: "website", label: "Сайт", ph: "https://…" },
];

function AddCompany({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Company) => void }) {
  const [f, setF] = useState<Record<string, string>>({ city: "Санкт-Петербург" });
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try { onSaved(await api<Company>("/companies", { method: "POST", body: JSON.stringify(f) })); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet title="Новая компания" onClose={onClose}>
      <Box>
        {FIELDS.map((x) => (
          <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Label>{x.label}</Label>
            <input style={input} placeholder={x.ph} value={f[x.k] || ""} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Label>Что знаем</Label>
          <textarea style={{ ...input, minHeight: 80 }} placeholder="Сколько точек, что болит, откуда узнали" value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
        {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
        <button style={btn(true)} onClick={save}>Занести в CRM</button>
      </Box>
    </Sheet>
  );
}

function CompanyCard({ c, stages, onClose, onChanged }: { c: Company; stages: { id: string; label: string }[]; onClose: () => void; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [kp, setKp] = useState<{ subject: string; text: string; page?: string } | null>(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [ev, setEv] = useState({ kind: "call", text: "", next_at: "", next_note: "" });
  const [lost, setLost] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>, ok = "") => {
    setBusy(label); setMsg("");
    try { await fn(); if (ok) setMsg(ok); onChanged(); } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  };
  const patch = (body: object, ok = "Сохранено.") => run("patch", () => api(`/companies/${c.id}`, { method: "PATCH", body: JSON.stringify(body) }), ok);
  const iso = (v: string) => (v ? new Date(v).toISOString() : null);

  return (
    <Sheet title={c.name} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {stages.map((s) => (
          <button key={s.id} disabled={!!busy} onClick={() => (s.id === "lost" ? setLost("") : s.id !== c.stage && patch({ stage: s.id }, `Этап: ${s.label}`))}
            style={{ ...btn(s.id === c.stage), padding: "6px 10px", fontSize: 12, ...(s.id === c.stage ? { background: STAGE_COLOR[s.id] } : {}) }}>{s.label}</button>
        ))}
      </div>
      {lost !== null && (
        <Box>
          <Label>Причина отказа</Label>
          <input style={input} value={lost} onChange={(e) => setLost(e.target.value)} placeholder="Дорого, нет бюджета, не сейчас…" />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn(true)} onClick={() => { patch({ stage: "lost", lost_reason: lost }, "Отмечено как отказ."); setLost(null); }}>Отметить отказ</button>
            <button style={btn()} onClick={() => setLost(null)}>Отмена</button>
          </div>
        </Box>
      )}
      {msg && <div style={{ fontSize: 13, color: C.accent }}>{msg}</div>}

      <Box>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1 }}><Label>Компания</Label></div>
          <button style={{ ...btn(), padding: "4px 10px", fontSize: 12 }} onClick={() => { if (edit) { patch(f); setEdit(false); } else { setF(Object.fromEntries([...FIELDS.map((x) => [x.k, String(c[x.k] ?? "")]), ["notes", c.notes || ""]])); setEdit(true); } }}>{edit ? "Сохранить" : "Изменить"}</button>
        </div>
        {edit ? (
          <>
            {FIELDS.map((x) => <input key={x.k} style={input} placeholder={x.label} value={f[x.k] || ""} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />)}
            <textarea style={{ ...input, minHeight: 70 }} placeholder="Что знаем" value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 14 }}>
            {[["Почта", c.email], ["Контакт", c.contact_name], ["Телефон", c.phone], ["Город", c.city], ["Отрасль", c.industry], ["Сайт", c.website], ["Источник", c.source], ["Ведёт", c.responsible_name], ["Что знаем", c.notes]]
              .filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><span style={{ color: C.muted }}>{k}</span><span style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{v}</span></Fragment>))}
          </div>
        )}
      </Box>

      <Box>
        <Label>Коммерческое предложение</Label>
        {!kp ? (
          <>
            <input style={input} placeholder="Акцент для Кирилла (необязательно): «у них 5 точек, болит очередь утром»" value={focus} onChange={(e) => setFocus(e.target.value)} />
            <button style={btn(true)} disabled={!!busy} onClick={() => run("draft", async () => setKp(await api(`/companies/${c.id}/kp/draft`, { method: "POST", body: JSON.stringify({ focus }) })))}>
              {busy === "draft" ? "Кирилл пишет…" : "Составить КП (Кирилл)"}
            </button>
          </>
        ) : (
          <>
            <input style={input} value={kp.subject} onChange={(e) => setKp({ ...kp, subject: e.target.value })} />
            <textarea style={{ ...input, minHeight: 260, lineHeight: 1.5 }} value={kp.text} onChange={(e) => setKp({ ...kp, text: e.target.value })} />
            <div style={{ fontSize: 12, color: C.muted }}>Уйдёт на {c.email || "— почта не указана"} с noreply@jinntell.ru; ответ клиента придёт на вашу почту.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn(true)} disabled={!!busy || !c.email} onClick={() => run("send", async () => { await api(`/companies/${c.id}/kp/send`, { method: "POST", body: JSON.stringify(kp) }); setKp(null); }, "КП отправлено.")}>
                {busy === "send" ? "Отправляю…" : "Отправить письмом"}
              </button>
              <button style={btn()} onClick={() => setKp(null)}>Отменить</button>
            </div>
          </>
        )}
      </Box>

      <Box>
        <Label>Звонок · встреча · заметка</Label>
        <div style={{ display: "flex", gap: 6 }}>
          {[["call", "Звонок"], ["meeting", "Встреча"], ["note", "Заметка"]].map(([k, l]) => (
            <button key={k} style={{ ...btn(ev.kind === k), padding: "6px 10px", fontSize: 12 }} onClick={() => setEv({ ...ev, kind: k })}>{l}</button>
          ))}
        </div>
        <textarea style={{ ...input, minHeight: 70 }} placeholder="Итог: с кем говорили, что решили" value={ev.text} onChange={(e) => setEv({ ...ev, text: e.target.value })} />
        <Label>Следующий шаг — напомню в «Мой день»</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="datetime-local" style={{ ...input, width: "auto", flex: "1 1 180px" }} value={ev.next_at} onChange={(e) => setEv({ ...ev, next_at: e.target.value })} />
          <input style={{ ...input, flex: "2 1 200px" }} placeholder="Что сделать: перезвонить, отправить договор…" value={ev.next_note} onChange={(e) => setEv({ ...ev, next_note: e.target.value })} />
        </div>
        <button style={btn(true)} disabled={!!busy || !ev.text.trim()} onClick={() => run("ev", async () => {
          await api(`/companies/${c.id}/events`, { method: "POST", body: JSON.stringify({ kind: ev.kind, text: ev.text, next_action_at: iso(ev.next_at), next_action_note: ev.next_note }) });
          setEv({ kind: ev.kind, text: "", next_at: "", next_note: "" });
        }, "Записано.")}>Записать</button>
        {c.next_action_at && <div style={{ fontSize: 13, color: C.accent }}>Следующий шаг: {fmt(c.next_action_at)} — {c.next_action_note || "без описания"}</div>}
      </Box>

      <Box>
        <Label>История</Label>
        {(c.events || []).map((e) => (
          <div key={e.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 12, color: C.muted }}><b style={{ color: C.ink }}>{EVENT_LABEL[e.kind] || e.kind}</b> · {fmt(e.created_at)} · {e.author}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.text}</div>
          </div>
        ))}
      </Box>
    </Sheet>
  );
}

function Team({ me, onClose }: { me: Me; onClose: () => void }) {
  const [list, setList] = useState<Member[]>([]);
  const [f, setF] = useState({ login: "", role: "manager" });
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { api<Member[]>("/team").then(setList).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    setMsg("");
    try { const r = await api<{ name: string; role_label: string }>("/team", { method: "POST", body: JSON.stringify(f) }); setMsg(`${r.name} — ${r.role_label}`); setF({ ...f, login: "" }); load(); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Sheet title="Команда CRM" onClose={onClose}>
      <Box>
        {list.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <span style={{ flex: 1 }}>{m.name} <span style={{ color: C.muted, fontSize: 12 }}>{m.email || m.phone}</span></span>
            <span style={{ fontSize: 12, color: C.accent }}>{m.role_label}</span>
            {m.id !== me.id && <button style={{ ...btn(), padding: "4px 8px", fontSize: 12, color: C.red }} onClick={() => api(`/team/${m.id}`, { method: "DELETE" }).then(load)}>Убрать</button>}
          </div>
        ))}
      </Box>
      <Box>
        <Label>Добавить сотрудника</Label>
        <div style={{ fontSize: 12, color: C.muted }}>Сначала человек регистрируется в JinnTell, потом вы добавляете его по почте или телефону.</div>
        <input style={input} placeholder="Почта или телефон" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
        <select style={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="manager">Менеджер по продажам</option>
          <option value="rop">РОП</option>
          <option value="marketer">Маркетолог</option>
          <option value="owner">Владелец</option>
        </select>
        <button style={btn(true)} onClick={add}>Добавить</button>
        {msg && <div style={{ fontSize: 13, color: C.accent }}>{msg}</div>}
      </Box>
    </Sheet>
  );
}
