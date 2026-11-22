import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { scaleLinear } from 'd3-scale';
import { pointer, select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import 'd3-transition';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { quadtree } from 'd3-quadtree';
import type { Dataset } from './data';
import { TYPES, classify } from './typology';
import type { Thresholds } from './typology';

const M = { top: 20, right: 24, bottom: 52, left: 68 };
const HIT_RADIUS = 8; // píxeles
const DRAW_ORDER = [2, 0, 3, 1]; // T3, T1, T4, T2: las alertas quedan encima
const FOCUS_SCALE = 8; // zoom mínimo al centrar un proyecto buscado
const FOCUS_WINDOW_MS = 1500; // tras abrir el panel el gráfico cambia de tamaño: se vuelve a centrar

interface Props {
  data: Dataset;
  indices: Int32Array;
  thresholds: Thresholds;
  onDragThreshold: (patch: Partial<Thresholds>) => void;
  selected: number | null;
  selectedVisible: boolean;
  onSelect: (i: number | null) => void;
  /** Proyecto al que hacer zoom (p. ej. desde el buscador). `at` cambia en cada petición. */
  focus: { index: number; at: number } | null;
}

type Axis = 'x' | 'y';

const fmt = (v: number, digits = 3) => v.toFixed(digits);

export default function Chart({
  data,
  indices,
  thresholds,
  onDragThreshold,
  selected,
  selectedVisible,
  onSelect,
  focus,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const surfaceRef = useRef<SVGRectElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGRectElement, unknown> | null>(null);

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState<Axis | null>(null);

  // --- Tamaño del contenedor ---------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(320, Math.floor(width)), h: Math.max(320, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al cambiar el tamaño, el tooltip quedaría desplazado
  useEffect(() => setHover(null), [size]);

  const iw = size.w - M.left - M.right;
  const ih = size.h - M.top - M.bottom;

  // --- Escalas -------------------------------------------------------------
  const domain = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const x = data.sncs[i], y = data.p25[i];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (!isFinite(x0)) return { x: [0, 2] as [number, number], y: [0, 2] as [number, number] };
    const px = (x1 - x0) * 0.04 || 0.1;
    const py = (y1 - y0) * 0.04 || 0.1;
    return { x: [x0 - px, x1 + px] as [number, number], y: [y0 - py, y1 + py] as [number, number] };
  }, [data, indices]);

  const bx = useMemo(() => scaleLinear().domain(domain.x).range([0, iw]), [domain, iw]);
  const by = useMemo(() => scaleLinear().domain(domain.y).range([ih, 0]), [domain, ih]);
  const zx = useMemo(() => transform.rescaleX(bx), [transform, bx]);
  const zy = useMemo(() => transform.rescaleY(by), [transform, by]);

  // --- Índice espacial para clic y hover (en píxeles de la vista base) -------
  const tree = useMemo(
    () =>
      quadtree<number>()
        .x((i) => bx(data.sncs[i]))
        .y((i) => by(data.p25[i]))
        .addAll(Array.from(indices)),
    [data, indices, bx, by],
  );

  const findRef = useRef<(px: number, py: number) => number | null>(() => null);
  findRef.current = (px, py) => {
    const [x, y] = transform.invert([px, py]);
    return tree.find(x, y, HIT_RADIUS / transform.k) ?? null;
  };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // --- Zoom y desplazamiento -------------------------------------------------
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const sel = select(surface);
    const z = d3zoom<SVGRectElement, unknown>()
      .scaleExtent([1, 200])
      .on('zoom', (ev: { transform: ZoomTransform }) => setTransform(ev.transform));
    sel.call(z).on('dblclick.zoom', null);
    sel
      .on('click.select', (ev: MouseEvent) => {
        const [px, py] = pointer(ev);
        onSelectRef.current(findRef.current(px, py));
      })
      .on('mousemove.hover', (ev: MouseEvent) => {
        if (ev.buttons) return;
        const [px, py] = pointer(ev);
        setHover(findRef.current(px, py));
      })
      .on('mouseleave.hover', () => setHover(null));
    zoomRef.current = z;
    return () => {
      sel.on('.zoom', null).on('.select', null).on('.hover', null);
    };
  }, []);

  useEffect(() => {
    zoomRef.current?.extent([[0, 0], [iw, ih]]).translateExtent([[0, 0], [iw, ih]]);
  }, [iw, ih]);

  // Al cambiar el conjunto de proyectos cambia el dominio: se reinicia el zoom.
  useEffect(() => {
    if (surfaceRef.current && zoomRef.current) {
      select(surfaceRef.current).call(zoomRef.current.transform, zoomIdentity);
    }
  }, [domain]);

  // Zoom animado centrado en el proyecto buscado
  useEffect(() => {
    const surface = surfaceRef.current;
    const z = zoomRef.current;
    if (!focus || !surface || !z || Date.now() - focus.at > FOCUS_WINDOW_MS) return;
    const k = Math.max(FOCUS_SCALE, zoomTransform(surface).k);
    const x = bx(data.sncs[focus.index]);
    const y = by(data.p25[focus.index]);
    const target = zoomIdentity.translate(iw / 2 - k * x, ih / 2 - k * y).scale(k);
    select(surface).transition().duration(800).call(z.transform, target);
  }, [focus, data, bx, by, iw, ih]);

  const zoomBy = (factor: number) => {
    if (surfaceRef.current && zoomRef.current) select(surfaceRef.current).call(zoomRef.current.scaleBy, factor);
  };
  const resetZoom = () => {
    if (surfaceRef.current && zoomRef.current) select(surfaceRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  // --- Dibujo de los puntos en canvas --------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.left, M.top, iw, ih);
    ctx.clip();
    ctx.translate(M.left, M.top);

    // Transformaciones lineales precalculadas (más rápido que llamar a la escala)
    const [dx0, dx1] = zx.domain(), [rx0, rx1] = zx.range();
    const [dy0, dy1] = zy.domain(), [ry0, ry1] = zy.range();
    const ax = (rx1 - rx0) / (dx1 - dx0), cx = rx0 - ax * dx0;
    const ay = (ry1 - ry0) / (dy1 - dy0), cy = ry0 - ay * dy0;
    const r = Math.min(2.2 * Math.pow(transform.k, 0.3), 6);

    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const x = ax * data.sncs[i] + cx;
      const y = ay * data.p25[i] + cy;
      if (x < -r || x > iw + r || y < -r || y > ih + r) continue;
      const p = paths[classify(data, i, thresholds)];
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.globalAlpha = 0.62;
    for (const t of DRAW_ORDER) {
      ctx.fillStyle = TYPES[t].color;
      ctx.fill(paths[t]);
    }
    ctx.restore();
  }, [data, indices, thresholds, zx, zy, transform.k, size, iw, ih]);

  // --- Arrastre de las líneas de umbral --------------------------------------
  const startDrag = (axis: Axis) => (e: ReactPointerEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(axis);
  };
  const moveDrag = (e: ReactPointerEvent<SVGElement>) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (dragging === 'x') {
      const [d0, d1] = zx.domain();
      const v = Math.min(Math.max(zx.invert(e.clientX - rect.left - M.left), d0), d1);
      onDragThreshold({ sncs: Math.round(v * 1000) / 1000 });
    } else {
      const [d0, d1] = zy.domain();
      const v = Math.min(Math.max(zy.invert(e.clientY - rect.top - M.top), d0), d1);
      onDragThreshold({ p25: Math.round(v * 1000) / 1000 });
    }
  };
  // La rueda sobre una línea de umbral también hace zoom
  const forwardWheel = (e: ReactWheelEvent<SVGElement>) => {
    const n = e.nativeEvent;
    surfaceRef.current?.dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: n.deltaX,
        deltaY: n.deltaY,
        deltaMode: n.deltaMode,
        clientX: n.clientX,
        clientY: n.clientY,
        ctrlKey: n.ctrlKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  const endDrag = (e: ReactPointerEvent<SVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
  };

  // --- Elementos SVG ---------------------------------------------------------
  const xTicks = zx.ticks(Math.max(4, Math.floor(iw / 90)));
  const yTicks = zy.ticks(Math.max(4, Math.floor(ih / 60)));
  const tx = zx(thresholds.sncs);
  const ty = zy(thresholds.p25);
  const txIn = tx >= 0 && tx <= iw;
  const tyIn = ty >= 0 && ty <= ih;
  const ref1x = zx(1);
  const ref1y = zy(1);

  const marker = (i: number | null, cls: string) => {
    if (i === null) return null;
    const x = zx(data.sncs[i]);
    const y = zy(data.p25[i]);
    if (x < 0 || x > iw || y < 0 || y > ih) return null;
    return <circle className={cls} cx={x} cy={y} r={7} />;
  };

  const hoverTip =
    hover !== null && !dragging
      ? (() => {
          const x = zx(data.sncs[hover]) + M.left;
          const y = zy(data.p25[hover]) + M.top;
          const left = x > size.w - 200 ? x - 12 : x + 12;
          return (
            <div
              className="tooltip"
              style={{ left, top: y - 12, transform: x > size.w - 200 ? 'translate(-100%, -100%)' : 'translateY(-100%)' }}
            >
              <strong>{data.ref[hover]}</strong>
              <span>
                SNCS {fmt(data.sncs[hover])} · p25 {fmt(data.p25[hover])} · {data.n[hover]} pub.
              </span>
            </div>
          );
        })()
      : null;

  return (
    <div className="chart" ref={containerRef}>
      <canvas ref={canvasRef} />
      <svg ref={svgRef} width={size.w} height={size.h} className={dragging ? `dragging-${dragging}` : undefined}>
        <defs>
          <clipPath id="plot-clip">
            <rect width={iw} height={ih} />
          </clipPath>
        </defs>
        <g transform={`translate(${M.left},${M.top})`}>
          {/* Cuadrícula y ejes */}
          <g className="grid">
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={zx(t)} x2={zx(t)} y2={ih} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} y1={zy(t)} y2={zy(t)} x2={iw} />
            ))}
          </g>
          <rect className="frame" width={iw} height={ih} />
          <g className="axis" transform={`translate(0,${ih})`}>
            {xTicks.map((t) => (
              <g key={`x${t}`} transform={`translate(${zx(t)},0)`}>
                <line y2={5} />
                <text y={18} textAnchor="middle">
                  {t.toFixed(transform.k > 8 ? 3 : 2)}
                </text>
              </g>
            ))}
            <text className="axis-label" x={iw / 2} y={42} textAnchor="middle">
              SNCS del proyecto
            </text>
          </g>
          <g className="axis">
            {yTicks.map((t) => (
              <g key={`y${t}`} transform={`translate(0,${zy(t)})`}>
                <line x2={-5} />
                <text x={-8} dy="0.32em" textAnchor="end">
                  {t.toFixed(transform.k > 8 ? 3 : 2)}
                </text>
              </g>
            ))}
            <text className="axis-label" transform={`translate(${-50},${ih / 2}) rotate(-90)`} textAnchor="middle">
              Percentil 25 de las similitudes normalizadas
            </text>
          </g>

          {/* Superficie de zoom, desplazamiento, clic y hover */}
          <rect ref={surfaceRef} className="surface" width={iw} height={ih} />

          <g clipPath="url(#plot-clip)">
            {/* Referencias fijas en 1 */}
            <line className="ref-line" x1={ref1x} x2={ref1x} y2={ih} />
            <line className="ref-line" y1={ref1y} y2={ref1y} x2={iw} />

            {marker(hover, 'hover-ring')}
            {selectedVisible && marker(selected, 'selected-ring')}
            {focus && focus.index === selected && selectedVisible && (
              <g
                key={focus.at}
                className="focus-pulse"
                transform={`translate(${zx(data.sncs[focus.index])},${zy(data.p25[focus.index])})`}
              >
                <circle r={8} />
                <circle r={8} className="delayed" />
              </g>
            )}

            {/* Umbral vertical (SNCS) */}
            {txIn && (
              <g transform={`translate(${tx},0)`}>
                <line className="thr-line" y2={ih} />
                <line
                  className="thr-hit thr-hit-x"
                  y2={ih}
                  onPointerDown={startDrag('x')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onWheel={forwardWheel}
                />
              </g>
            )}
            {/* Umbral horizontal (p25) */}
            {tyIn && (
              <g transform={`translate(0,${ty})`}>
                <line className="thr-line" x2={iw} />
                <line
                  className="thr-hit thr-hit-y"
                  x2={iw}
                  onPointerDown={startDrag('y')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onWheel={forwardWheel}
                />
              </g>
            )}
          </g>

          {/* Etiquetas de los umbrales */}
          {txIn && (
            <g className="thr-label" transform={`translate(${Math.min(tx + 6, iw - 120)},14)`}>
              <rect x={-4} y={-12} width={118} height={18} rx={4} />
              <text>SNCS = {fmt(thresholds.sncs)}</text>
            </g>
          )}
          {tyIn && (
            <g className="thr-label" transform={`translate(${iw - 124},${Math.max(ty - 8, 16)})`}>
              <rect x={-4} y={-12} width={122} height={18} rx={4} />
              <text>p25 = {fmt(thresholds.p25)}</text>
            </g>
          )}
        </g>
      </svg>
      {hoverTip}
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomBy(1.6)} title="Ampliar">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} title="Reducir">
          −
        </button>
        <button type="button" onClick={resetZoom} title="Restablecer la vista">
          ⟲
        </button>
      </div>
      {(!txIn || !tyIn) && (
        <div className="offscreen-note">
          {!txIn && 'La línea vertical está fuera de la vista. '}
          {!tyIn && 'La línea horizontal está fuera de la vista.'}
        </div>
      )}
    </div>
  );
}
