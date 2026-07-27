export default function Page() {
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 24px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Journal</h1>
      <p style={{ color: "#555" }}>
        Backend privado. La captura entra por el bot de Telegram y se escribe en Notion; los
        resúmenes salen por mail vía cron.
      </p>
    </main>
  );
}
