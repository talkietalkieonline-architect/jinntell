"use client";
/**
 * Функция «Промоутер» (кабинет бизнеса): готовые решения, которые джин сам представляет и присылает PDF-презентацией.
 * Бэкенд: services/presentations.py, /api/contractor/agents/{id}/presentations.
 */
import { useEffect, useState } from "react";
import { contractorGetPresentations, contractorPutPresentations, contractorPresentationPdf, type PresentationItem } from "@/services/api";

const field = { background: "var(--bg-deep)", border: "1px solid var(--bg-glass-border)", color: "var(--text-primary)" };
const EMPTY: PresentationItem = { title: "", subtitle: "", text: "" };

export default function PresentationsEditor({ agentId, enabled }: { agentId: number; enabled: boolean }) {
  const [items, setItems] = useState<PresentationItem[]>([]);
  const [max, setMax] = useState(8);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    contractorGetPresentations(agentId).then((r) => { setItems(r.items); setMax(r.max); }).catch(() => setNote("Не удалось загрузить презентации."));
  }, [agentId]);

  const patch = (i: number, p: Partial<PresentationItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true); setNote("");
    try { const r = await contractorPutPresentations(agentId, items); setItems(r.items); setNote("Сохранено."); }
    catch (e) { setNote(e instanceof Error ? e.message : "Не удалось сохранить."); }
    setBusy(false);
  };
  const preview = async (pid?: string) => {
    if (!pid) { setNote("Сначала сохраните — потом можно посмотреть PDF."); return; }
    try { const r = await contractorPresentationPdf(agentId, pid); window.open(r.url, "_blank", "noopener"); }
    catch (e) { setNote(e instanceof Error ? e.message : "PDF не собрался."); }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)" }}>
      <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Промоутер: готовые решения</div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Джин сам представляет их новому клиенту — на «стук» Зазывалы, по QR, при первом контакте — и присылает PDF в Портфель клиента.
        В тексте: строка с «#» — заголовок раздела, «- » — пункт списка.
        {!enabled && <b style={{ color: "var(--text-secondary)" }}> Включите функцию «Промоутер: презентации» выше и сохраните джина.</b>}
      </p>
      {items.map((it, i) => (
        <div key={it.id || `new-${i}`} className="flex flex-col gap-1.5 rounded-lg p-2.5" style={{ border: "1px solid var(--bg-glass-border)" }}>
          <input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Название решения — напр. «Завтраки к времени»"
            className="rounded-lg px-3 py-2 text-sm outline-none" style={field} />
          <input value={it.subtitle} onChange={(e) => patch(i, { subtitle: e.target.value })} placeholder="Для кого и главная выгода — одной строкой"
            className="rounded-lg px-3 py-2 text-[13px] outline-none" style={field} />
          <textarea value={it.text} onChange={(e) => patch(i, { text: e.target.value })} rows={6}
            placeholder={"# Что входит\n- Заказ голосом к нужному времени\n- Оплата через СБП\n# Сколько стоит\nОт 290 ₽, по будням до 12:00"}
            className="rounded-lg px-3 py-2 text-[13px] outline-none leading-relaxed" style={field} />
          <div className="flex gap-2">
            <button type="button" onClick={() => preview(it.id)} className="px-3 py-1.5 rounded-lg text-[12px]"
              style={{ background: "var(--bg-deep)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>Посмотреть PDF</button>
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-3 py-1.5 rounded-lg text-[12px]"
              style={{ background: "transparent", border: "1px solid var(--bg-glass-border)", color: "#e05555" }}>Удалить</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        {items.length < max && (
          <button type="button" onClick={() => setItems([...items, { ...EMPTY }])} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: "var(--bg-deep)", border: "1px solid var(--accent)", color: "var(--accent)" }}>+ Решение</button>
        )}
        <button type="button" disabled={busy} onClick={save} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--bg-deep)", opacity: busy ? 0.6 : 1 }}>{busy ? "Сохраняю…" : "Сохранить решения"}</button>
        {note && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{note}</span>}
      </div>
    </div>
  );
}
