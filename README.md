# Explorador SNCS · heterogeneidad intra-proyecto

Aplicación web interactiva basada en el gráfico de la sección *3.3. Resultados para RQ3: desalineación parcial intra-proyecto* de `InvestigaciónV2.ipynb`. Cada punto es un proyecto: en el eje X está su SNCS y en el eje Y el percentil 25 de sus similitudes normalizadas.

## Funciones

- **Umbrales arrastrables.** La línea vertical (SNCS) y la horizontal (p25) se pueden arrastrar o escribir. Los recuentos de tipologías se actualizan en tiempo real.
- **Tipologías T1–T4.** Se calculan como en el estudio:
  - el SNCS frente al umbral vertical separa alineados de desalineados;
  - la *cola izquierda* exige p25 ≤ umbral horizontal y, si está activado, desviación estándar ≥ umbral;
  - T2 + T4 forman la señal de alerta.
- **Cuartiles del estudio.** Por defecto los umbrales son SNCS = 1, Q1(p25) y Q3(desviación), recalculados para el mínimo de publicaciones elegido. Al arrastrar una línea se pasa a umbrales manuales.
- **Filtros.** Mínimo de publicaciones (1 = todos los proyectos) y área científica.
- **Zoom y desplazamiento.** Rueda del ratón o botones `+`, `−` y `⟲`; arrastrar el fondo desplaza la vista.
- **Detalle del proyecto.** Al pasar por encima de un punto se ve su referencia. Al hacer clic se abre un panel con:
  - las métricas del proyecto;
  - su título y resumen;
  - la lista de sus publicaciones, cada una con su título, revista, tipo (revista, congreso, serie de libros…) y su resumen desplegable, más un buscador si hay muchas.

  La revista y el tipo se leen de los campos `prism:publicationName` y `prism:aggregationType` de la colección `publicaciones`. Si una publicación no los tiene, simplemente no se muestran.

  Estos textos se leen de MongoDB a través de la API `/api/project`.

Con un mínimo de 3 publicaciones y los cuartiles del estudio, la app reproduce los resultados del notebook: T1 8 438, T2 73, T3 7 739, T4 1 721 (1 794 alertas).

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
3. **Índice (recomendado):** acelera la búsqueda por referencia:
   ```js
   db.proyectos.createIndex({ Referencia: 1 })
   ```

- **Desde Git:** sube el repositorio a GitHub, GitLab o Bitbucket y en Vercel elige *Add New → Project* e impórtalo.
- **Desde la terminal:** `npx vercel` (vista previa) y `npx vercel --prod` (producción).

El sitio desplegado es público salvo que se active la protección de despliegues de Vercel, y `projects.json` es accesible para cualquiera con la URL.
