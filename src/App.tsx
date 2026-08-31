import { FormEvent, useState } from "react";

const OFFICE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const labels = ["Muy mala", "Mala", "Aceptable", "Buena", "Excelente"];

export default function App() {
  const office = new URLSearchParams(window.location.search).get("office")?.trim() ?? "";
  const validOffice = OFFICE_PATTERN.test(office) && office.length <= 64;
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validOffice || rating === null || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ office_id: office, satisfaction_level: rating, comment }),
      });
      if (!response.ok) throw new Error();
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError("No hemos podido enviar tu valoración. Inténtalo de nuevo.");
    }
  }

  if (status === "sent") {
    return <main className="card success"><div className="check" aria-hidden="true">✓</div><h1>¡Gracias por tu valoración!</h1><p>Tu opinión nos ayuda a mejorar la atención que ofrecemos.</p></main>;
  }

  return (
    <main className="card">
      <header><span className="eyebrow">SERVICIOS PÚBLICOS</span><h1>Tu opinión nos ayuda a mejorar</h1><p>La encuesta es anónima y solo te llevará unos segundos.</p></header>
      {!validOffice ? (
        <div className="notice error" role="alert"><strong>No se ha identificado la oficina.</strong><br />Accede de nuevo usando el código QR de la oficina.</div>
      ) : (
        <form onSubmit={submit}>
          <fieldset><legend>¿Cómo valorarías la atención recibida?</legend><div className="ratings">
            {labels.map((label, index) => { const value = index + 1; return (
              <label className={rating === value ? "selected" : ""} key={value}>
                <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
                <span className="number">{value}</span><span>{label}</span>
              </label>
            ); })}
          </div></fieldset>
          <label className="comment">Comentario <span>(opcional)</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={4} placeholder="Cuéntanos qué podemos mejorar" /><small>{comment.length}/500</small></label>
          {error && <div className="notice error" role="alert">{error}</div>}
          <button type="submit" disabled={rating === null || status === "sending"}>{status === "sending" ? "Enviando…" : "Enviar valoración"}</button>
          <p className="privacy">No solicitamos datos personales. La dirección IP se transforma en un código irreversible.</p>
        </form>
      )}
    </main>
  );
}
