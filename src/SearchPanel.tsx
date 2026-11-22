import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SearchResponse } from '../api/search';
import type { Dataset } from './data';

interface Props {
  data: Dataset;
  refIndex: Map<string, number>;
  onPick: (index: number) => void;
  notice: string | null;
}

interface Item {
  ref: string;
  title: string | null;
  snippet: string | null;
}

const LOCAL_LIMIT = 10;
const DEBOUNCE_MS = 400;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  return text.split(re).map((part, k) => (k % 2 === 1 ? <mark key={k}>{part}</mark> : <Fragment key={k}>{part}</Fragment>));
}

export default function SearchPanel({ data, refIndex, onPick, notice }: Props) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();
  const terms = useMemo(() => q.split(/\s+/).filter((t) => t.length >= 2), [q]);

  // Coincidencias por referencia: instantáneas, sobre los datos ya cargados
  const local = useMemo<Item[]>(() => {
    if (q.length < 2) return [];
    const needle = q.toUpperCase().replace(/\s+/g, '');
    const out: Item[] = [];
    for (let i = 0; i < data.size && out.length < LOCAL_LIMIT; i++) {
      if (data.ref[i].includes(needle)) out.push({ ref: data.ref[i], title: null, snippet: null });
    }
    return out;
  }, [data, q]);

  // Búsqueda en título y resumen: en MongoDB, con retardo al escribir
  useEffect(() => {
    setError(null);
    if (q.length < 3) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? `Error HTTP ${res.status}`);
          setRemote(body as SearchResponse);
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Se combinan: primero las referencias locales, completadas con los textos del servidor
  const items = useMemo<Item[]>(() => {
    const byRef = new Map<string, Item>();
    for (const it of local) byRef.set(it.ref, it);
    for (const it of remote?.query === q ? remote.results : []) byRef.set(it.ref, { ...byRef.get(it.ref), ...it });
    // Los que están en el gráfico primero (el orden relativo se mantiene)
    const all = [...byRef.values()];
    return [...all.filter((it) => refIndex.has(it.ref)), ...all.filter((it) => !refIndex.has(it.ref))];
  }, [local, remote, q, refIndex]);

  return (
    <section className="search">
      <h2>Buscar proyecto</h2>
      <div className="search-box">
        <input
          type="search"
          placeholder="Referencia, título o resumen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar proyecto"
        />
        {loading && <span className="spinner" aria-label="Buscando" />}
      </div>
      {q.length > 0 && q.length < 3 && local.length === 0 && (
        <p className="muted small">Escribe al menos 3 caracteres para buscar en títulos y resúmenes.</p>
      )}
      {error && <p className="pp-error small">{error}</p>}
      {notice && <p className="search-notice small">{notice}</p>}

      {items.length > 0 && (
        <ul className="search-results">
          {items.map((it) => {
            const idx = refIndex.get(it.ref);
            const inChart = idx !== undefined;
            return (
              <li key={it.ref}>
                <button
                  type="button"
                  disabled={!inChart}
                  onClick={() => idx !== undefined && onPick(idx)}
                  title={inChart ? 'Ver en el gráfico' : 'Este proyecto no está en el gráfico'}
                >
                  <span className="sr-ref">{highlight(it.ref, terms)}</span>
                  {inChart ? (
                    <span className="sr-meta">
                      {data.areas[data.area[idx]]} · {data.n[idx]} pub.
                    </span>
                  ) : (
                    <span className="sr-meta">No está en el gráfico (sin publicaciones o sin área)</span>
                  )}
                  {it.title && <span className="sr-title">{highlight(it.title, terms)}</span>}
                  {it.snippet && <span className="sr-snippet">{highlight(it.snippet, terms)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && q.length >= 3 && remote?.query === q && items.length === 0 && !error && (
        <p className="muted small">Sin resultados.</p>
      )}
      {remote?.query === q && remote.hasMore && (
        <p className="muted small">Se muestran los primeros resultados; añade más palabras para afinar.</p>
      )}
    </section>
  );
}
