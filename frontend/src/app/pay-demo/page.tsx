/** /pay-demo — заглушка вместо платёжной ссылки СБП у демо-бизнесов (настоящая ссылка открывает приложение банка гостя). */
export default function PayDemo() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F1F2EF", color: "#17191B", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 360, width: "100%", background: "#FFFFFF", borderRadius: 24, padding: 28, boxShadow: "0 14px 40px rgba(23,25,27,.10)", display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 13, letterSpacing: ".12em", color: "#3F6B3A", fontWeight: 600 }}>ДЕМО · ОПЛАТА СБП</div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>Здесь откроется приложение вашего банка</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "#4A4F55" }}>
          У настоящей кофейни кнопка ведёт на её платёжную ссылку СБП: банк гостя подставит получателя, гость подтвердит
          сумму — деньги придут напрямую кофейне. Это демо, оплаты нет.
        </p>
        <a href="/" style={{ marginTop: 8, display: "block", padding: "14px 18px", borderRadius: 16, background: "#17191B", color: "#F6F7F4", textDecoration: "none", fontWeight: 600 }}>Вернуться в JinnTell</a>
      </div>
    </div>
  );
}
