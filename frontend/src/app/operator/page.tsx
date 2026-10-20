"use client";
/** /operator — вход оператора АЗС: показывает его станции (одна — сразу переходит в реестр). */
import { useEffect, useState } from "react";
import { login } from "@/services/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const tok = () => (typeof window !== "undefined" ? localStorage.getItem("jinntell_token") : null);

export default function OperatorHome() {
  const [stations, setStations] = useState<{ agent_id: number; name: string }[] | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    const t = tok();
    if (!t) { setNeedLogin(true); return; }
    fetch(`${API_BASE}/api/queue/my-stations`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => { if (r.status === 401) { setNeedLogin(true); return null; } return r.json(); })
      .then((d) => {
        if (!d) return;
        if (d.length === 1) { window.location.assign(`/operator/${d[0].agent_id}`); return; }
        setStations(d); setNeedLogin(false);
      })
      .catch(() => setErr("Ошибка сети."));
  };
  useEffect(load, []);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await login(phone.trim(), pass); load(); } catch { setErr("Неверный телефон или пароль."); }
  };

  const box = { background: "#15151e", border: "1px solid rgba(255,255,255,0.1)" };
  const inputStyle = { background: "rgba(255,255,255,0.06)", color: "#f5f0e8", border: "1px solid rgba(255,255,255,0.1)" };
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0a0a0a" }}>
      <div className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-3" style={box}>
        <div className="text-center text-lg font-bold" style={{ color: "#f5f0e8" }}>⛽ Оператор АЗС</div>
        {needLogin ? (
          <form onSubmit={doLogin} className="flex flex-col gap-3">
            <input className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" />
            <input className="rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} placeholder="Пароль" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
            <button className="py-2.5 rounded-xl font-semibold" style={{ background: "#d9a534", color: "#161311" }}>Войти</button>
          </form>
        ) : stations === null ? (
          <div className="text-sm text-center" style={{ color: "rgba(245,240,232,0.5)" }}>Загрузка…</div>
        ) : stations.length === 0 ? (
          <div className="text-sm text-center" style={{ color: "rgba(245,240,232,0.6)" }}>Этот аккаунт не привязан ни к одной АЗС.</div>
        ) : stations.map((s) => (
          <a key={s.agent_id} href={`/operator/${s.agent_id}`} className="py-3 px-4 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#f5f0e8" }}>{s.name}</a>
        ))}
        {err && <div className="text-xs text-center" style={{ color: "#e05555" }}>{err}</div>}
      </div>
    </div>
  );
}
