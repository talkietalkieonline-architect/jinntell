"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getWalletMoney, topupWallet, type WalletMoney } from "@/services/api";

const KIND_LABEL: Record<string, string> = {
  topup: "Пополнение", spend: "Списание", refund: "Возврат",
  bonus_grant: "Бонус начислен", bonus_spend: "Списание бонуса", sponsor_spend: "Бонус спонсора", adjust: "Корректировка",
};
const AMOUNTS = [100, 300, 500, 1000, 2000];

export default function WalletPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [w, setW] = useState<WalletMoney | null>(null);
  const [amount, setAmount] = useState(500);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cur = w?.currency || "₽";

  const load = useCallback(async () => {
    try { setW(await getWalletMoney()); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (isLoggedIn === false) { router.replace("/"); return; }
    if (isLoggedIn) load();
  }, [isLoggedIn, load, router]);

  const doTopup = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await topupWallet(amount);
      if (r.confirmation_url) { window.location.href = r.confirmation_url; }
      else setErr("Не получили ссылку на оплату.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Пополнение недоступно"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d12", color: "#e8eaed" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <Link href="/" style={{ color: "#8b93a7", textDecoration: "none", fontSize: 14 }}>← Домой</Link>
          <span style={{ fontSize: 13, color: "#8b93a7" }}>Кошелёк</span>
        </div>

        {/* Баланс */}
        <div style={{ background: "linear-gradient(135deg,#1a2033,#12151d)", border: "1px solid #232a3a", borderRadius: 20, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "#8b93a7", marginBottom: 6 }}>Баланс</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            {w ? w.balance_rub.toLocaleString("ru") : "…"} <span style={{ fontSize: 24, color: "#8b93a7" }}>{cur}</span>
          </div>
          {w && w.bonuses.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {w.bonuses.map((b, i) => (
                <span key={i} style={{ fontSize: 12, background: "#1e2b1e", color: "#8fe3a0", border: "1px solid #2c4a2c", borderRadius: 999, padding: "4px 10px" }}>
                  🎁 {b.display_tokens ? `${b.display_tokens.toLocaleString("ru")} токенов` : `${b.remaining_rub} ${cur}`}{b.label ? ` · ${b.label}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Пополнение */}
        <div style={{ background: "#12151d", border: "1px solid #232a3a", borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Пополнить</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)} style={{
                padding: "8px 14px", borderRadius: 12, fontSize: 14, cursor: "pointer",
                border: amount === a ? "1px solid #4f7cff" : "1px solid #2a3142",
                background: amount === a ? "#1c2740" : "#161a24", color: "#e8eaed",
              }}>{a} {cur}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" value={amount} min={10} onChange={(e) => setAmount(Number(e.target.value) || 0)}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "#0b0d12", border: "1px solid #2a3142", color: "#e8eaed", fontSize: 15 }} />
            <button onClick={doTopup} disabled={busy || amount < 10} style={{
              padding: "10px 20px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
              border: "none", background: busy ? "#2a3142" : "#4f7cff", color: "#fff", opacity: amount < 10 ? 0.5 : 1,
            }}>{busy ? "…" : "Оплатить"}</button>
          </div>
          {err && <div style={{ marginTop: 10, fontSize: 13, color: "#ff8b8b" }}>{err}</div>}
          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>Оплата через ЮKassa. Средства — предоплата услуг, возврат по запросу.</div>
        </div>

        {/* История */}
        <div style={{ background: "#12151d", border: "1px solid #232a3a", borderRadius: 20, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>История</div>
          {!w || w.history.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>Пока пусто.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {w.history.map((t, i) => {
                const pos = t.amount_rub >= 0;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1b202b" }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{KIND_LABEL[t.kind] || t.kind}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{t.description || ""}{t.created_at ? ` · ${new Date(t.created_at).toLocaleDateString("ru")}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: pos ? "#8fe3a0" : "#e8eaed", whiteSpace: "nowrap" }}>
                      {pos ? "+" : ""}{t.amount_rub.toLocaleString("ru")} {cur}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
