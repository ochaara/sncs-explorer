# Explorador SNCS · heterogeneidad intra-proyecto

Aplicación web interactiva basada en el gráfico de la sección *3.3. Resultados para RQ3: desalineación parcial intra-proyecto* de `InvestigaciónV2.ipynb`. Cada punto es un proyecto: en el eje X está su SNCS y en el eje Y el percentil 25 de sus similitudes normalizadas.

## Funciones

- **Umbrales arrastrables.** La línea vertical (SNCS) y la horizontal (p25) se pueden arrastrar o escribir. Los recuentos de tipologías se actualizan en tiempo real.
- **Tipologías T1–T4.** Se calculan como en el estudio:
  - el SNCS frente al umbral vertical separa alineados de desalineados;
  - la *cola izquierda* exige p25 ≤ umbral horizontal y, si está activado, desviación estándar ≥ umbral;
  - T2 + T4 forman la señal de alerta.
- **Cuartiles del estudio.** Por defecto los umbrales son SNCS = 1, Q1(p25) y Q3(desviación), recalculados para el mínimo de publicaciones elegido. Al arrastrar una línea se pasa a umbrales manuales.
- **Buscador de proyectos.** Busca por referencia (al instante, en los datos ya cargados) y por título o resumen (en MongoDB, vía `/api/search`, con el índice de texto `texto_titulo_resumen`). Todas las palabras deben aparecer, se reconocen variantes de una palabra (p. ej. *learn* encuentra *learning*) y los resultados se ordenan por relevancia, con más peso para el título. Si el índice no existe, se usa una búsqueda por expresiones regulares, más lenta. Al hacer clic en un resultado, el gráfico hace zoom hasta el proyecto, lo señala y abre su panel de detalle. Si el filtro actual lo ocultaba, se ajusta el mínimo de publicaciones o el área y se avisa.
- **Filtros.** Mínimo de publicaciones (1 = todos los proyectos) y área científica.
- **Zoom y desplazamiento.** Rueda del ratón o botones `+`, `−` y `⟲`; arrastrar el fondo desplaza la vista.
- **Detalle del proyecto.** Al pasar por encima de un punto se ve su referencia. Al hacer clic se abre un panel con:
  - las métricas del proyecto;
  - su título y resumen;
  - la lista de sus publicaciones, cada una con su título, revista, tipo (revista, congreso, serie de libros…) y su resumen desplegable, más un buscador si hay muchas.

  La revista y el tipo se leen de los campos `prism:publicationName` y `prism:aggregationType` de la colección `publicaciones`. Si una publicación no los tiene, simplemente no se muestran.

  Estos textos se leen de MongoDB a través de la API `/api/project`.

Con un mínimo de 3 publicaciones y los cuartiles del estudio (Q1(p25) = 0,808, Q3(desviación) = 0,166), la app da: T1 8 442, T2 71, T3 7 811, T4 1 647 (1 718 alertas, 9,6 %). Son los datos con los resúmenes retraducidos (Drive `1acptFJwyNoVOVCeoWVE9Y5VLy_Vf0D-P`).

## Tecnología

- Vite + React + TypeScript, compilado como sitio estático.
- Puntos dibujados en `<canvas>` (24 203 proyectos); ejes, líneas y selección en SVG.
- d3-zoom para el zoom y d3-quadtree para localizar el punto bajo el cursor.
- `api/project.ts`: función serverless de Vercel que consulta MongoDB (colecciones `proyectos` y `publicaciones`). La URL de conexión solo existe en el servidor y nunca llega al navegador. En desarrollo, `vite.config.ts` sirve la misma función.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | URL de conexión a MongoDB, con la base de datos `proyectos` en la ruta |

Para desarrollo local, copia `.env.example` a `.env.local` y pon la URL real. `.env.local` está en `.gitignore` y no se sube al repositorio.

## Datos

`public/data/projects.json` contiene, por proyecto: referencia, área, número de publicaciones, SNCS, p25 y desviación estándar de las similitudes normalizadas. No incluye la financiación ni las similitudes individuales.

Se genera con `scripts/build_data.py`, que reproduce los cálculos del notebook:

```bash
# Descarga el JSON de Google Drive y regenera public/data/projects.json (requiere numpy)
python3 scripts/build_data.py

# O a partir de un fichero local
python3 scripts/build_data.py ruta/al/fichero.json
```

## Desarrollo

```bash
npm install
npm run dev       # servidor de desarrollo en http://localhost:5173
npm run build     # compilación de producción en dist/
npm run preview   # sirve dist/ en http://localhost:4173 (sin la API de MongoDB)
```

`npm run dev` incluye la API. `npm run preview` solo sirve los archivos estáticos, así que en él el panel de publicaciones dará error. Para probar la versión completa como en Vercel, usa `npx vercel dev`.

## Despliegue en Vercel

Vercel detecta el proyecto como Vite (`vercel.json` fija `npm run build` y la salida `dist/`) y despliega `api/project.ts` como función serverless.

Antes del primer despliegue:

1. **Variable de entorno:** en Vercel, ve a *Project → Settings → Environment Variables* y añade `MONGODB_URI` en *Production* y *Preview*. Si el proyecto ya estaba desplegado, vuelve a desplegarlo para que la recoja.
2. **Acceso de red en MongoDB Atlas:** las funciones de Vercel no tienen IP fija. En Atlas, ve a *Network Access → Add IP Address* y permite `0.0.0.0/0`, protegido por usuario y contraseña. Usa un usuario de base de datos **solo de lectura** sobre `proyectos`.
3. **Índices** (ya creados en Atlas):
   ```js
   db.proyectos.createIndex({ Referencia: 1 }, { name: 'referencia_1' })
   db.proyectos.createIndex(
     { Título_EN: 'text', Resumen_EN: 'text' },
     { name: 'texto_titulo_resumen', weights: { Título_EN: 3, Resumen_EN: 1 }, default_language: 'english' },
   )
   ```
   El índice de texto ocupa unos 80 MB, a tener en cuenta en el plan gratuito de 512 MB.

- **Desde Git:** sube el repositorio a GitHub, GitLab o Bitbucket y en Vercel elige *Add New → Project* e impórtalo.
- **Desde la terminal:** `npx vercel` (vista previa) y `npx vercel --prod` (producción).

El sitio desplegado es público salvo que se active la protección de despliegues de Vercel, y `projects.json` es accesible para cualquiera con la URL.

## Actualizar los textos en Atlas

`scripts/sync_atlas.mjs` copia `Título_EN` y `Resumen_EN` de la MongoDB local a Atlas, emparejando por `_id`. Solo cambia esos campos y nunca sobrescribe con un texto vacío.

```bash
export MONGODB_URI=...   # Atlas
export LOCAL_URI=...     # MongoDB local
node scripts/sync_atlas.mjs           # simulación
node scripts/sync_atlas.mjs --apply   # aplica los cambios
```

Comprueba antes el espacio libre en Atlas: el plan gratuito permite 512 MB para todo el clúster. Después vuelve a desplegar en Vercel para vaciar la caché de `/api/project`.
