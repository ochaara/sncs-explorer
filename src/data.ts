export interface Dataset {
  areas: string[];
  ref: string[];
  area: Uint8Array;
  n: Uint16Array;
  sncs: Float64Array;
  p25: Float64Array;
  std: Float64Array;
  size: number;
}

interface RawDataset {
  areas: string[];
  ref: string[];
  area: number[];
  n: number[];
  sncs: number[];
  p25: number[];
  std: number[];
}

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/projects.json`);
  if (!res.ok) throw new Error(`No se pudieron cargar los datos (HTTP ${res.status})`);
  const raw = (await res.json()) as RawDataset;
  return {
    areas: raw.areas,
    ref: raw.ref,
    area: Uint8Array.from(raw.area),
    n: Uint16Array.from(raw.n),
    sncs: Float64Array.from(raw.sncs),
    p25: Float64Array.from(raw.p25),
    std: Float64Array.from(raw.std),
    size: raw.ref.length,
  };
}

/** Cuantil con interpolación lineal, igual que numpy.quantile por defecto. */
export function quantile(values: Float64Array, q: number): number {
  if (values.length === 0) return NaN;
  const sorted = Float64Array.from(values).sort();
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function pick(values: Float64Array, indices: Int32Array): Float64Array {
  const out = new Float64Array(indices.length);
  for (let k = 0; k < indices.length; k++) out[k] = values[indices[k]];
  return out;
}
