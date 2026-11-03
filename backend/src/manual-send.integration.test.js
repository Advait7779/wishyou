import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { createCampaign } from './queue.js';

const databaseUrl = process.env.RUN_DB_INTEGRATION === '1' ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL : null;
test('manual send replay creates one delivery and spends one allowance', { skip: !databaseUrl }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    await client.query('BEGIN'); const schema = `wishyou_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`CREATE TABLE contacts(id BIGINT PRIMARY KEY,display_name TEXT,phone TEXT,birth_date DATE,anniversary_date DATE,active BOOLEAN);
      CREATE TABLE wish_templates(id BIGINT PRIMARY KEY,occasion TEXT,channel TEXT,active BOOLEAN,content TEXT,ready_url_encrypted TEXT,provider_config JSONB);
      CREATE TABLE campaigns(id BIGSERIAL PRIMARY KEY,name TEXT,occasion TEXT,channel TEXT,template_id BIGINT,content_snapshot TEXT,provider_snapshot JSONB,send_at TIMESTAMPTZ,auto_generated BOOLEAN,schedule_date DATE,status TEXT DEFAULT 'scheduled');
      CREATE TABLE deliveries(id BIGSERIAL PRIMARY KEY,campaign_id BIGINT,contact_id BIGINT,contact_name TEXT,phone TEXT,status TEXT DEFAULT 'queued',UNIQUE(campaign_id,contact_id));
      CREATE TABLE manual_contact_sends(id BIGSERIAL PRIMARY KEY,phone TEXT,requested_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE manual_send_requests(request_key UUID PRIMARY KEY,contact_id BIGINT,occasion TEXT,channel TEXT,campaign_id BIGINT);
      INSERT INTO contacts VALUES(1,'Test','9100000000','2000-01-01',NULL,true);
      INSERT INTO wish_templates VALUES(1,'birthday','sms',true,'Test preview','test-encrypted-placeholder','{}')`);
    const db = { query: client.query.bind(client), transaction: async fn => {
      await client.query('SAVEPOINT send_attempt');
      try { const result = await fn(client); await client.query('RELEASE SAVEPOINT send_attempt'); return result; }
      catch (error) { await client.query('ROLLBACK TO SAVEPOINT send_attempt'); throw error; }
    } };
    const input = { occasion: 'birthday', channel: 'sms', templateId: 1, contactIds: [1], sendAt: new Date(), manualContactSend: true, forceResend: true, requestKey: randomUUID() };
    const first = await createCampaign(input, db); const replay = await createCampaign(input, db);
    assert.equal(first.id, replay.id);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM deliveries')).rows[0].count, 1);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM manual_contact_sends')).rows[0].count, 1);
    await assert.rejects(createCampaign({ ...input, requestKey: randomUUID() }, db), { status: 409 });
    await client.query("UPDATE deliveries SET status='sent'");
    await createCampaign({ ...input, requestKey: randomUUID() }, db);
    await client.query("UPDATE deliveries SET status='sent'");
    await assert.rejects(createCampaign({ ...input, requestKey: randomUUID() }, db), { status: 429 });
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
});
