import type { Dataset } from './data';

export interface Thresholds {
  /** Línea vertical: umbral de SNCS. */
  sncs: number;
  /** Línea horizontal: umbral del p25 de las similitudes normalizadas. */
  p25: number;
  /** Umbral de desviación estándar para la cola izquierda. */
  std: number;
  /** Si es false, la cola izquierda depende solo del p25. */
  useStd: boolean;
}

/** 0 = T1, 1 = T2, 2 = T3, 3 = T4 */
export type TypeIndex = 0 | 1 | 2 | 3;

export const TYPES = [
  { code: 'T1', name: 'Alineado y consistente', color: '#2f6db5', rule: 'SNCS ≥ umbral, sin cola izquierda' },
  { code: 'T2', name: 'Alineado con desviaciones parciales', color: '#e07b1f', rule: 'SNCS ≥ umbral, con cola izquierda' },
  { code: 'T3', name: 'Globalmente desalineado, homogéneo', color: '#8c96a3', rule: 'SNCS < umbral, sin cola izquierda' },
  { code: 'T4', name: 'Desalineación estructural y parcial', color: '#c62f3a', rule: 'SNCS < umbral, con cola izquierda' },
] as const;

export function hasLeftTail(d: Dataset, i: number, t: Thresholds): boolean {
  return d.p25[i] <= t.p25 && (!t.useStd || d.std[i] >= t.std);
}

export function classify(d: Dataset, i: number, t: Thresholds): TypeIndex {
  const tail = hasLeftTail(d, i, t);
  if (d.sncs[i] >= t.sncs) return tail ? 1 : 0;
  return tail ? 3 : 2;
}

export function countTypes(d: Dataset, indices: Int32Array, t: Thresholds): [number, number, number, number] {
  const c: [number, number, number, number] = [0, 0, 0, 0];
  for (let k = 0; k < indices.length; k++) c[classify(d, indices[k], t)]++;
  return c;
}
