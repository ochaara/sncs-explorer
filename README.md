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
- **Selección.** Al pasar por encima de un punto se ve su referencia. Al hacer clic se muestra en el panel lateral con sus métricas.

Con un mínimo de 3 publicaciones y los cuartiles del estudio, la app reproduce los resultados del notebook: T1 8 438, T2 73, T3 7 739, T4 1 721 (1 794 alertas).

## Tecnología

- Vite + React + TypeScript, compilado como sitio estático.
- Puntos dibujados en `<canvas>` (24 203 proyectos); ejes, líneas y selección en SVG.
- d3-zoom para el zoom y d3-quadtree para localizar el punto bajo el cursor.

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
npm run preview   # sirve dist/ en http://localhost:4173
```

## Despliegue en Vercel

Vercel detecta el proyecto como Vite (`vercel.json` fija `npm run build` y la salida `dist/`).

- **Desde Git:** sube el repositorio a GitHub, GitLab o Bitbucket y en Vercel elige *Add New → Project* e impórtalo.
- **Desde la terminal:** `npx vercel` (vista previa) y `npx vercel --prod` (producción).

El sitio desplegado es público salvo que se active la protección de despliegues de Vercel, y `projects.json` es accesible para cualquiera con la URL.
