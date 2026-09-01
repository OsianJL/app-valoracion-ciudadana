import { FormEvent, useEffect, useMemo, useState } from "react";
import { officeNames, offices } from "./offices";

interface RatingResult {
  id: number;
  created_at: string;
  office_id: string;
  satisfaction_level: number;
  digital_agents_fixed: number;
  other_public_offices_fixed: number;
  comment: string | null;
}

interface Filters { office: string; from: string; to: string }
const emptyFilters: Filters = { office: "", from: "", to: "" };

function query(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.office) params.set("office", filters.office);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function Percentage({ label, yes, total }: { label: string; yes: number; total: number }) {
  const yesPercent = total ? Math.round(yes * 100 / total) : 0;
  return <div className="percent-stat"><strong>{label}</strong><div className="percent-values"><span>Sí: {yesPercent}%</span><span>No: {total ? 100 - yesPercent : 0}%</span></div><div className="bar" aria-label={`${yesPercent}% sí`}><span style={{ width: `${yesPercent}%` }} /></div></div>;
}

export default function Results() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [rows, setRows] = useState<RatingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.add("results-body");
    return () => document.body.classList.remove("results-body");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/results${query(filters)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ results: RatingResult[] }>;
      })
      .then((data) => setRows(data.results))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("No se han podido cargar los resultados. Inténtalo de nuevo.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters]);

  const stats = useMemo(() => {
    const distribution = [1, 2, 3, 4, 5].map((level) => rows.filter((row) => row.satisfaction_level === level).length);
    const sum = rows.reduce((total, row) => total + row.satisfaction_level, 0);
    return {
      average: rows.length ? (sum / rows.length).toFixed(2).replace(".", ",") : "—",
      distribution,
      digitalYes: rows.filter((row) => row.digital_agents_fixed === 1).length,
      otherYes: rows.filter((row) => row.other_public_offices_fixed === 1).length,
    };
  }, [rows]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draft });
  }

  return <main className="results-page">
    <header className="results-header"><div><span className="eyebrow">SERVICIOS PÚBLICOS</span><h1>Resultados de valoración</h1><p>Panel de consulta de las respuestas recibidas.</p></div><a className={`download ${loading || error ? "disabled" : ""}`} href={`/api/results.csv${query(filters)}`} download="valoraciones-atd.csv" aria-disabled={Boolean(loading || error)} onClick={(event) => { if (loading || error) event.preventDefault(); }}>Descargar CSV</a></header>

    <form className="filters" onSubmit={applyFilters}>
      <label>Oficina<select value={draft.office} onChange={(event) => setDraft({ ...draft, office: event.target.value })}><option value="">Todas las oficinas</option>{offices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Desde<input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Hasta<input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      <div className="filter-actions"><button type="submit">Aplicar filtros</button><button type="button" className="secondary" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); }}>Limpiar</button></div>
    </form>

    {!loading && !error && <section className="stats" aria-label="Resumen de resultados">
      <article><span>Total de respuestas</span><strong>{rows.length}</strong></article>
      <article><span>Valoración media</span><strong>{stats.average}<small>{rows.length ? " / 5" : ""}</small></strong></article>
      <article className="distribution"><span>Distribución de valoraciones</span><div>{stats.distribution.map((count, index) => <span key={index}><b>{index + 1} ★</b>{count}</span>)}</div></article>
      <article><Percentage label="Agentes digitales fijos" yes={stats.digitalYes} total={rows.length} /></article>
      <article><Percentage label="Otras oficinas públicas" yes={stats.otherYes} total={rows.length} /></article>
    </section>}

    <section className="results-list" aria-live="polite">
      {loading ? <div className="panel-state" role="status">Cargando resultados…</div> : error ? <div className="panel-state error" role="alert">{error}</div> : rows.length === 0 ? <div className="panel-state">No hay resultados para los filtros seleccionados.</div> : <div className="table-scroll"><table><caption>{rows.length} {rows.length === 1 ? "respuesta" : "respuestas"}, de más reciente a más antigua</caption><thead><tr><th>ID</th><th>Fecha</th><th>Oficina</th><th>Valoración</th><th>Agentes digitales</th><th>Otras oficinas</th><th>Comentario</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="ID">{row.id}</td><td data-label="Fecha">{new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.created_at))}</td><td data-label="Oficina"><span>{officeNames.get(row.office_id) ?? row.office_id}</span><small>{row.office_id}</small></td><td data-label="Valoración"><strong>{row.satisfaction_level} / 5</strong></td><td data-label="Agentes digitales">{row.digital_agents_fixed ? "Sí" : "No"}</td><td data-label="Otras oficinas">{row.other_public_offices_fixed ? "Sí" : "No"}</td><td data-label="Comentario" className="comment-cell">{row.comment || "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
