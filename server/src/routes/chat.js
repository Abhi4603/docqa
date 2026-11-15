import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';

const router = Router();

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((t) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
    .slice(-6)
    .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}

/**
 * Proxies the ML service's NDJSON stream straight to the browser, while collecting
 * the full answer so it can be logged to Postgres afterwards.
 */
router.post('/', async (req, res) => {
  const { question, documentIds, history } = req.body ?? {};
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) {
    return res.status(400).json({ error: '"question" must be a non-empty string (max 2000 chars)' });
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(); // user closed the tab / pressed stop
  });

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(`${config.mlServiceUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question.trim(),
        document_ids: Array.isArray(documentIds) && documentIds.length ? documentIds : null,
        history: sanitizeHistory(history),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    return res.status(502).json({ error: `ML service unreachable: ${err.message}` });
  }
  if (!upstream.ok) {
    return res.status(502).json({ error: `ML service error ${upstream.status}: ${await upstream.text()}` });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let sources = [];

  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'token') answer += event.content;
        else if (event.type === 'sources') sources = event.sources;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Chat stream error', err);
  }
  res.end();

  if (answer) {
    pool
      .query('INSERT INTO chat_messages (question, answer, sources, latency_ms) VALUES ($1, $2, $3, $4)', [
        question,
        answer,
        JSON.stringify(sources.map(({ content, ...meta }) => meta)),
        Date.now() - started,
      ])
      .catch((err) => console.error('Failed to log chat message', err));
  }
});

router.get('/history', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, question, answer, sources, latency_ms, created_at FROM chat_messages ORDER BY id DESC LIMIT 50',
  );
  res.json(rows);
});

export default router;
