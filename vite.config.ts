import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function pap5PdfDevApiPlugin(): Plugin {
  return {
    name: 'pap5-pdf-dev-api',
    configureServer(server) {
      const handlePap5PdfRequest = async (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
      ) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const rawBody = await readRequestBody(req);
          const payload = JSON.parse(rawBody.replace(/^\uFEFF/, '') || '{}');
          const { createPap5PdfHttpResult } = await import('./src/server/pap5PdfHttp');
          const origin = `http://${req.headers.host ?? '127.0.0.1:3000'}`;
          const result = await createPap5PdfHttpResult({ payload, origin });

          res.statusCode = result.status;
          Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
          res.end(result.body);
        } catch (error) {
          console.error('Pap5 PDF export failed', error);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Pap5 PDF export failed' }));
        }
      };

      server.middlewares.use('/api/pap5-pdf', handlePap5PdfRequest);
      server.middlewares.use('/api/export/pap5/preview', handlePap5PdfRequest);
    },
  };
}

function splitVendorChunk(id: string) {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
  if (id.includes('@supabase')) return 'supabase-vendor';
  if (id.includes('exceljs')) return 'exceljs-vendor';
  if (id.includes('file-saver')) return 'file-saver-vendor';
  if (id.includes('jszip')) return 'zip-vendor';
  if (id.includes('@react-pdf') || id.includes('fontkit')) return 'pdf-vendor';
  if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
  if (id.includes('lucide-react')) return 'icons-vendor';

  return 'vendor';
}

export default defineConfig({
  plugins: [pap5PdfDevApiPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: {
      ignored: [
        '**/.git/**',
        '**/dist/**',
        '**/tmp/**',
        '**/recovered-old-project/**',
        '**/*.log',
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: splitVendorChunk,
      },
    },
  },
});
