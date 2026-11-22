import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { checkOrigin } from './auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import { createCollabServer, flushAllRooms, handleCollabUpgrade } from './collab.js';
import { createEventsServer, handleEventsUpgrade } from './events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS in front of us
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api', checkOrigin);
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // SPA fallback: anything that is not an API or socket route renders the app.
  app.get(/^\/(?!api\/|collab$|events$|healthz$).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(503).type('text/plain').send('Client bundle not built. Run: npm run build');
  });
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg shape
app.use((err, _req, res, _next) => {
  console.error('[http]', err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const server = http.createServer(app);

const collabWss = createCollabServer();
const eventsWss = createEventsServer();

server.on('upgrade', (request, socket, head) => {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    return socket.destroy();
  }

  if (url.pathname === '/collab') {
    handleCollabUpgrade(collabWss, request, socket, head, url);
  } else if (url.pathname === '/events') {
    handleEventsUpgrade(eventsWss, request, socket, head, url);
  } else {
    socket.destroy();
  }
});

async function start() {
  try {
    await migrate();
  } catch (err) {
    console.error('[scriptdocs] migration failed:', err.message);
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`[scriptdocs] listening on :${config.port}`);
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[scriptdocs] ${signal} received, flushing documents...`);

  const timeout = setTimeout(() => process.exit(1), 10000);
  try {
    await flushAllRooms();
    await pool.end();
  } catch (err) {
    console.error('[scriptdocs] shutdown:', err.message);
  }
  clearTimeout(timeout);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
