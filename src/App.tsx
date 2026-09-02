import { FormEvent, useState } from "react";

const OFFICE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const labels = ["Muy mala", "Mala", "Aceptable", "Buena", "Excelente"];

export default function App() {
  const requestedOffice = new URLSearchParams(window.location.search).get("office")?.trim() ?? "";
  const office = requestedOffice && OFFICE_PATTERN.test(requestedOffice) && requestedOffice.length <= 64
    ? requestedOffice
    : "oficina-prueba";
  const validOffice = true;
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [digitalAgentsFixed, setDigitalAgentsFixed] = useState<boolean | null>(null);
  const [otherOfficesFixed, setOtherOfficesFixed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const currentRating = hoveredRating ?? rating ?? 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validOffice || rating === null || digitalAgentsFixed === null || otherOfficesFixed === null || status === "sending") return;
    setStatus("sending");
    setError("");
    let response: Response;
    try {
      response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          office_id: office,
          satisfaction_level: rating,
          comment,
          digital_agents_fixed: digitalAgentsFixed,
          other_public_offices_fixed: otherOfficesFixed,
        }),
      });
    } catch {
      setStatus("idle");
      setError("No hemos podido enviar tu valoración. Inténtalo de nuevo.");
      return;
    }
    if (response.status === 409) {
      setStatus("idle");
      setError("Ya se ha registrado una valoración desde esta conexión.");
      return;
    }
    if (!response.ok) {
      setStatus("idle");
      setError("No hemos podido enviar tu valoración. Inténtalo de nuevo.");
      return;
    }
    setStatus("sent");
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
          <fieldset className="ratings-fieldset">
            <legend>¿Cómo valorarías la atención recibida?</legend>
            <div className="rating-stars" role="radiogroup" aria-label="Valoración de la atención recibida">
              {[1, 2, 3, 4, 5].map((value) => {
                const isFilled = value <= currentRating;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`star-button ${isFilled ? "filled" : ""} ${rating === value ? "selected" : ""}`}
                    onMouseEnter={() => setHoveredRating(value)}
                    onMouseLeave={() => setHoveredRating(null)}
                    onFocus={() => setHoveredRating(value)}
                    onBlur={() => setHoveredRating(null)}
                    onClick={() => setRating(value)}
                    aria-label={`Puntuar ${value} de 5: ${labels[value - 1]}`}
                    aria-pressed={rating === value}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                );
              })}
              <span className="rating-label">{rating ? labels[rating - 1] : "Selecciona una valoración"}</span>
            </div>
          </fieldset>

          <div className="binary-questions">
            <fieldset className="yes-no-group">
              <legend>¿Cree que los agentes de transformación digital deberían ser fijos en las oficinas de empleo, de lunes a viernes?</legend>
              <div className="choice-row">
                <label className={digitalAgentsFixed === true ? "choice selected" : "choice"}>
                  <input type="radio" name="digital-agents" checked={digitalAgentsFixed === true} onChange={() => setDigitalAgentsFixed(true)} />
                  <span>SÍ</span>
                </label>
                <label className={digitalAgentsFixed === false ? "choice selected" : "choice"}>
                  <input type="radio" name="digital-agents" checked={digitalAgentsFixed === false} onChange={() => setDigitalAgentsFixed(false)} />
                  <span>NO</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="yes-no-group">
              <legend>¿Y en otras oficinas de la administración pública como ayuntamientos, universidades, etc...?</legend>
              <div className="choice-row">
                <label className={otherOfficesFixed === true ? "choice selected" : "choice"}>
                  <input type="radio" name="other-offices" checked={otherOfficesFixed === true} onChange={() => setOtherOfficesFixed(true)} />
                  <span>SÍ</span>
                </label>
                <label className={otherOfficesFixed === false ? "choice selected" : "choice"}>
                  <input type="radio" name="other-offices" checked={otherOfficesFixed === false} onChange={() => setOtherOfficesFixed(false)} />
                  <span>NO</span>
                </label>
              </div>
            </fieldset>
          </div>

          <label className="comment">Comentario <span>(opcional)</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={4} placeholder="Cuéntanos qué podemos mejorar" /><small>{comment.length}/500</small></label>
          {error && <div className="notice error" role="alert">{error}</div>}
          <button type="submit" disabled={rating === null || digitalAgentsFixed === null || otherOfficesFixed === null || status === "sending"}>{status === "sending" ? "Enviando…" : "Enviar valoración"}</button>
          <p className="privacy">No solicitamos datos personales. La dirección IP se transforma en un código irreversible.</p>
        </form>
      )}
    </main>
  );
}
