import pg from 'pg';
import bcrypt from 'bcryptjs';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
export const q = (sql, params = []) => pool.query(sql, params);

export async function setupDatabase() {
  await q(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS datasets (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, columns JSONB NOT NULL,
      mapping JSONB NOT NULL, row_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id BIGSERIAL PRIMARY KEY, dataset_id BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      data JSONB NOT NULL, display_name TEXT, phone TEXT NOT NULL,
      birth_date DATE, anniversary_date DATE, active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts(phone);
    CREATE INDEX IF NOT EXISTS contacts_birth_idx ON contacts(birth_date);
    CREATE INDEX IF NOT EXISTS contacts_anniversary_idx ON contacts(anniversary_date);
    CREATE INDEX IF NOT EXISTS contacts_birth_month_day_idx ON contacts((EXTRACT(MONTH FROM birth_date)),(EXTRACT(DAY FROM birth_date))) WHERE active=true;
    CREATE INDEX IF NOT EXISTS contacts_anniversary_month_day_idx ON contacts((EXTRACT(MONTH FROM anniversary_date)),(EXTRACT(DAY FROM anniversary_date))) WHERE active=true;
    CREATE TABLE IF NOT EXISTS provider_configs (
      channel TEXT PRIMARY KEY CHECK (channel IN ('sms','voice')),
      endpoint TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET',
      public_config JSONB NOT NULL DEFAULT '{}', secret_encrypted TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wish_templates (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      occasion TEXT NOT NULL CHECK (occasion IN ('birthday','anniversary')),
      channel TEXT NOT NULL CHECK (channel IN ('sms','voice')),
      content TEXT NOT NULL, provider_config JSONB NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      occasion TEXT NOT NULL CHECK (occasion IN ('birthday','anniversary')),
      channel TEXT NOT NULL CHECK (channel IN ('sms','voice')),
      template_id BIGINT REFERENCES wish_templates(id) ON DELETE SET NULL,
      content_snapshot TEXT NOT NULL, provider_snapshot JSONB NOT NULL DEFAULT '{}', send_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled', auto_generated BOOLEAN NOT NULL DEFAULT false,
      schedule_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id BIGSERIAL PRIMARY KEY, campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
      contact_name TEXT, phone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ,
      sending_started_at TIMESTAMPTZ,
      provider_response TEXT, error TEXT, sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(campaign_id, contact_id)
    );
    CREATE INDEX IF NOT EXISTS deliveries_queue_idx ON deliveries(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS deliveries_campaign_status_idx ON deliveries(campaign_id,status);
    CREATE INDEX IF NOT EXISTS deliveries_sent_phone_idx ON deliveries(phone) WHERE status='sent';
    CREATE INDEX IF NOT EXISTS campaigns_occasion_channel_send_idx ON campaigns(occasion,channel,send_at);
    CREATE TABLE IF NOT EXISTS provider_rate_slots (
      channel TEXT PRIMARY KEY CHECK (channel IN ('sms','voice')),
      next_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS manual_contact_sends (
      id BIGSERIAL PRIMARY KEY, phone TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS manual_contact_sends_phone_time_idx ON manual_contact_sends(phone, requested_at);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS import_jobs (
      id UUID PRIMARY KEY, filename TEXT NOT NULL, file_size BIGINT NOT NULL,
      received_bytes BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'uploading',
      processed_rows BIGINT NOT NULL DEFAULT 0,
      imported_count BIGINT NOT NULL DEFAULT 0,
      skipped_count BIGINT NOT NULL DEFAULT 0,
      columns JSONB, mapping JSONB, invalid_sample JSONB NOT NULL DEFAULT '[]',
      date_format TEXT NOT NULL DEFAULT 'DMY' CHECK (date_format IN ('DMY','MDY')),
      error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON import_jobs(status, created_at);
  `);
  await q("ALTER TABLE wish_templates ADD COLUMN IF NOT EXISTS provider_config JSONB NOT NULL DEFAULT '{}'");
  await q('ALTER TABLE wish_templates ADD COLUMN IF NOT EXISTS ready_url_encrypted TEXT');
  await q('ALTER TABLE wish_templates ADD COLUMN IF NOT EXISTS settings_slot BOOLEAN NOT NULL DEFAULT false');
  await q('CREATE UNIQUE INDEX IF NOT EXISTS wish_templates_settings_slot_idx ON wish_templates(occasion, channel) WHERE settings_slot=true');
  await q("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS provider_snapshot JSONB NOT NULL DEFAULT '{}'");
  await q('ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_date DATE');
  await q('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMPTZ');
  await q('ALTER TABLE datasets ALTER COLUMN row_count TYPE BIGINT');
  await q("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'DMY'");
  await q('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public');
  await q('ALTER EXTENSION pg_trgm SET SCHEMA public');
  await q('CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_data_search_idx ON contacts USING GIN ((data::text) public.gin_trgm_ops)');
  await q('CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_phone_search_idx ON contacts USING GIN (phone public.gin_trgm_ops)');
  await q('CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_birth_month_day_dashboard_idx ON contacts((EXTRACT(MONTH FROM birth_date)),(EXTRACT(DAY FROM birth_date)))');
  await q('CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_anniversary_month_day_dashboard_idx ON contacts((EXTRACT(MONTH FROM anniversary_date)),(EXTRACT(DAY FROM anniversary_date)))');
  await q('CREATE INDEX CONCURRENTLY IF NOT EXISTS deliveries_contact_created_idx ON deliveries(contact_id, created_at DESC)');
  await q("CREATE INDEX CONCURRENTLY IF NOT EXISTS deliveries_contact_pending_idx ON deliveries(contact_id) WHERE status IN ('queued','sending')");
  await q("CREATE INDEX CONCURRENTLY IF NOT EXISTS campaigns_scheduled_send_idx ON campaigns(send_at) WHERE status='scheduled'");
  await q("CREATE INDEX CONCURRENTLY IF NOT EXISTS deliveries_failed_recent_idx ON deliveries(id DESC) WHERE status='failed'");
  await q("CREATE INDEX IF NOT EXISTS deliveries_sent_phone_idx ON deliveries(phone) WHERE status='sent'");
  await q('CREATE UNIQUE INDEX IF NOT EXISTS campaigns_auto_day_idx ON campaigns(occasion,channel,schedule_date) WHERE auto_generated=true AND schedule_date IS NOT NULL');
  await q("INSERT INTO provider_rate_slots(channel) VALUES('sms'),('voice') ON CONFLICT DO NOTHING");
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const exists = await q('SELECT id FROM admins WHERE email=$1', [email]);
    if (!exists.rowCount) {
      await q('INSERT INTO admins(email,password_hash) VALUES($1,$2)', [email, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)]);
    }
  }
  await q(`INSERT INTO app_settings(key,value) VALUES('schedule','{"timezone":"Asia/Kolkata","sendTime":"09:00","birthdayEnabled":false,"anniversaryEnabled":false,"birthdaySmsTemplateId":null,"anniversarySmsTemplateId":null,"birthdayVoiceTemplateId":null,"anniversaryVoiceTemplateId":null}') ON CONFLICT DO NOTHING`);
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
