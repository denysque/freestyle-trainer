import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// dev: поднимаем те же api/*.ts через ssrLoadModule с минимальным @vercel/node-адаптером.
function devApiPlugin(): Plugin {
  const ROUTES = ['random-noun', 'rhymes', 'define'] as const;
  return {
    name: 'dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();
        const route = url.split('?')[0].replace(/^\/api\//, '').replace(/\.[a-z]+$/, '');
        if (!(ROUTES as readonly string[]).includes(route)) return next();

        const u = new URL(url, 'http://localhost');
        const query: Record<string, string | string[]> = {};
        for (const [k, v] of u.searchParams.entries()) {
          if (k in query) {
            const cur = query[k];
            query[k] = Array.isArray(cur) ? [...cur, v] : [cur as string, v];
          } else {
            query[k] = v;
          }
        }

        let body: unknown = undefined;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf-8');
          try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
        }

        const adaptedReq = Object.assign(req as IncomingMessage, { query, body });

        const r = res as ServerResponse;
        const adaptedRes = Object.assign(r, {
          status(code: number) { r.statusCode = code; return adaptedRes; },
          json(data: unknown) {
            r.setHeader('content-type', 'application/json; charset=utf-8');
            r.end(JSON.stringify(data));
            return adaptedRes;
          },
          send(data: unknown) {
            r.end(typeof data === 'string' ? data : JSON.stringify(data));
            return adaptedRes;
          },
        });

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const handler = mod.default as (q: unknown, s: unknown) => unknown | Promise<unknown>;
          await handler(adaptedReq, adaptedRes);
        } catch (e) {
          console.error('[dev-api]', route, e);
          if (!r.headersSent) {
            r.statusCode = 500;
            r.setHeader('content-type', 'application/json');
            r.end(JSON.stringify({ error: 'internal' }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
});
