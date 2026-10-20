"use client";
/** Кнопка «Сохранить в PDF» для страниц КП: открывает печать браузера (там — «Сохранить как PDF»). */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ab-btn ab-btn-ghost ab-noprint" style={{ background: "transparent", cursor: "pointer", font: "inherit", fontWeight: 700 }}>
      Сохранить в PDF
    </button>
  );
}
