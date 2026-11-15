import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { pool } from '../db.js';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_COLUMNS = 'id, filename, mime_type, size_bytes, status, error, num_chunks, created_at';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) return cb(null, true);
    const err = new Error(`Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    err.status = 400;
    cb(err);
  },
});

const storedPath = (doc) =>
  path.join(config.uploadDir, `${doc.id}${path.extname(doc.filename).toLowerCase()}`);

async function findDocument(id) {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function sendToMlService(doc, buffer, mimeType) {
  const form = new FormData();
  form.append('document_id', doc.id);
  form.append('file', new Blob([buffer], { type: mimeType }), doc.filename);
  const res = await fetch(`${config.mlServiceUrl}/ingest`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ML service returned ${res.status}: ${await res.text()}`);
}

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM documents ORDER BY created_at DESC`);
  res.json(rows);
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (form field must be "file")' });

  const { buffer, mimetype, size } = req.file;
  // multer decodes filenames as latin1; fix non-ASCII names.
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM documents WHERE content_hash = $1`, [hash]);
  if (existing.rows[0]?.status === 'failed') {
    await pool.query('DELETE FROM documents WHERE id = $1', [existing.rows[0].id]); // allow retry
  } else if (existing.rows[0]) {
    return res.status(200).json({ ...existing.rows[0], duplicate: true });
  }

  const {
    rows: [doc],
  } = await pool.query(
    `INSERT INTO documents (filename, mime_type, size_bytes, content_hash)
     VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_COLUMNS}`,
    [filename, mimetype, size, hash],
  );

  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(storedPath(doc), buffer);

  try {
    await sendToMlService(doc, buffer, mimetype);
  } catch (err) {
    doc.status = 'failed';
    doc.error = `Could not start ingestion: ${err.message}`;
    await pool.query(`UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [
      doc.id,
      doc.error,
    ]);
  }

  res.status(202).json(doc);
});

router.get('/:id/file', async (req, res) => {
  const doc = await findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
  res.sendFile(storedPath(doc));
});

router.delete('/:id', async (req, res) => {
  const doc = await findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]); // chunks cascade
  await fs.rm(storedPath(doc), { force: true });
  res.status(204).end();
});

export default router;
