import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo (`npm run dev`) sirve /api/project y /api/search con el mismo código que la
 * función serverless de Vercel, para no necesitar `vercel dev`.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const name of ['project', 'search']) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          try {
            const mod = await server.ssrLoadModule(`/api/${name}.ts`);
            await mod.default(req, res);
          } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Carga MONGODB_URI desde .env.local para la API de desarrollo
  const env = loadEnv(mode, process.cwd(), '');
  if (env.MONGODB_URI) process.env.MONGODB_URI = env.MONGODB_URI;
  return { plugins: [react(), devApi()] };
});
