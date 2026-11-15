/**
 * GET /api/project?ref=REFERENCIA
 *
 * Devuelve el título y el resumen del proyecto y la lista de sus publicaciones
 * (título y resumen), leídos de MongoDB. La URL de conexión se toma de la
 * variable de entorno MONGODB_URI y nunca llega al navegador.
 *
 * Funciona como función serverless de Vercel y, en desarrollo, como
 * middleware de Vite (ver vite.config.ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MongoClient, ObjectId } from 'mongodb';

export interface Publication {
  id: string;
  title: string | null;
  abstract: string | null;
}

export interface ProjectDetails {
  ref: string;
  title: string | null;
  abstract: string | null;
  publications: Publication[];
}

interface ProjectDoc {
  Referencia: string;
  Título_EN?: string;
  Resumen_EN?: string;
  publicaciones?: ObjectId[];
}

interface PublicationDoc {
  _id: ObjectId;
  'dc:title'?: string;
  abstract?: string;
}

// El cliente se reutiliza entre invocaciones de la misma instancia.
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

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export async function getProject(ref: string): Promise<ProjectDetails | null> {
  const db = (await getClient()).db();
  const project = await db
    .collection<ProjectDoc>('proyectos')
    .findOne({ Referencia: ref }, { projection: { Referencia: 1, Título_EN: 1, Resumen_EN: 1, publicaciones: 1 } });
  if (!project) return null;

  const ids = (project.publicaciones ?? []).filter((id): id is ObjectId => id instanceof ObjectId);
  const docs = ids.length
    ? await db
        .collection<PublicationDoc>('publicaciones')
        .find({ _id: { $in: ids } }, { projection: { 'dc:title': 1, abstract: 1 } })
        .toArray()
    : [];
  const byId = new Map(docs.map((d) => [d._id.toHexString(), d]));

  // Se respeta el orden en que el proyecto lista sus publicaciones
  const publications: Publication[] = ids.map((id) => {
    const d = byId.get(id.toHexString());
    return { id: id.toHexString(), title: clean(d?.['dc:title']), abstract: clean(d?.abstract) };
  });

  return {
    ref: project.Referencia,
    title: clean(project.Título_EN),
    abstract: clean(project.Resumen_EN),
    publications,
  };
}

function send(res: ServerResponse, status: number, body: unknown, cache = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });

  const url = new URL(req.url ?? '/', 'http://localhost');
  const ref = (url.searchParams.get('ref') ?? '').trim();
  if (!ref || ref.length > 64) return send(res, 400, { error: 'Parámetro "ref" no válido' });

  try {
    const project = await getProject(ref);
    if (!project) return send(res, 404, { error: `No se encontró el proyecto ${ref}` });
    return send(res, 200, project, true);
  } catch (err) {
    console.error('[api/project]', err);
    return send(res, 500, { error: 'No se pudo consultar la base de datos' });
  }
}
