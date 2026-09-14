"use client";
import { useEffect, useState } from "react";
import { getStore, buyStoreItem, applyStoreItem, updateMe, type StoreItem, type StoreOut } from "@/services/api";

const TABS: { id: string; label: string }[] = [
  { id: "wallpaper", label: "Обои" },
  { id: "live_wallpaper", label: "Живые обои" },
  { id: "voice", label: "Голоса" },
];

export default function StoreModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<StoreOut | null>(null);
  const [tab, setTab] = useState("wallpaper");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => { getStore().then(setData).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const owned = new Set(data?.owned || []);
  const cur = data?.currency || "₽";
  const items = (data?.items || []).filter((i) => i.category === tab);

  const buy = async (it: StoreItem) => {
    setBusy(it.id);
    try { const r = await buyStoreItem(it.id); if (r.owned) setData((d) => d ? { ...d, owned: r.owned, balance_rub: r.balance_rub ?? d.balance_rub } : d); }
    catch (e) { alert(e instanceof Error ? e.message : "Не удалось купить"); }
    finally { setBusy(null); }
  };
  const apply = async (it: StoreItem) => {
    setBusy(it.id);
    try {
      await applyStoreItem(it.id);
      // мгновенно отразить у пользователя
      if (it.payload_kind === "background") { try { await updateMe({ background: it.payload } as Parameters<typeof updateMe>[0]); } catch { /* noop */ } window.dispatchEvent(new Event("jinntell_bg_change")); }
      if (it.payload_kind === "voice") { try { await updateMe({ assistant_voice: it.payload } as Parameters<typeof updateMe>[0]); } catch { /* noop */ } }
      alert("Применено ✓");
    } catch (e) { alert(e instanceof Error ? e.message : "Не удалось применить"); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center animate-fade-in" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: "var(--panel-bg, #12121a)", border: "1px solid var(--bg-glass-border)" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>🛍 Магазин</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>✕</button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Баланс: <b style={{ color: "var(--accent)" }}>{data ? data.balance_rub.toLocaleString("ru") : "…"} {cur}</b> · оплата с баланса кошелька</p>

        <div className="flex gap-1.5 mb-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all" style={{ background: tab === t.id ? "var(--accent)" : "var(--bg-glass)", color: tab === t.id ? "var(--bg-deep)" : "var(--text-secondary)", border: `1px solid ${tab === t.id ? "var(--accent)" : "var(--bg-glass-border)"}` }}>{t.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {items.map((it) => {
            const has = owned.has(it.id) || it.price_rub === 0;
            return (
              <div key={it.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
                <div className="h-16 rounded-lg flex items-center justify-center text-3xl" style={{ background: "var(--bg-deep)" }}>{it.preview}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{it.name}</div>
                  <div className="text-[11px]" style={{ color: it.price_rub === 0 ? "#3ecf6a" : "var(--text-muted)" }}>{it.price_rub === 0 ? "бесплатно" : `${it.price_rub.toLocaleString("ru")} ${cur}`}{it.premium ? " · premium" : ""}</div>
                </div>
                {owned.has(it.id) || it.price_rub === 0 ? (
                  <button onClick={() => apply(it)} disabled={busy === it.id} className="w-full py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: "var(--accent)", color: "var(--bg-deep)", opacity: busy === it.id ? 0.6 : 1 }}>{busy === it.id ? "…" : "Применить"}</button>
                ) : (
                  <button onClick={() => buy(it)} disabled={busy === it.id} className="w-full py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: "var(--bg-deep)", color: "var(--accent)", border: "1px solid var(--accent)", opacity: busy === it.id ? 0.6 : 1 }}>{busy === it.id ? "…" : `Купить · ${it.price_rub} ${cur}`}</button>
                )}
                {has && !owned.has(it.id) ? null : owned.has(it.id) && <div className="text-[10px] text-center" style={{ color: "#3ecf6a" }}>✓ куплено</div>}
              </div>
            );
          })}
          {items.length === 0 && <p className="col-span-2 text-[12px] text-center py-6" style={{ color: "var(--text-muted)", opacity: 0.6 }}>Пока пусто.</p>}
        </div>
      </div>
    </div>
  );
}
