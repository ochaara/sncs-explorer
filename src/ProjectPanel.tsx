import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectDetails } from '../api/project';
import type { Dataset } from './data';
import { TYPES } from './typology';
import type { TypeIndex } from './typology';

interface Props {
  data: Dataset;
  index: number;
  type: TypeIndex;
  visible: boolean;
  onClose: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; project: ProjectDetails };

// Traducción de prism:aggregationType
const TYPE_LABELS: Record<string, string> = {
  Journal: 'Revista',
  'Conference Proceeding': 'Congreso',
  'Book Series': 'Serie de libros',
  Book: 'Libro',
  'Trade Journal': 'Revista profesional',
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t;

// Caché en memoria para no repetir consultas al volver a un proyecto
const cache = new Map<string, ProjectDetails>();

async function fetchProject(ref: string, signal: AbortSignal): Promise<ProjectDetails> {
  const hit = cache.get(ref);
  if (hit) return hit;
  const res = await fetch(`/api/project?ref=${encodeURIComponent(ref)}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Error HTTP ${res.status}`);
  cache.set(ref, body as ProjectDetails);
  return body as ProjectDetails;
}

export default function ProjectPanel({ data, index, type, visible, onClose }: Props) {
  const ref = data.ref[index];
  const [state, setState] = useState<State>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [expandAll, setExpandAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    setQuery('');
    setExpandAll(false);
    scrollRef.current?.scrollTo({ top: 0 });
    fetchProject(ref, ctrl.signal)
      .then((project) => setState({ status: 'ok', project }))
      .catch((err) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [ref]);

  const publications = useMemo(() => {
    if (state.status !== 'ok') return [];
    const q = query.trim().toLowerCase();
    const all = state.project.publications.map((p, k) => ({ ...p, n: k + 1 }));
    if (!q) return all;
    return all.filter((p) => `${p.title ?? ''} ${p.abstract ?? ''} ${p.source ?? ''}`.toLowerCase().includes(q));
  }, [state, query]);

  // Recuento por tipo de publicación, p. ej. "12 Revista · 2 Congreso"
  const typeSummary = useMemo(() => {
    if (state.status !== 'ok') return '';
    const counts = new Map<string, number>();
    for (const p of state.project.publications) if (p.type) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${n} ${typeLabel(t)}`)
      .join(' · ');
  }, [state]);

  const t = TYPES[type];

  return (
    <section className="project-panel" aria-label={`Proyecto ${ref}`}>
      <div className="pp-head">
        <div>
          <div className="pp-ref">{ref}</div>
          <div className="pp-meta">
            <span className="pp-type" style={{ background: t.color }}>
              {t.code}
            </span>
            {data.areas[data.area[index]]}
          </div>
        </div>
        <button type="button" className="pp-close" onClick={onClose} title="Cerrar">
          ×
        </button>
      </div>

      <div className="pp-scroll" ref={scrollRef}>
        <dl className="pp-metrics">
          <div>
            <dt>SNCS</dt>
            <dd>{data.sncs[index].toFixed(3)}</dd>
          </div>
          <div>
            <dt>p25</dt>
            <dd>{data.p25[index].toFixed(3)}</dd>
          </div>
          <div>
            <dt>Desv.</dt>
            <dd>{data.std[index].toFixed(3)}</dd>
          </div>
          <div>
            <dt>Public.</dt>
            <dd>{data.n[index]}</dd>
          </div>
        </dl>
        {!visible && <p className="muted small">Este proyecto no cumple el filtro actual del gráfico.</p>}

        {state.status === 'loading' && <p className="muted">Cargando título, resumen y publicaciones…</p>}
        {state.status === 'error' && <p className="pp-error">{state.message}</p>}

        {state.status === 'ok' && (
          <>
            <h3 className="pp-title">{state.project.title ?? <em className="muted">Sin título</em>}</h3>
            <Abstract text={state.project.abstract} />

            <div className="pp-pubs-head">
              <h4>Publicaciones ({state.project.publications.length})</h4>
              {state.project.publications.length > 0 && (
                <button type="button" className="link" onClick={() => setExpandAll((v) => !v)}>
                  {expandAll ? 'Contraer resúmenes' : 'Expandir resúmenes'}
                </button>
              )}
            </div>
            {typeSummary && <p className="muted small pp-type-summary">{typeSummary}</p>}
            {state.project.publications.length > 8 && (
              <input
                className="pp-search"
                type="search"
                placeholder="Buscar en títulos, resúmenes y revistas…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {query && (
              <p className="muted small">
                {publications.length} de {state.project.publications.length} publicaciones
              </p>
            )}
            <ol className="pp-pubs">
              {publications.map((p) => (
                <li key={`${p.id}-${expandAll}`}>
                  <details open={expandAll}>
                    <summary>
                      <span className="pp-num">{p.n}</span>
                      <span className="pp-pub-main">
                        <span>{p.title ?? <em className="muted">Sin título</em>}</span>
                        {(p.source || p.type) && (
                          <span className="pp-source">
                            {p.type && <span className="pp-pubtype">{typeLabel(p.type)}</span>}
                            {p.source && <em>{p.source}</em>}
                          </span>
                        )}
                      </span>
                    </summary>
                    <p className={p.abstract ? '' : 'muted'}>{p.abstract ?? 'Sin resumen disponible.'}</p>
                  </details>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

function Abstract({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [text]);
  if (!text) return <p className="muted">Sin resumen disponible.</p>;
  const long = text.length > 700;
  return (
    <div className="pp-abstract">
      <p>{long && !open ? `${text.slice(0, 700).trimEnd()}…` : text}</p>
      {long && (
        <button type="button" className="link" onClick={() => setOpen((v) => !v)}>
          {open ? 'Mostrar menos' : 'Mostrar resumen completo'}
        </button>
      )}
    </div>
  );
}
