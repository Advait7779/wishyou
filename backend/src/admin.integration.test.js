import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { passwordVersion, syncConfiguredAdmin } from './admin.js';

const databaseUrl = process.env.RUN_DB_INTEGRATION === '1'
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL : null;

test('configured admin password rotation replaces the hash and session version',
  { skip: !databaseUrl }, async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const schema = `wishyou_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query('CREATE TABLE admins(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL)');
      const query = client.query.bind(client);
      await syncConfiguredAdmin(query, ' ADMIN@EXAMPLE.COM ', 'first-unique-password');
      const first = (await query('SELECT id,password_hash FROM admins WHERE email=$1', ['admin@example.com'])).rows[0];
      assert.equal(await bcrypt.compare('first-unique-password', first.password_hash), true);
      await syncConfiguredAdmin(query, 'admin@example.com', 'first-unique-password');
      const unchanged = (await query('SELECT password_hash FROM admins WHERE id=$1', [first.id])).rows[0];
      assert.equal(unchanged.password_hash, first.password_hash);
      await syncConfiguredAdmin(query, 'admin@example.com', 'second-unique-password');
      const rotated = (await query('SELECT id,password_hash FROM admins')).rows[0];
      assert.equal(rotated.id, first.id);
      assert.equal(await bcrypt.compare('first-unique-password', rotated.password_hash), false);
      assert.equal(await bcrypt.compare('second-unique-password', rotated.password_hash), true);
      assert.notEqual(passwordVersion(rotated.password_hash), passwordVersion(first.password_hash));
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });
