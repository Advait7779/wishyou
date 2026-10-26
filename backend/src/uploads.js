import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from './db.js';
import { clientError } from './api-errors.js';

export const MAX_UPLOAD_BYTES = 50 * 1024 ** 3;
export const MAX_CHUNK_BYTES = 16 * 1024 ** 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const backendDir = fileURLToPath(new URL('..', import.meta.url));
const uploadDir = path.resolve(process.env.IMPORT_UPLOAD_DIR || path.join(backendDir, 'uploads'));
const workerPath = path.join(backendDir, 'import_worker.py');
const bundledPython = process.platform === 'win32'
  ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
  : path.join(backendDir, '.venv', 'bin', 'python');
let activeWorker = null;
let activeWorkerDone = null;
let claimingWorker = false;
let stopping = false;
const timers = [];

export function validateUpload(filename, size) {
  const cleanName = String(filename || '').split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim();
  const bytes = Number(size);
  if (!cleanName || cleanName.length > 255 || !/\.(csv|xlsx)$/i.test(cleanName)) throw new Error('Choose a .csv or .xlsx file.');
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_UPLOAD_BYTES) throw new Error('The file must be at most 50 GiB.');
  return { filename: cleanName, size: bytes };
}

function uploadPath(id) { return path.join(uploadDir, `${id}.part`); }
function publicJob(row) {
  if (!row) return null;
  return {
    id: row.id, filename: row.filename, size: Number(row.file_size),
    dateFormat: row.date_format,
    offset: Number(row.received_bytes), status: row.status,
    processedRows: Number(row.processed_rows), imported: Number(row.imported_count),
    skipped: Number(row.skipped_count), invalidSample: row.invalid_sample || [],
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function getJob(id) {
  if (!UUID.test(id)) return null;
  return (await q('SELECT * FROM import_jobs WHERE id=$1', [id])).rows[0] || null;
}

export async function runNextImport() {
  if (activeWorker || claimingWorker || stopping) return;
  claimingWorker = true;
  try {
  const job = (await q(`UPDATE import_jobs SET status='processing', updated_at=now()
    WHERE id=(SELECT id FROM import_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id`)).rows[0];
  if (!job) return;
  if (stopping) {
    await q("UPDATE import_jobs SET status='queued',updated_at=now() WHERE id=$1", [job.id]);
    return;
  }
  const python = process.env.PYTHON_BIN || await fs.access(bundledPython).then(() => bundledPython).catch(() => 'python');
  if (stopping) {
    await q("UPDATE import_jobs SET status='queued',updated_at=now() WHERE id=$1", [job.id]);
    return;
  }
  const child = spawn(python, ['-u', workerPath, job.id], {
    cwd: backendDir, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeWorker = child;
  let resolveWorkerDone;
  activeWorkerDone = new Promise(resolve => { resolveWorkerDone = resolve; });
  child.stdout.on('data', chunk => process.stdout.write(`[import ${job.id}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[import ${job.id}] ${chunk}`));
  child.on('error', async error => {
    console.error('Import worker could not start:', error);
    await q("UPDATE import_jobs SET status='failed', error=$2, updated_at=now() WHERE id=$1 AND status IN ('processing','waiting_for_sends')", [job.id, error.message]).catch(console.error);
  });
  child.on('close', async code => {
    activeWorker = null;
    try {
      if (stopping) {
        await q("UPDATE import_jobs SET status='queued', updated_at=now() WHERE id=$1 AND status IN ('processing','waiting_for_sends')", [job.id]);
      } else {
        if (code !== 0) {
          await q("UPDATE import_jobs SET status='failed', error=COALESCE(error,$2), updated_at=now() WHERE id=$1 AND status IN ('processing','waiting_for_sends')", [job.id, `Importer exited with code ${code}`]);
        }
        runNextImport().catch(error => console.error('Import runner:', error));
      }
    } catch (error) { console.error('Import worker exit:', error); }
    finally { resolveWorkerDone(); activeWorkerDone = null; }
  });
  } finally { claimingWorker = false; }
}

export async function recoverStaleImports() {
  const stale = (await q("SELECT id FROM import_jobs WHERE status IN ('processing','waiting_for_sends') AND updated_at < now() - interval '5 minutes'")).rows;
  for (const { id } of stale) {
    const client = await pool.connect();
    try {
      // The Python importer keeps this session lock throughout its run. A stale
      // progress timestamp alone does not mean a large workbook has stopped.
      const locked = (await client.query('SELECT pg_try_advisory_lock(7287, hashtext($1)) AS acquired', [id])).rows[0].acquired;
      if (locked) {
        try {
          await client.query("UPDATE import_jobs SET status='queued',updated_at=now() WHERE id=$1 AND status IN ('processing','waiting_for_sends') AND updated_at < now() - interval '5 minutes'", [id]);
        } finally {
          await client.query('SELECT pg_advisory_unlock(7287, hashtext($1))', [id]);
        }
      }
    } finally { client.release(); }
  }
}

export async function recoverImports() {
  await fs.mkdir(uploadDir, { recursive: true });
  await recoverStaleImports();
  runNextImport().catch(error => console.error('Import runner:', error));
  timers.push(setInterval(async () => {
    try { await recoverStaleImports(); await runNextImport(); }
    catch (error) { console.error('Import runner:', error); }
  }, 30000));
  const cleanAbandoned = async () => {
    const old = (await q("DELETE FROM import_jobs WHERE status IN ('uploading','failed') AND updated_at < now() - interval '7 days' RETURNING id")).rows;
    for (const row of old) await fs.unlink(uploadPath(row.id)).catch(error => {
      if (error.code !== 'ENOENT') console.error('Upload cleanup:', error);
    });
  };
  cleanAbandoned().catch(error => console.error('Upload cleanup:', error));
  timers.push(setInterval(() => cleanAbandoned().catch(error => console.error('Upload cleanup:', error)), 60 * 60 * 1000));
}

export async function stopImports() {
  stopping = true;
  for (const timer of timers) clearInterval(timer);
  while (claimingWorker) await new Promise(resolve => setTimeout(resolve, 25));
  if (!activeWorkerDone) return;
  const done = activeWorkerDone;
  if (activeWorker) activeWorker.kill('SIGTERM');
  await done;
}

export function installUploadRoutes(app, asyncRoute, audit) {
  app.post('/api/imports/uploads', asyncRoute(async (req, res) => {
    let input;
    try { input = validateUpload(req.body.filename, req.body.size); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const dateFormat = req.body.dateFormat;
    if (!['DMY', 'MDY'].includes(dateFormat)) return res.status(400).json({ error: 'Choose DD/MM/YYYY or MM/DD/YYYY before uploading. ISO and Excel dates work with either choice.' });
    await fs.mkdir(uploadDir, { recursive: true });
    const client = await pool.connect();
    let id;
    let committed = false;
    try {
      await client.query('BEGIN');
      // Only one large import may occupy upload, staging, and WAL space at a time.
      await client.query('SELECT pg_advisory_xact_lock(7286, 2)');
      const active = await client.query("SELECT 1 FROM import_jobs WHERE status IN ('uploading','queued','processing','waiting_for_sends') LIMIT 1");
      if (active.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Another upload or import is in progress. Finish or cancel it first.' });
      }
      const space = await fs.statfs(uploadDir);
      if (Number(space.bavail) * Number(space.bsize) < input.size + 1024 ** 3) {
        await client.query('ROLLBACK');
        return res.status(507).json({ error: 'Not enough free upload storage for this file.' });
      }
      id = randomUUID();
      await fs.writeFile(uploadPath(id), '', { flag: 'wx' });
      const row = (await client.query('INSERT INTO import_jobs(id,filename,file_size,date_format) VALUES($1,$2,$3,$4) RETURNING *', [id, input.filename, input.size, dateFormat])).rows[0];
      await client.query('COMMIT');
      committed = true;
      res.status(201).json(publicJob(row));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (id && !committed) await fs.unlink(uploadPath(id)).catch(() => {});
      throw error;
    } finally { client.release(); }
  }));

  app.get('/api/imports/uploads/latest', asyncRoute(async (_req, res) => {
    const row = (await q('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 1')).rows[0];
    res.json(publicJob(row));
  }));

  app.get('/api/imports/uploads/:id', asyncRoute(async (req, res) => {
    const row = await getJob(req.params.id);
    if (!row) return res.status(404).json({ error: 'Upload not found.' });
    res.json(publicJob(row));
  }));

  app.delete('/api/imports/uploads/:id', asyncRoute(async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Upload not found.' });
    const deleted = await q("DELETE FROM import_jobs WHERE id=$1 AND status IN ('uploading','failed') RETURNING id", [id]);
    if (!deleted.rowCount) return res.status(409).json({ error: 'This import is already queued or running.' });
    await fs.unlink(uploadPath(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    res.json({ ok: true });
  }));

  app.patch('/api/imports/uploads/:id', asyncRoute(async (req, res, next) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Upload not found.' });
    const length = Number(req.headers['content-length']);
    const offset = Number(req.headers['upload-offset']);
    if (req.headers['content-type'] !== 'application/octet-stream' || !Number.isSafeInteger(length) || length < 1 || length > MAX_CHUNK_BYTES || !Number.isSafeInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'Send an upload chunk of at most 16 MiB with its offset.' });
    }
    const client = await pool.connect();
    let file;
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT * FROM import_jobs WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Upload not found.' }); }
      const received = Number(row.received_bytes);
      if (row.status !== 'uploading') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This upload is no longer accepting chunks.' }); }
      if (offset !== received) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Upload offset changed.', offset: received }); }
      if (received + length > Number(row.file_size)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Chunk exceeds the declared file size.' }); }
      file = await fs.open(uploadPath(id), 'r+');
      let written = 0;
      for await (const chunk of req) {
        if (written + chunk.length > length) throw clientError('Chunk is larger than its Content-Length.');
        let position = 0;
        while (position < chunk.length) {
          const result = await file.write(chunk, position, chunk.length - position, offset + written + position);
          position += result.bytesWritten;
        }
        written += chunk.length;
      }
      if (written !== length) throw clientError('Incomplete upload chunk. Retry from the reported offset.');
      await file.sync();
      const next = (await client.query('UPDATE import_jobs SET received_bytes=$2,updated_at=now() WHERE id=$1 RETURNING *', [id, received + written])).rows[0];
      await client.query('COMMIT');
      res.json(publicJob(next));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (!res.headersSent && !req.destroyed) next(error);
      else if (!error.status) console.error('Upload chunk failed:', error);
    } finally {
      await file?.close().catch(() => {});
      client.release();
    }
  }));

  app.post('/api/imports/uploads/:id/complete', asyncRoute(async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Upload not found.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT * FROM import_jobs WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Upload not found.' }); }
      if (row.status !== 'uploading' || Number(row.received_bytes) !== Number(row.file_size)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Upload is not complete.', offset: Number(row.received_bytes) });
      }
      const stat = await fs.stat(uploadPath(id));
      if (stat.size !== Number(row.file_size)) throw clientError('Uploaded file size does not match.', 409);
      const queued = (await client.query("UPDATE import_jobs SET status='queued',updated_at=now() WHERE id=$1 RETURNING *", [id])).rows[0];
      await client.query('COMMIT');
      await audit('import.upload_completed', { jobId: id, bytes: Number(row.file_size) });
      runNextImport().catch(error => console.error('Import runner:', error));
      res.status(202).json(publicJob(queued));
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }));
}
