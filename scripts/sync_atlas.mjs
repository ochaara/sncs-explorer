/**
 * Copia Título_EN y Resumen_EN de la MongoDB local a MongoDB Atlas
 * (colección `proyectos`), emparejando los documentos por _id.
 *
 * Solo modifica esos dos campos y solo cuando han cambiado. Nunca sobrescribe
 * un texto de Atlas con uno vacío.
 *
 * Variables de entorno:
 *   MONGODB_URI   URL de Atlas (la misma que usa la app)
 *   LOCAL_URI     URL de la MongoDB local, p. ej. mongodb://usuario:clave@localhost:27017/
 *   LOCAL_DB      base de datos local (por defecto "proyectos")
 *
 * Uso:
 *   node scripts/sync_atlas.mjs           # simulación: muestra qué cambiaría, no escribe
 *   node scripts/sync_atlas.mjs --apply   # aplica los cambios en Atlas
 */
import { MongoClient } from 'mongodb';

const FIELDS = ['Título_EN', 'Resumen_EN'];
const BATCH = 500;
const apply = process.argv.includes('--apply');

const { MONGODB_URI, LOCAL_URI, LOCAL_DB = 'proyectos' } = process.env;
if (!MONGODB_URI || !LOCAL_URI) {
  console.error('Faltan MONGODB_URI y/o LOCAL_URI');
  process.exit(1);
}

const atlas = new MongoClient(MONGODB_URI);
const local = new MongoClient(LOCAL_URI);

try {
  await Promise.all([atlas.connect(), local.connect()]);
  const A = atlas.db().collection('proyectos');
  const L = local.db(LOCAL_DB).collection('proyectos');
  const projection = Object.fromEntries(FIELDS.map((f) => [f, 1]));

  const remote = new Map((await A.find({}, { projection }).toArray()).map((d) => [String(d._id), d]));
  const ops = [];
  const changed = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  let missing = 0;
  let skippedEmpty = 0;

  for (const d of await L.find({}, { projection }).toArray()) {
    const r = remote.get(String(d._id));
    if (!r) {
      missing++;
      continue;
    }
    const set = {};
    for (const f of FIELDS) {
      const v = typeof d[f] === 'string' ? d[f].trim() : '';
      if (!v) {
        if ((r[f] ?? '') !== (d[f] ?? '')) skippedEmpty++;
        continue;
      }
      if (v !== r[f]) {
        set[f] = v;
        changed[f]++;
      }
    }
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } });
  }

  console.log(`Documentos a actualizar: ${ops.length}`, changed);
  console.log(`Sin pareja en Atlas: ${missing} · textos locales vacíos ignorados: ${skippedEmpty}`);

  if (!apply) {
    console.log('\nSimulación: no se ha escrito nada. Ejecuta con --apply para aplicar los cambios.');
  } else {
    let done = 0;
    for (let k = 0; k < ops.length; k += BATCH) {
      const res = await A.bulkWrite(ops.slice(k, k + BATCH), { ordered: false });
      done += res.modifiedCount;
      process.stdout.write(`\rActualizados: ${done}/${ops.length}`);
    }
    console.log('\nHecho.');
  }
} finally {
  await Promise.all([atlas.close(), local.close()]);
}
