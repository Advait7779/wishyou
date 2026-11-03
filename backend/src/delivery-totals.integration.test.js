import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { setupDeliveryTotals } from './delivery-totals.js';

const databaseUrl = process.env.RUN_DB_INTEGRATION === '1'
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL : null;

test('delivery totals stay exact across insert, status changes, and bulk delete',
  { skip: !databaseUrl }, async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const schema = `wishyou_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query('CREATE TABLE deliveries(id BIGSERIAL PRIMARY KEY,status TEXT NOT NULL)');
      await client.query("INSERT INTO deliveries(status) VALUES('queued'),('sent'),('failed')");
      await setupDeliveryTotals(client);
      await setupDeliveryTotals(client);
      const totals = async () => {
        const result = await client.query('SELECT sent,failed FROM delivery_totals WHERE id=true');
        return result.rows[0];
      };
      assert.deepEqual(await totals(), { sent: '1', failed: '1' });
      await client.query("INSERT INTO deliveries(status) VALUES('queued'),('sent')");
      assert.deepEqual(await totals(), { sent: '2', failed: '1' });
      await client.query("UPDATE deliveries SET status='sending' WHERE id=1");
      await client.query("UPDATE deliveries SET status='sent' WHERE id=1");
      await client.query("UPDATE deliveries SET status='failed' WHERE id=2");
      assert.deepEqual(await totals(), { sent: '2', failed: '2' });
      await client.query("DELETE FROM deliveries WHERE status IN ('sent','failed')");
      assert.deepEqual(await totals(), { sent: '0', failed: '0' });
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });
