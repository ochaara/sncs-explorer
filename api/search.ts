/**
 * GET /api/search?q=TEXTO
 *
 * Busca proyectos en MongoDB cuyo título o resumen contengan todas las palabras
 * de la consulta, con el índice de texto (sin distinguir mayúsculas, ordenados por
 * relevancia). La búsqueda por referencia se hace en el navegador.
 * Devuelve como máximo LIMIT resultados, con un fragmento del resumen.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MongoClient } from 'mongodb';

const LIMIT = 30;

export interface SearchResult {
  ref: string;
  title: string | null;
  snippet: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  hasMore: boolean;
}

interface ProjectDoc {
  Referencia: string;
  Título_EN?: string;
  Resumen_EN?: string;
}

// Mismo cliente compartido que api/project.ts (se reutiliza entre invocaciones).
// Se duplica aquí para que cada función de Vercel sea autocontenida.
const globalForMongo = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta la variable de entorno MONGODB_URI');
  if (!globalForMongo._mongoClient) {
    globalForMongo._mongoClient = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 })
      .connect()
      .catch((err) => {
        globalForMongo._mongoClient = undefined;
        throw err;
      });
  }
  return globalForMongo._mongoClient;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function snippet(text: string | undefined, terms: string[]): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const pos = terms.map((t) => lower.indexOf(t.toLowerCase())).filter((p) => p >= 0).sort((a, b) => a - b)[0];
  if (pos === undefined) return text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;
  const start = Math.max(0, pos - 80);
  const end = Math.min(text.length, pos + 170);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export async function searchProjects(query: string): Promise<SearchResponse> {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  if (!terms.length) return { query, results: [], hasMore: false };

  const db = (await getClient()).db();
  const col = db.collection<ProjectDoc>('proyectos');
  const projection = { _id: 0, Referencia: 1, Título_EN: 1, Resumen_EN: 1 };

  // Índice de texto "texto_titulo_resumen" (título con peso 3, resumen con peso 1).
  // Cada palabra va entre comillas para exigir que aparezcan todas; se ordena por relevancia.
  let docs: ProjectDoc[];
  try {
    docs = await col
      .find(
        { $text: { $search: terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' ') } },
        { projection: { ...projection, score: { $meta: 'textScore' } }, maxTimeMS: 15000 },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(LIMIT + 1)
      .toArray();
  } catch (err) {
    // Sin índice de texto (code 27, IndexNotFound): búsqueda por expresiones regulares, más lenta
    if ((err as { code?: number }).code !== 27) throw err;
    const filter = {
      $and: terms.map((t) => {
        const re = { $regex: escapeRegex(t), $options: 'i' };
        return { $or: [{ Referencia: re }, { Título_EN: re }, { Resumen_EN: re }] };
      }),
    };
    docs = await col.find(filter, { projection, maxTimeMS: 15000 }).limit(LIMIT + 1).toArray();
  }
  const ranked = docs.slice(0, LIMIT);

  return {
    query,
    hasMore: docs.length > LIMIT,
    results: ranked.map((d) => ({
      ref: d.Referencia,
      title: d.Título_EN?.trim() || null,
      snippet: snippet(d.Resumen_EN, terms),
    })),
  };
}

function send(res: ServerResponse, status: number, body: unknown, cache = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 3 || q.length > 200) return send(res, 400, { error: 'La búsqueda debe tener entre 3 y 200 caracteres' });

  try {
    return send(res, 200, await searchProjects(q), true);
  } catch (err) {
    console.error('[api/search]', err);
    return send(res, 500, { error: 'No se pudo consultar la base de datos' });
  }
}
