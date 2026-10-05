"use client";
/**
 * Пропуск очереди на заправку: /q/{code}
 * Пользователь — видит свой QR-пропуск и детали.
 * Оператор АЗС — отсканировал QR телефоном → попал сюда → жмёт «Заправлен».
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface QEntry {
  code: string;
  number: number;
  car_plate: string;
  fuel_type: string;
  liters: number;
  status: string;
  agent_id: number;
}

export default function QueuePassPage() {
  const params = useParams();
  const code = ((params.code as string) || "").toUpperCase();
  const [entry, setEntry] = useState<QEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [serving, setServing] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/queue/${code}`)
      .then((r) => { if (!r.ok) throw new Error("Пропуск не найден или отменён"); return r.json(); })
      .then((d: QEntry) => { setEntry(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [code]);

  useEffect(() => { if (code) load(); }, [code, load]);

  const serve = async () => {
    setServing(true); setNote("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("jinntell_token") : null;
      const r = await fetch(`${API_BASE}/api/queue/${code}/serve`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) { setNote("✓ Отмечено «заправлен»"); load(); }
      else if (r.status === 401 || r.status === 403) { setNote("Войдите как оператор (админ), чтобы отметить."); }
      else { setNote("Не удалось отметить."); }
    } catch { setNote("Ошибка сети."); }
    finally { setServing(false); }
  };

  const wrap = "min-h-screen flex items-center justify-center p-6";
  const bg = { background: "#0a0a0a" } as const;

  if (loading) return <div className={wrap} style={bg}><div className="text-sm" style={{ color: "rgba(245,240,232,0.5)" }}>Загрузка…</div></div>;
  if (err || !entry) return (
    <div className={wrap} style={bg}>
      <div className="text-center">
        <div className="text-5xl mb-4">⛽</div>
        <div className="text-lg font-bold mb-1" style={{ color: "#f5f0e8" }}>Талон не найден</div>
        <div className="text-sm" style={{ color: "rgba(245,240,232,0.5)" }}>{err || "Проверьте код."}</div>
      </div>
    </div>
  );

  const served = entry.status === "served";
  const cancelled = entry.status === "cancelled";

  return (
    <div className={wrap} style={bg}>
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: "#15151e", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="text-center mb-4">
          <div className="text-sm uppercase tracking-widest" style={{ color: "#e0b34a" }}>Талон в очередь</div>
          <div className="text-xs mt-1" style={{ color: "rgba(245,240,232,0.45)" }}>АЗС «Газпромнефть»</div>
        </div>

        <div className="flex justify-center mb-4">
          <img src={`${API_BASE}/api/queue/${entry.code}/qr.svg`} alt="QR" width={176} height={176}
               style={{ background: "#fff", borderRadius: 14, padding: 8, opacity: served || cancelled ? 0.35 : 1 }} />
        </div>

        <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex justify-between py-1 text-sm"><span style={{ color: "rgba(245,240,232,0.55)" }}>Номер в очереди</span><span style={{ color: "#f5f0e8", fontWeight: 700 }}>{entry.number}</span></div>
          <div className="flex justify-between py-1 text-sm"><span style={{ color: "rgba(245,240,232,0.55)" }}>Гос-номер</span><span style={{ color: "#f5f0e8", fontWeight: 600 }}>{entry.car_plate}</span></div>
          <div className="flex justify-between py-1 text-sm"><span style={{ color: "rgba(245,240,232,0.55)" }}>Топливо</span><span style={{ color: "#f5f0e8" }}>{entry.fuel_type}</span></div>
          <div className="flex justify-between py-1 text-sm"><span style={{ color: "rgba(245,240,232,0.55)" }}>Литры</span><span style={{ color: "#f5f0e8" }}>{entry.liters} л</span></div>
          <div className="flex justify-between py-1 text-sm"><span style={{ color: "rgba(245,240,232,0.55)" }}>Код</span><span style={{ color: "#e0b34a", fontWeight: 700 }}>{entry.code}</span></div>
        </div>

        {served ? (
          <div className="text-center py-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(66,197,147,0.15)", color: "#42C593" }}>✓ Заправлен</div>
        ) : cancelled ? (
          <div className="text-center py-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(245,240,232,0.5)" }}>Отменён</div>
        ) : (
          <>
            <button onClick={serve} disabled={serving} className="w-full py-3 rounded-xl font-semibold transition-all active:scale-[0.98]" style={{ background: "#d9a534", color: "#161311" }}>
              {serving ? "…" : "Оператор: отметить «Заправлен»"}
            </button>
            <p className="text-center text-[11px] mt-2" style={{ color: "rgba(245,240,232,0.4)" }}>Покажите этот QR оператору. Приедете без очереди.</p>
          </>
        )}
        {note && <p className="text-center text-xs mt-3" style={{ color: "rgba(245,240,232,0.7)" }}>{note}</p>}
      </div>
    </div>
  );
}
