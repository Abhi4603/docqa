import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { pool } from './db.js';
import chatRouter from './routes/chat.js';
import documentsRouter from './routes/documents.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  const status = { api: 'ok', db: 'down', ml: 'down' };
  try {
    await pool.query('SELECT 1');
    status.db = 'ok';
  } catch {}
  try {
    const r = await fetch(`${config.mlServiceUrl}/health`);
    if (r.ok) status.ml = 'ok';
  } catch {}
  res.status(status.db === 'ok' && status.ml === 'ok' ? 200 : 503).json(status);
});

app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);

// Express 5 forwards rejected promises from async handlers here.
app.use((err, req, res, next) => {
  const status = err.status ?? (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
