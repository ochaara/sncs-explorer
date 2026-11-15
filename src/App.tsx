import { useEffect, useMemo, useState } from 'react';
import Chart from './Chart';
import NumberField from './NumberField';
import ProjectPanel from './ProjectPanel';
import { loadDataset, pick, quantile } from './data';
import type { Dataset } from './data';
import { TYPES, classify, countTypes } from './typology';
import type { Thresholds } from './typology';

const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
const pct = (v: number, total: number) => (total ? `${((100 * v) / total).toFixed(1)} %` : '–');

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="status error">{error}</div>;
  if (!data) return <div className="status">Cargando proyectos…</div>;
  return <Explorer data={data} />;
}

type Mode = 'quartiles' | 'manual';

function Explorer({ data }: { data: Dataset }) {
  const maxPubs = useMemo(() => data.n.reduce((m, v) => Math.max(m, v), 0), [data]);
  const [minPubs, setMinPubs] = useState(3);
  const [area, setArea] = useState(-1);
  const [mode, setMode] = useState<Mode>('quartiles');
  const [manual, setManual] = useState<Thresholds>({ sncs: 1, p25: 1, std: 0.15, useStd: true });
  const [selected, setSelected] = useState<number | null>(null);

  // Proyectos que cumplen el mínimo de publicaciones (todas las áreas)
  const byPubs = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < data.size; i++) if (data.n[i] >= minPubs) out.push(i);
    return Int32Array.from(out);
  }, [data, minPubs]);

  // Cuartiles globales sobre ese conjunto, como en el estudio
  const quart = useMemo(
    () => ({ q1: quantile(pick(data.p25, byPubs), 0.25), q3: quantile(pick(data.std, byPubs), 0.75) }),
    [data, byPubs],
  );

  // Proyectos mostrados (filtro adicional por área)
  const indices = useMemo(
    () => (area < 0 ? byPubs : byPubs.filter((i) => data.area[i] === area)),
    [data, byPubs, area],
  );

  const thresholds: Thresholds =
    mode === 'quartiles' ? { sncs: 1, p25: quart.q1, std: quart.q3, useStd: true } : manual;

  const counts = useMemo(
    () => countTypes(data, indices, thresholds),
    [data, indices, thresholds.sncs, thresholds.p25, thresholds.std, thresholds.useStd],
  );
  const total = indices.length;

  const update = (patch: Partial<Thresholds>) => {
    setManual({ ...thresholds, ...patch });
    setMode('manual');
  };

  const selectedVisible = selected !== null && data.n[selected] >= minPubs && (area < 0 || data.area[selected] === area);

  return (
    <div className="app">
      <header>
        <h1>Heterogeneidad intra-proyecto</h1>
        <p>
          Cada punto es un proyecto. Arrastra las líneas para cambiar los umbrales y ver cómo cambia el reparto de
          tipologías.
        </p>
      </header>

      <main>
        <aside>
          <section>
            <h2>Proyectos</h2>
            <label className="field">
              <span>Mínimo de publicaciones</span>
              <div className="row">
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={Math.min(minPubs, 30)}
                  onChange={(e) => setMinPubs(Number(e.target.value))}
                />
                <NumberField value={minPubs} min={1} max={maxPubs} step={1} digits={0} onChange={(v) => setMinPubs(Math.round(v))} />
              </div>
            </label>
            <div className="presets">
              {[1, 2, 3, 5, 10].map((v) => (
                <button key={v} type="button" className={v === minPubs ? 'active' : ''} onClick={() => setMinPubs(v)}>
                  {v === 1 ? 'Todos' : `≥ ${v}`}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Área</span>
              <select value={area} onChange={(e) => setArea(Number(e.target.value))}>
                <option value={-1}>Todas las áreas</option>
                {data.areas.map((a, i) => (
                  <option key={a} value={i}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Mostrando <strong>{nf.format(total)}</strong> de {nf.format(data.size)} proyectos.
            </p>
          </section>

          <section>
            <h2>Umbrales</h2>
            <div className={`mode-badge ${mode}`}>
              {mode === 'quartiles' ? 'Cuartiles del estudio (se recalculan con el filtro)' : 'Umbrales manuales'}
            </div>
            <label className="field">
              <span>SNCS · línea vertical</span>
              <NumberField value={thresholds.sncs} step={0.005} digits={3} onChange={(v) => update({ sncs: v })} />
            </label>
            <label className="field">
              <span>p25 · línea horizontal</span>
              <NumberField value={thresholds.p25} step={0.005} digits={3} onChange={(v) => update({ p25: v })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={thresholds.useStd} onChange={(e) => update({ useStd: e.target.checked })} />
              <span>Exigir además dispersión alta</span>
            </label>
            <label className={`field ${thresholds.useStd ? '' : 'disabled'}`}>
              <span>Desviación estándar ≥</span>
              <NumberField
                value={thresholds.std}
                step={0.005}
                digits={3}
                disabled={!thresholds.useStd}
                onChange={(v) => update({ std: v })}
              />
            </label>
            <p className="muted small">
              Cuartiles con ≥ {minPubs} publicaciones: Q1(p25) = {quart.q1.toFixed(3)} · Q3(desv.) = {quart.q3.toFixed(3)}
            </p>
            <div className="presets">
              <button type="button" className={mode === 'quartiles' ? 'active' : ''} onClick={() => setMode('quartiles')}>
                Cuartiles del estudio
              </button>
              <button type="button" onClick={() => update({ sncs: 1, p25: 1, useStd: false })}>
                Referencia 1 / 1
              </button>
            </div>
          </section>

          <section>
            <h2>Tipologías</h2>
            <table className="types">
              <tbody>
                {TYPES.map((t, k) => (
                  <tr key={t.code} title={t.rule}>
                    <td>
                      <span className="swatch" style={{ background: t.color }} />
                      <strong>{t.code}</strong>
                    </td>
                    <td className="name">{t.name}</td>
                    <td className="num">{nf.format(counts[k])}</td>
                    <td className="num muted">{pct(counts[k], total)}</td>
                  </tr>
                ))}
                <tr className="alert-row">
                  <td colSpan={2}>Señal de alerta (T2 + T4)</td>
                  <td className="num">{nf.format(counts[1] + counts[3])}</td>
                  <td className="num">{pct(counts[1] + counts[3], total)}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">
              Cola izquierda: p25 ≤ {thresholds.p25.toFixed(3)}
              {thresholds.useStd && <> y desviación ≥ {thresholds.std.toFixed(3)}</>}. Con la condición de dispersión
              activada, un punto bajo la línea horizontal solo cuenta como cola izquierda si su desviación también supera
              el umbral.
            </p>
          </section>
        </aside>

        <div className="chart-wrap">
          <div className="hint">
            Rueda o botones: zoom · Arrastrar el fondo: desplazar · Arrastrar las líneas: mover umbrales · Clic en un punto: ver proyecto y publicaciones
          </div>
          <Chart
            data={data}
            indices={indices}
            thresholds={thresholds}
            onDragThreshold={update}
            selected={selected}
            selectedVisible={selectedVisible}
            onSelect={setSelected}
          />
        </div>

        {selected !== null && (
          <ProjectPanel
            data={data}
            index={selected}
            type={classify(data, selected, thresholds)}
            visible={selectedVisible}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}
