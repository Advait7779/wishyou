import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import express from 'express';
import bcrypt from 'bcryptjs';
import { setupMobileSessions, installMobileLogin, validateMobileSession } from './mobile-auth.js';
import { passwordVersion } from './admin.js';

const databaseUrl = process.env.RUN_DB_INTEGRATION === '1' ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL : null;
test('mobile refresh rotates, detects replay, revokes access, and respects password rotation', { skip: !databaseUrl }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  let server; const originalSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-mobile-secret-only-'.repeat(3);
  try {
    await client.query('BEGIN'); const schema = `wishyou_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query('CREATE TABLE admins(id BIGSERIAL PRIMARY KEY,email TEXT,password_hash TEXT); CREATE TABLE campaigns(id BIGSERIAL PRIMARY KEY)');
    await setupMobileSessions(client.query.bind(client));
    const hash = await bcrypt.hash('test-password-123', 4); let version = passwordVersion(hash);
    await client.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)', ['mobile@example.com', hash]);
    const app = express(); app.use(express.json()); const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
    installMobileLogin(app, asyncRoute, { query: client.query.bind(client), transaction: fn => fn(client), email: 'mobile@example.com', version: () => version });
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/mobile`;
    const post = (path, body) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const first = await (await post('login', { email: 'mobile@example.com', password: 'test-password-123' })).json();
    assert.equal((await validateMobileSession(client.query.bind(client), first.accessToken, version)).client, 'mobile');
    const rotated = await (await post('refresh', { refreshToken: first.refreshToken })).json(); assert.notEqual(rotated.refreshToken, first.refreshToken);
    assert.equal((await post('refresh', { refreshToken: first.refreshToken })).status, 401);
    await assert.rejects(validateMobileSession(client.query.bind(client), rotated.accessToken, version));
    const second = await (await post('login', { email: 'mobile@example.com', password: 'test-password-123' })).json();
    version = 'changed-password-version';
    assert.equal((await post('refresh', { refreshToken: second.refreshToken })).status, 401);
    await assert.rejects(validateMobileSession(client.query.bind(client), second.accessToken, version));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    await client.query('ROLLBACK').catch(() => {}); await client.end();
  }
});
