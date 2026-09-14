"use client";
import { useEffect, useState, useCallback, useMemo, useRef, type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import { getDay, addDayEntry, updateDayEntry, deleteDayEntry, type DayEntry, type DaySignal, type DayBirthday } from "@/services/api";

type RangeId = "day" | "week" | "month" | "year";
const RANGE: { id: RangeId; lab: string; back: number; fwd: number }[] = [
  { id: "day", lab: "День", back: 0, fwd: 1 },
  { id: "week", lab: "Неделя", back: 7, fwd: 7 },
  { id: "month", lab: "Месяц", back: 15, fwd: 16 },
  { id: "year", lab: "Год", back: 180, fwd: 185 },
];
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MN = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MNS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const HOL: Record<string, string> = {
  "01-01": "Новый год", "01-07": "Рождество", "02-23": "Защитника Отечества", "03-08": "8 Марта",
  "05-01": "1 Мая", "05-09": "День Победы", "06-12": "День России", "11-04": "Народного единства", "12-31": "Новый год",
};
const PPH = 90;
const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// демо-слои (пока без бэкенда): погода, части суток, плавающие подсказки, связанные дни
const WEATHER = [{ t: "07:00", ic: "🌤", tp: "+14°" }, { t: "12:00", ic: "☀️", tp: "+19°" }, { t: "18:00", ic: "🌧", tp: "+15°" }, { t: "22:00", ic: "🌙", tp: "+11°" }];
const PARTS = [{ t: "09:30", l: "утро" }, { t: "14:30", l: "день" }, { t: "20:30", l: "вечер" }, { t: "02:30", l: "ночь" }];
type Float = { id: string; t: string; cls: string; html: string; x: number };
const FLOATS: Float[] = [
  { id: "h1", t: "14:00", cls: "hint", html: "💡 Кофейня рядом −20%", x: 130 },
  { id: "h2", t: "18:00", cls: "hint", html: "☔ Будет дождь — возьми зонт", x: 120 },
  { id: "a1", t: "19:30", cls: "afisha", html: "🎭 Афиша · Концерт «Любэ»", x: 150 },
  { id: "f1", t: "09:15", cls: "fun", html: "🔮 Предсказание: повезёт с деньгами", x: 130 },
  { id: "f2", t: "17:20", cls: "fun", html: "😄 Анекдот дня — тапни", x: 150 },
];
const LINKED = [
  { name: "Мария", rel: "жена", items: [{ t: "10:00", title: "Йога" }, { t: "13:00", title: "Обед вместе", shared: true }, { t: "16:00", title: "Врач" }, { t: "19:00", title: "Ужин дома", shared: true }] },
  { name: "Костя", rel: "друг", items: [{ t: "12:00", title: "Работа" }, { t: "18:30", title: "Зал" }, { t: "21:00", title: "Игра онлайн", shared: true }] },
  { name: "Аня", rel: "дочь", items: [{ t: "09:00", title: "Школа" }, { t: "15:00", title: "Танцы" }, { t: "20:00", title: "Уроки", shared: true }] },
];

export default function MyDayModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [signals, setSignals] = useState<DaySignal[]>([]);
  const [birthdays, setBirthdays] = useState<DayBirthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeId>("day");
  const [tick, setTick] = useState(0);
  const [centerTime, setCenterTime] = useState("");
  const [detail, setDetail] = useState<DayEntry | null>(null);
  const [sheet, setSheet] = useState(false);
  const [selLinked, setSelLinked] = useState(0);
  const [atRight, setAtRight] = useState(false);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem("myday_pos") || "{}"); } catch { return {}; }
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const padRef = useRef(320);

  const cfg = RANGE.find((r) => r.id === range)!;
  const hm = useMemo(() => nowHM(), [tick]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    try {
      const r = await getDay(cfg.fwd, cfg.back);
      setEntries(r.entries); setDays(r.days); setSignals(r.signals || []); setBirthdays(r.birthdays || []);
    } catch { /* noop */ }
    setLoading(false);
  }, [cfg.fwd, cfg.back]);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("jinntell_day_ping", h);
    return () => window.removeEventListener("jinntell_day_ping", h);
  }, [load]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const todayHuman = useMemo(() => {
    const [y, m, dd] = todayStr.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, dd || 1);
    return `${WD[dt.getDay()]}, ${dd} ${MON[(m || 1) - 1]}`;
  }, [todayStr]);
  const byDay = useMemo(() => {
    const m: Record<string, DayEntry[]> = {};
    for (const e of entries) (m[e.day] ||= []).push(e);
    return m;
  }, [entries]);
  const byBday = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const b of birthdays) (m[b.day] ||= []).push(b.name);
    return m;
  }, [birthdays]);

  const yOf = (t: string) => (toMin(t) / 60) * PPH + padRef.current;
  const center = useCallback((smooth: boolean) => {
    const sc = scrollRef.current; if (!sc) return;
    sc.scrollTo({ top: Math.max(0, yOf(nowHM()) - sc.clientHeight / 2), behavior: smooth ? "smooth" : "auto" });
  }, []);
  const onScroll = () => {
    const sc = scrollRef.current; if (!sc) return;
    const cy = sc.scrollTop + sc.clientHeight / 2 - padRef.current;
    const mins = Math.max(0, Math.min(1439, Math.round((cy / PPH) * 60)));
    setCenterTime(fromMin(mins));
    setAtRight(sc.scrollLeft > (sc.scrollWidth - sc.clientWidth) / 2);
  };
  useEffect(() => {
    if (loading || range !== "day") return;
    const sc = scrollRef.current;
    if (sc) setTimeout(() => { padRef.current = Math.round(sc.clientHeight / 2); center(false); onScroll(); }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, range]);

  // CRUD
  const toggle = async (e: DayEntry) => {
    const st = e.status === "done" ? "planned" : "done";
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: st } : x)));
    try { await updateDayEntry(e.id, { status: st }); } catch { /* noop */ }
  };
  const setStatus = async (e: DayEntry, st: string) => {
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: st } : x)));
    setDetail((d) => (d && d.id === e.id ? { ...d, status: st } : d));
    try { await updateDayEntry(e.id, { status: st }); } catch { /* noop */ }
  };
  const saveDetail = async (e: DayEntry) => {
    setEntries((es) => es.map((x) => (x.id === e.id ? e : x)));
    try { await updateDayEntry(e.id, { title: e.title, time: e.time || undefined, note: e.note || undefined, important: e.important }); } catch { /* noop */ }
    setDetail(null);
  };
  const removeEntry = async (e: DayEntry) => {
    setEntries((es) => es.filter((x) => x.id !== e.id));
    setDetail(null);
    try { await deleteDayEntry(e.id); } catch { /* noop */ }
  };

  // плавающие чипы — перетаскивание
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onFloatDown = (id: string, defTop: number, defLeft: number) => (ev: RPointerEvent<HTMLDivElement>) => {
    const p = pos[id];
    drag.current = { id, sx: ev.clientX, sy: ev.clientY, ox: p ? p.x : defLeft, oy: p ? p.y : defTop };
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  };
  const onFloatMove = (ev: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    setPos((p) => ({ ...p, [d.id]: { x: d.ox + ev.clientX - d.sx, y: d.oy + ev.clientY - d.sy } }));
  };
  const onFloatUp = () => {
    if (drag.current) { try { localStorage.setItem("myday_pos", JSON.stringify(pos)); } catch { /* noop */ } drag.current = null; }
  };

  // salute
  const salute = () => (
    <span style={{ position: "relative", display: "inline-block", width: 16, height: 16, verticalAlign: "middle" }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <i key={i} style={{ position: "absolute", left: "50%", top: "50%", width: 3, height: 3, borderRadius: "50%", "--sx": `${Math.cos(a) * 8}px`, "--sy": `${Math.sin(a) * 8}px`, background: ["#EF5A6A", "#E0902A", "#42C593", "#8FA0FF", "#F0B45A"][i % 5], animation: "mdSalute 1.6s ease-out 2", animationDelay: `${(i % 4) * 0.18}s` } as CSSProperties} />;
      })}
    </span>
  );

  const GUT = 60;
  const dayItems = (byDay[todayStr] || []).filter((e) => e.kind !== "hint");
  const nextT = dayItems.filter((e) => e.status === "planned" && (e.time || "") >= hm && e.time).sort((a, b) => ((a.time || "") < (b.time || "") ? -1 : 1))[0]?.time;
  const trip = dayItems.find((e) => e.status === "planned" && (e.time || "") > hm);
  const [leaveTarget] = useState(() => Date.now() + 10 * 60 * 1000);
  const [leaveLeft, setLeaveLeft] = useState(600);
  useEffect(() => {
    if (range !== "day") return;
    const t = setInterval(() => setLeaveLeft(Math.max(0, Math.round((leaveTarget - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [range, leaveTarget]);
  const playChime = () => {
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const c = new AC(); const t0 = c.currentTime;
      [880, 1174.7].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + i * 0.16); g.gain.linearRampToValueAtTime(0.25, t0 + i * 0.16 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.16 + 0.35);
        o.connect(g).connect(c.destination); o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.36);
      });
    } catch { /* noop */ }
  };

  // ── РЕКА (День) ──
  const renderRiver = () => {
    const pad = padRef.current;
    const laneW = (scrollRef.current?.clientWidth || 380);
    const mainEvW = laneW - GUT - 16;
    const rlaneW = Math.max(280, laneW - 24);
    const totalH = 24 * PPH + 2 * pad + 140;
    const linked = LINKED[selLinked];
    return (
      <div style={{ position: "relative", height: totalH, width: laneW + 14 + rlaneW }}>
        {/* левая колонка: часы + погода + части суток */}
        <div style={{ position: "absolute", left: 0, top: 0, width: GUT, height: totalH, background: "#F5F7FB", borderRight: "1px solid var(--bg-glass-border)", zIndex: 2, pointerEvents: "none" }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ position: "absolute", top: (h / 1) * PPH + pad - 6, right: 7, fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)" }}>{String(h).padStart(2, "0")}:00</div>
          ))}
          {PARTS.map((p) => (
            <div key={p.l} style={{ position: "absolute", top: yOf(p.t) - 4, left: 0, width: "100%", textAlign: "center", fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, color: "var(--accent)", opacity: 0.75 }}>{p.l}</div>
          ))}
          {WEATHER.map((w) => (
            <div key={w.t} style={{ position: "absolute", top: yOf(w.t) - 2, left: 5, fontSize: 13, lineHeight: 1, textAlign: "center" }}>{w.ic}<div style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "monospace" }}>{w.tp}</div></div>
          ))}
        </div>
        {/* часовая сетка */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ position: "absolute", top: (h / 1) * PPH + pad, left: GUT, width: laneW - GUT, borderTop: "1px solid var(--bg-glass-border)" }} />
        ))}
        {/* дела */}
        {dayItems.map((e) => {
          const done = e.status === "done";
          const accent = e.important ? "#E0555F" : "#E0902A";
          const isNext = e.time === nextT && !done;
          const past = !!e.time && toMin(e.time) < toMin(hm) && !isNext;
          const op = past ? Math.max(0.34, 0.62 - ((toMin(hm) - toMin(e.time || "0:0")) / 60) * 0.05) : 1;
          return (
            <div key={e.id} onClick={() => setDetail(e)} style={{ position: "absolute", top: yOf(e.time || "0:0"), left: GUT + 8, width: mainEvW, zIndex: isNext ? 5 : 3, opacity: op, animation: "mdFade .4s ease", cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: isNext ? "#FFFFFF" : "var(--bg-glass)", border: `1.5px solid ${isNext ? "#E0902A" : done ? "var(--bg-glass-border)" : accent + "66"}`, borderRadius: 11, padding: "7px 9px", boxShadow: isNext ? "0 10px 24px -12px rgba(224,144,42,.55)" : "none", animation: isNext ? "mdPulse 2.8s ease-in-out infinite" : undefined }}>
                <button onClick={(ev) => { ev.stopPropagation(); toggle(e); }} style={{ width: 20, height: 20, borderRadius: 6, border: `1.6px solid ${done ? "#1F9E6E" : accent}`, background: done ? "#1F9E6E" : "transparent", color: "#fff", fontSize: 12, flex: "0 0 auto", marginTop: 1, cursor: "pointer" }}>{done ? "✓" : ""}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: (done || e.status === "cancelled") ? "line-through" : "none" }}>
                    {(isNext || e.important) && !done && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#E0902A", marginRight: 4, verticalAlign: "middle" }} />}
                    <span style={{ color: done ? "var(--text-muted)" : accent, fontWeight: 700, fontSize: isNext ? 15 : 13.5 }}>{e.time}</span> · {e.title}
                  </div>
                  {e.note && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{e.note}</div>}
                </div>
              </div>
            </div>
          );
        })}
        {/* сигналы (пропущенные) — плавающие */}
        {signals.map((s, i) => {
          const id = `sig${i}`; const p = pos[id];
          return (
            <div key={id} onPointerDown={onFloatDown(id, yOf(s.time) - 16, 118)} onPointerMove={onFloatMove} onPointerUp={onFloatUp}
              style={{ position: "absolute", top: p ? p.y : yOf(s.time) - 16, left: p ? p.x : 118, maxWidth: 210, fontSize: 11.5, color: "var(--text-primary)", background: "rgba(66,197,147,.20)", border: "1px solid #1F9E6E", borderRadius: 12, padding: "6px 10px", zIndex: 10, boxShadow: "0 6px 18px -8px rgba(20,24,38,.28)", cursor: "grab", touchAction: "none" }}>
              ⠿ {s.kind === "call" ? "📞 Пропущенный" : "💬"}: {s.name}
            </div>
          );
        })}
        {/* демо-подсказки — плавающие */}
        {FLOATS.map((f) => {
          const p = pos[f.id];
          const bg = f.cls === "hint" ? "rgba(132,147,255,.22)" : f.cls === "afisha" ? "rgba(224,110,140,.20)" : "rgba(240,180,90,.24)";
          const bd = f.cls === "hint" ? "var(--accent)" : f.cls === "afisha" ? "#D9698A" : "#E0A24A";
          return (
            <div key={f.id} onPointerDown={onFloatDown(f.id, yOf(f.t) - 16, f.x)} onPointerMove={onFloatMove} onPointerUp={onFloatUp}
              style={{ position: "absolute", top: p ? p.y : yOf(f.t) - 16, left: p ? p.x : f.x, maxWidth: 210, fontSize: 10.5, color: "var(--text-primary)", background: bg, border: `1px solid ${bd}`, borderRadius: 12, padding: "5px 9px", zIndex: 9, boxShadow: "0 6px 18px -8px rgba(20,24,38,.28)", cursor: "grab", touchAction: "none" }}>
              ⠿ {f.html}
            </div>
          );
        })}
        {/* линия «сейчас» */}
        <div style={{ position: "absolute", top: yOf(hm), left: GUT, width: laneW - GUT, borderTop: "1px dashed var(--accent)", zIndex: 3, opacity: 0.55 }}>
          <span style={{ position: "absolute", top: -8, left: 0, fontFamily: "monospace", fontSize: 9, fontWeight: 600, color: "var(--accent)", background: "#F5F7FB", padding: "0 4px" }}>● сейчас</span>
        </div>
        {/* день рождения + без времени */}
        <div style={{ position: "absolute", top: 24 * PPH + pad + 24, left: GUT + 8, width: laneW - GUT - 8 }}>
          {(byBday[todayStr] || []).map((n, i) => (
            <div key={i} style={{ fontSize: 13, color: "#E0902A", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>🎂 {salute()} День рождения: <b style={{ color: "var(--text-primary)" }}>{n}</b></div>
          ))}
        </div>
        {/* правое поле: связанные дни */}
        <div style={{ position: "absolute", top: 0, left: laneW + 14, width: rlaneW, height: totalH, borderLeft: "1px dashed var(--bg-glass-border)" }}>
          <div style={{ position: "sticky", top: 14, padding: "14px 12px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>Связанные дни →</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {LINKED.map((x, i) => (
                <button key={i} onClick={() => setSelLinked(i)} style={{ fontSize: 11, fontWeight: 600, border: `1px solid ${i === selLinked ? "var(--accent)" : "var(--bg-glass-border)"}`, background: i === selLinked ? "var(--accent)" : "#fff", color: i === selLinked ? "#fff" : "var(--text-secondary)", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>{x.name}</button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>День: <b style={{ color: "var(--text-primary)" }}>{linked.name}</b> · {linked.rel} · синхронизировано</div>
            {linked.items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 9px", borderRadius: 10, background: it.shared ? "rgba(132,147,255,.12)" : "var(--bg-glass)", border: `1px solid ${it.shared ? "var(--accent)" : "var(--bg-glass-border)"}`, marginBottom: 7, fontSize: 12 }}>
                <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", minWidth: 38 }}>{it.t}</span>
                <span style={{ color: "var(--text-primary)" }}>{it.title}{it.shared && <b style={{ color: "var(--accent)", fontSize: 10.5 }}> · общее</b>}</span>
              </div>
            ))}
            <button onClick={() => { setSheet(true); }} style={{ width: "100%", height: 40, marginTop: 4, border: "1px dashed var(--accent)", background: "rgba(132,147,255,.10)", color: "var(--accent)", fontWeight: 600, fontSize: 13, borderRadius: 12, cursor: "pointer" }}>＋ Предложить общее дело</button>
          </div>
        </div>
      </div>
    );
  };

  // ── НЕДЕЛЯ ──
  const renderWeek = () => (
    <div>
      {days.map((d) => {
        const de = (byDay[d] || []).slice().sort((a, b) => ((a.time || "99") < (b.time || "99") ? -1 : 1));
        const [, m, dd] = d.split("-").map(Number);
        const dt = new Date(d);
        const lab = d === todayStr ? "Сегодня" : `${WD[dt.getDay()]}, ${dd} ${MON[m - 1]}`;
        return (
          <div key={d} style={{ padding: "9px 0", borderTop: "1px solid var(--bg-glass-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: d === todayStr ? "var(--accent)" : "var(--text-primary)" }}>{lab}{HOL[d.slice(5)] && <span style={{ color: "#E0902A", marginLeft: 6 }}>🎆 {HOL[d.slice(5)]}</span>}</div>
            {de.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>— свободно</div> : de.map((e) => (
              <div key={e.id} onClick={() => setDetail(e)} style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 13, cursor: "pointer" }}>
                <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", minWidth: 44 }}>{e.time || "—"}</span>
                <span style={{ color: e.important ? "#E0555F" : "var(--text-primary)", textDecoration: e.status === "done" ? "line-through" : "none" }}>{e.title}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  // ── МЕСЯЦ ──
  const renderMonth = () => {
    const [y, m] = todayStr.split("-").map(Number);
    const start = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const dim = new Date(y, m, 0).getDate();
    const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
    return (
      <div>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{MN[m - 1]} {y}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", paddingBottom: 2 }}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const cnt = (byDay[ds] || []).filter((e) => e.kind !== "hint").length;
            const hol = HOL[ds.slice(5)]; const isT = ds === todayStr;
            return (
              <div key={i} onClick={() => { if (ds === todayStr) setRange("day"); }} style={{ minHeight: 58, border: `1px solid ${isT ? "var(--accent)" : "var(--bg-glass-border)"}`, boxShadow: isT ? "0 0 0 1px var(--accent)" : "none", borderRadius: 9, padding: 4, fontSize: 11, background: "#fff", cursor: isT ? "pointer" : "default" }}>
                <div style={{ fontWeight: 600 }}>{d}{hol && " 🎆"}{(byBday[ds] || []).length > 0 && " 🎂"}</div>
                {cnt > 0 && <div style={{ color: "var(--accent)", fontSize: 12, letterSpacing: 1, marginTop: 2 }}>{"•".repeat(Math.min(cnt, 5))}</div>}
                {hol && <div style={{ fontSize: 8.5, marginTop: 2, color: "#E0902A", lineHeight: 1.1 }}>{hol}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── ГОД ──
  const renderYear = () => {
    const y = Number(todayStr.slice(0, 4)); const curM = Number(todayStr.slice(5, 7)) - 1;
    return (
      <div>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{y}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          {Array.from({ length: 12 }, (_, m) => {
            const hols = Object.keys(HOL).filter((k) => +k.slice(0, 2) === m + 1);
            return (
              <div key={m} onClick={() => { if (m === curM) setRange("month"); }} style={{ border: `1px solid ${m === curM ? "var(--accent)" : "var(--bg-glass-border)"}`, borderRadius: 11, padding: 9, background: "#fff", minHeight: 58, cursor: m === curM ? "pointer" : "default" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{MNS[m]}</div>
                {hols.map((k) => <div key={k} style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}>🎆 {HOL[k]}</div>)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── ГОЛОСОВОЙ МАСТЕР (заполняет форму по вопросам) ──
  const [wizMsg, setWizMsg] = useState("");
  const [f, setF] = useState({ what: "", when: "", where: "", who: "", note: "" });
  const wizRef = useRef(false);
  const runWiz = async () => {
    if (wizRef.current) return; wizRef.current = true; setSheet(true);
    const steps: [string, keyof typeof f, string][] = [
      ["Как назовём дело?", "what", "Встреча с инвестором"], ["Во сколько?", "when", "15:00"],
      ["Где встречаемся?", "where", "Кафе «Циферблат»"], ["С кем?", "who", "Андрей П."],
      ["Добавить комментарий?", "note", "Подготовить презентацию"],
    ];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const [q, k, a] of steps) { setWizMsg(q); await sleep(850); setF((x) => ({ ...x, [k]: a })); await sleep(450); }
    setWizMsg("Готово — проверь и жми «Добавить в день» ✓"); wizRef.current = false;
  };
  const addFromSheet = async () => {
    if (!f.what.trim()) return;
    const note = [f.note, f.where && `📍 ${f.where}`, f.who && `👥 ${f.who}`].filter(Boolean).join(" · ");
    try { await addDayEntry({ title: f.what.trim(), time: f.when.trim() || undefined, note: note || undefined }); } catch { /* noop */ }
    setF({ what: "", when: "", where: "", who: "", note: "" }); setWizMsg(""); setSheet(false); load();
  };

  const light: CSSProperties = {
    ["--bg-deep" as string]: "#EEF1F6", ["--text-primary" as string]: "#161A24", ["--text-secondary" as string]: "#4A5266",
    ["--text-muted" as string]: "#8790A5", ["--bg-glass" as string]: "#FFFFFF", ["--bg-glass-border" as string]: "#DCE1EC", ["--accent" as string]: "#5B4BF0",
  } as CSSProperties;

  const holToday = HOL[todayStr.slice(5)];

  return (
    <div className="fixed inset-0 flex flex-col animate-fade-in" style={{ zIndex: 200, background: "#EEF1F6", ...light }}>
      <style>{`@keyframes mdFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes mdPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.012)}}@keyframes mdSalute{0%{transform:translate(-50%,-50%);opacity:0}12%{opacity:1}100%{transform:translate(calc(-50% + var(--sx)),calc(-50% + var(--sy)));opacity:0}}`}</style>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 shrink-0" style={{ borderBottom: "1px solid var(--bg-glass-border)", background: "#fff" }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "radial-gradient(circle at 30% 30%,#8FA0FF,#5B4BF0)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>Дж</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)" }}>Мой день</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>сейчас <b style={{ color: "var(--accent)" }}>{hm}</b> · {todayHuman} · ведёт помощник {range === "day" && holToday && <span style={{ color: "#E0902A", fontWeight: 600 }}>· 🎆 {holToday}</span>}</div>
          </div>
          {range === "day" && <button onClick={() => { const sc = scrollRef.current; if (sc) sc.scrollTo({ left: atRight ? 0 : sc.scrollWidth - sc.clientWidth, behavior: "smooth" }); }} style={{ fontSize: 11.5, fontWeight: 600, background: "#fff", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}>{atRight ? "← Мой день" : "Связанные →"}</button>}
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <div className="flex gap-0.5 p-0.5 rounded-lg mt-2.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", width: "fit-content" }}>
          {RANGE.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className="px-3 py-1 rounded-md text-[12px] font-medium"
              style={{ background: range === r.id ? "var(--accent)" : "transparent", color: range === r.id ? "#fff" : "var(--text-secondary)" }}>{r.lab}</button>
          ))}
        </div>
      </div>

      {/* Контент */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0" style={{ overflow: range === "day" ? "auto" : "hidden auto", padding: range === "day" ? 0 : "14px 16px", WebkitOverflowScrolling: "touch" }}>
          {loading ? <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 24, textAlign: "center" }}>Загрузка…</div>
            : range === "day" ? renderRiver() : range === "week" ? renderWeek() : range === "month" ? renderMonth() : renderYear()}
        </div>
        {range === "day" && !loading && (
          <>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80, background: "linear-gradient(#EEF1F6 22%, transparent)", pointerEvents: "none", zIndex: 6 }} />
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)", zIndex: 8, pointerEvents: "none" }}>
              <div style={{ borderTop: "2px solid var(--accent)", position: "relative", margin: `0 6px 0 ${GUT}px` }}>
                <span style={{ position: "absolute", top: -11, left: 0, fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "#fff", background: "var(--accent)", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap", boxShadow: "0 0 0 3px #EEF1F6" }}>{centerTime || hm} · {todayHuman}</span>
                <button onClick={() => center(true)} style={{ position: "absolute", top: -13, right: 0, fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "#fff", border: "1px solid var(--accent)", borderRadius: 20, padding: "3px 12px", pointerEvents: "auto", cursor: "pointer", boxShadow: "0 0 0 3px #EEF1F6" }}>Сейчас</button>
              </div>
            </div>
            {/* Пора выходить */}
            <div onClick={playChime} style={{ position: "absolute", left: 8, right: 8, bottom: 10, zIndex: 12, display: "flex", gap: 9, alignItems: "center", background: leaveLeft <= 0 ? "#FCEDEE" : "#fff", border: `1.5px solid ${leaveLeft <= 0 ? "#E0555F" : "#E0902A"}`, borderRadius: 14, padding: "8px 12px", boxShadow: "0 12px 30px -16px rgba(20,24,38,.4)", cursor: "pointer", animation: leaveLeft <= 0 ? "mdPulse 1s ease-in-out infinite" : undefined }}>
              <span style={{ fontSize: 17 }}>🚗</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: leaveLeft <= 0 ? "#E0555F" : "#E0902A" }}>{leaveLeft <= 0 ? "0:00" : `${Math.floor(leaveLeft / 60)}:${String(leaveLeft % 60).padStart(2, "0")}`}</span>
              <span style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.2 }}>{leaveLeft <= 0 ? "Пора выходить! Заканчивай дело — успеешь к следующему" : trip ? `Пора выходить в ${fromMin(Math.max(0, toMin(trip.time || "0:0") - 40))} · до «${trip.title}» ~40 мин — Дженни предупредит` : "Дженни следит за выходом к следующему делу"}</span>
              <span style={{ fontSize: 15 }}>🔔</span>
            </div>
          </>
        )}
      </div>

      {/* Композер */}
      <div className="flex gap-2.5 items-center px-3 py-2.5 shrink-0" style={{ borderTop: "1px solid var(--bg-glass-border)", background: "#fff", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <button onClick={() => { setSheet(true); }} style={{ flex: 1, height: 44, border: "1px dashed var(--bg-glass-border)", background: "var(--bg-glass)", color: "var(--text-primary)", borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>＋ Добавить дело</button>
        <button onClick={runWiz} style={{ width: 44, height: 44, borderRadius: 14, background: "radial-gradient(circle at 30% 30%,#8FA0FF,#5B4BF0)", color: "#fff", border: 0, fontSize: 18, cursor: "pointer" }}>🎙</button>
      </div>

      {/* Лист добавления */}
      {sheet && (
        <div style={{ position: "absolute", left: 8, right: 8, bottom: 70, background: "#fff", border: "1px solid var(--bg-glass-border)", borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 8, zIndex: 30, boxShadow: "0 24px 70px -20px rgba(20,24,38,.4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}><b>Новое дело</b><span onClick={() => setSheet(false)} style={{ cursor: "pointer", color: "var(--text-muted)" }}>✕</span></div>
          {wizMsg && <div style={{ background: "rgba(132,147,255,.14)", border: "1px solid var(--accent)", borderRadius: 12, padding: "9px 11px", fontSize: 12 }}><b style={{ color: "var(--accent)" }}>Дженни:</b> {wizMsg}</div>}
          <input value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} placeholder="Что — название дела" style={inp} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} placeholder="Когда · чч:мм" style={{ ...inp, flex: "0 0 108px" }} />
            <input value={f.where} onChange={(e) => setF({ ...f, where: e.target.value })} placeholder="Где · место" style={{ ...inp, flex: 1 }} />
          </div>
          <input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder="С кем" style={inp} />
          <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Комментарий" rows={2} style={{ ...inp, resize: "none", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runWiz} style={{ padding: "0 14px", height: 40, fontSize: 13, fontWeight: 600, borderRadius: 11, border: 0, color: "#fff", cursor: "pointer", background: "radial-gradient(circle at 30% 30%,#8FA0FF,#5B4BF0)" }}>🎙 Голосом</button>
            <button onClick={addFromSheet} style={{ flex: 1, height: 40, border: 0, borderRadius: 11, background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Добавить в день</button>
          </div>
        </div>
      )}

      {/* Карточка «дело» */}
      {detail && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }} style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(20,24,38,.30)", backdropFilter: "blur(2px)" }}>
          <div style={{ position: "absolute", left: 10, right: 10, top: 44, bottom: 10, background: "#fff", border: "1px solid var(--bg-glass-border)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 90px -20px rgba(20,24,38,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: "1px solid var(--bg-glass-border)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: detail.status === "done" ? "#1F9E6E" : detail.status === "cancelled" ? "#E0555F" : detail.important ? "#E0555F" : "#E0902A" }} />
              <input value={detail.title} onChange={(e) => setDetail({ ...detail, title: e.target.value })} style={{ flex: 1, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 17, fontWeight: 700, border: 0, outline: "none", color: "var(--text-primary)", background: "transparent" }} />
              <span onClick={() => setDetail(null)} style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 18 }}>✕</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Fld k="Когда"><input value={detail.time || ""} onChange={(e) => setDetail({ ...detail, time: e.target.value })} style={fv} /></Fld>
                <Fld k="Важное"><button onClick={() => setDetail({ ...detail, important: !detail.important })} style={{ ...fv, cursor: "pointer", textAlign: "left" }}>{detail.important ? "🔴 да" : "— нет"}</button></Fld>
              </div>
              <Fld k="Карта"><div style={{ height: 100, borderRadius: 12, border: "1px solid var(--bg-glass-border)", background: "linear-gradient(135deg,#EEF2FA,#E3E9F4)", position: "relative" }}><span style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-100%)", fontSize: 20 }}>📍</span></div></Fld>
              <Fld k="Комментарий"><textarea value={detail.note || ""} onChange={(e) => setDetail({ ...detail, note: e.target.value })} style={{ ...fv, minHeight: 52, resize: "none", fontFamily: "inherit" }} /></Fld>
              <Fld k="Вложения"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span style={att}>📄 Вопросы для обсуждения</span><span style={att}>🎬 Видео 0:42</span><span style={{ ...att, borderStyle: "dashed" }}>＋ прикрепить</span></div></Fld>
              <Fld k="Итог / результат">
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
                  <button onClick={() => setStatus(detail, "done")} style={{ ...rbtn, borderColor: "#1F9E6E", color: "#1F9E6E" }}>✅ Выполнено</button>
                  <button onClick={() => setStatus(detail, "moved")} style={rbtn}>↪ Перенести</button>
                  <button onClick={() => setStatus(detail, "cancelled")} style={{ ...rbtn, borderColor: "#E0555F", color: "#E0555F" }}>❌ Отменено</button>
                </div>
                <textarea placeholder="Записать результат: что вышло, договорённости, следующий шаг…" style={{ ...fv, minHeight: 48, resize: "none", fontFamily: "inherit" }} />
              </Fld>
            </div>
            <div style={{ padding: "11px 14px", borderTop: "1px solid var(--bg-glass-border)", display: "flex", gap: 9 }}>
              <button onClick={() => removeEntry(detail)} style={{ width: 46, height: 42, borderRadius: 12, background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "#E0555F", cursor: "pointer" }}>🗑</button>
              <button onClick={() => saveDetail(detail)} style={{ flex: 1, height: 42, borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, border: 0, cursor: "pointer" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: CSSProperties = { background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 11, padding: "9px 12px", fontSize: 13, color: "var(--text-primary)", outline: "none" };
const fv: CSSProperties = { width: "100%", fontSize: 13.5, color: "var(--text-primary)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 10, padding: "8px 11px", outline: "none" };
const att: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 10, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "var(--text-primary)" };
const rbtn: CSSProperties = { fontSize: 12, fontWeight: 600, border: "1px solid var(--bg-glass-border)", background: "var(--bg-glass)", color: "var(--text-primary)", borderRadius: 10, padding: "7px 11px", cursor: "pointer" };
function Fld({ k, children }: { k: string; children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{k}</span>{children}</div>;
}
