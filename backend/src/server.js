import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, pool, setupDatabase, transaction } from './db.js';
import { transformRows } from './imports.js';
import { assertSafeEndpoint, buildReadyUrl, decryptSecret, encryptSecret, sendProvider, validateReadyUrl } from './providers.js';
import { createCampaign, manualSendAllowance, processDueDeliveries, scheduleTodaysWishes, stopDeliveryWorker } from './queue.js';
import { installUploadRoutes, recoverImports, stopImports } from './uploads.js';
import { clientError, errorResponse } from './api-errors.js';
import { createContactsCursor, readContactsCursor, validDatabaseId } from './pagination.js';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.CONFIG_ENCRYPTION_KEY || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error('Set DATABASE_URL, JWT_SECRET, CONFIG_ENCRYPTION_KEY, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env.');
}
if (process.env.JWT_SECRET.length < 32 || process.env.ADMIN_PASSWORD.length < 12 || !/^[0-9a-fA-F]{64}$/.test(process.env.CONFIG_ENCRYPTION_KEY)) {
  throw new Error('Use a 32+ character JWT secret, a 12+ character admin password, and a 64-character hex encryption key.');
}

const app = express();
app.disable('x-powered-by');
if (['1', '2'].includes(process.env.TRUST_PROXY)) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
let shuttingDown = false;
app.get('/api/health', async (_req, res) => {
  if (shuttingDown) return res.status(503).json({ ok: false });
  try { await pool.query({ text: 'SELECT 1', query_timeout: 3000 }); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const audit = (action, details = {}) => q('INSERT INTO audit_logs(action,details) VALUES($1,$2)', [action, details]);

function smsMessageFromUrl(url) {
  return ['sms', 'message', 'text', 'body'].map(key => url.searchParams.get(key)).find(Boolean) || '';
}

function mismatchedSmsName(message, contact) {
  const addressedName = message.match(/\bDear\s+([\p{L}]+)/iu)?.[1];
  const firstName = contact.display_name?.trim().split(/\s+/)[0];
  if (!addressedName || !firstName || /^(friend|customer|sir|madam|team)$/i.test(addressedName)) return '';
  return addressedName.toLocaleLowerCase() === firstName.toLocaleLowerCase() ? '' : addressedName;
}

function publicDeliveryResult(row) {
  if (!row) return null;
  const { provider_response, ...delivery } = row;
  let response;
  try { response = JSON.parse(provider_response || '{}'); } catch { response = {}; }
  const messageId = response?.message_id;
  return { ...delivery,
    provider_message_id: typeof messageId === 'string' && /^[\w-]{1,100}$/.test(messageId) ? messageId : null,
    provider_accepted: row.status === 'sent',
  };
}

function auth(req, res, next) {
  try {
    const token = req.cookies.wishyou_session;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Your session has expired.' }); }
}

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const admin = (await q('SELECT * FROM admins WHERE email=$1', [email])).rows[0];
  if (!admin || !await bcrypt.compare(String(req.body.password || ''), admin.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('wishyou_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ email: admin.email });
}));
app.post('/api/auth/logout', (_, res) => { res.clearCookie('wishyou_session'); res.json({ ok: true }); });
app.get('/api/auth/me', auth, (req, res) => res.json({ email: req.admin.email }));
app.use('/api', auth);
installUploadRoutes(app, asyncRoute, audit);

app.get('/api/dashboard', asyncRoute(async (_, res) => {
  const [greetingCount, campaigns, deliveries, dataset, recentFailures] = await Promise.all([
    q('SELECT count(*)::int AS total FROM wish_templates WHERE settings_slot=true AND ready_url_encrypted IS NOT NULL'),
    q('SELECT EXISTS(SELECT 1 FROM campaigns) AS present'),
    q("SELECT status, count(*)::int AS total FROM deliveries GROUP BY status"),
    q('SELECT id,name,row_count,created_at FROM datasets ORDER BY id DESC LIMIT 1'),
    q(`SELECT d.id,d.contact_name,d.phone,c.occasion,c.channel,d.created_at
      FROM deliveries d JOIN campaigns c ON c.id=d.campaign_id
      WHERE d.status='failed' ORDER BY d.id DESC LIMIT 5`),
  ]);
  const schedule = (await q("SELECT value FROM app_settings WHERE key='schedule'")).rows[0]?.value || {};
  const timezone = schedule.timezone || 'Asia/Kolkata';
  const birthdayToday = `(EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM (now() AT TIME ZONE $1)) AND EXTRACT(DAY FROM birth_date)=EXTRACT(DAY FROM (now() AT TIME ZONE $1)))`;
  const anniversaryToday = `(EXTRACT(MONTH FROM anniversary_date)=EXTRACT(MONTH FROM (now() AT TIME ZONE $1)) AND EXTRACT(DAY FROM anniversary_date)=EXTRACT(DAY FROM (now() AT TIME ZONE $1)))`;
  const [todayCount, today] = await Promise.all([
    q(`SELECT count(*)::int AS total FROM contacts WHERE ${birthdayToday} OR ${anniversaryToday}`, [timezone]),
    q(`SELECT id,display_name,phone,birth_date,anniversary_date,${birthdayToday} AS birthday_today,${anniversaryToday} AS anniversary_today
      FROM contacts WHERE ${birthdayToday} OR ${anniversaryToday} ORDER BY created_at DESC,id DESC LIMIT 3`, [timezone]),
  ]);
  res.json({ contacts: Number(dataset.rows[0]?.row_count || 0), greetingCount: greetingCount.rows[0].total,
    birthdayEnabled: Boolean(schedule.birthdayEnabled), anniversaryEnabled: Boolean(schedule.anniversaryEnabled),
    hasCampaigns: campaigns.rows[0].present, deliveries: Object.fromEntries(deliveries.rows.map(row => [row.status, row.total])),
    recentFailures: recentFailures.rows, dataset: dataset.rows[0] || null, todayCount: todayCount.rows[0].total, today: today.rows });
}));

app.get('/api/contacts', asyncRoute(async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(10, requestedLimit)) : 25;
  const search = String(req.query.search || '').trim().slice(0, 100);
  const before = String(req.query.before || '');
  const datasetId = String(req.query.datasetId || '');
  const includeTotal = req.query.includeTotal !== 'false';
  if (search && search.length < 3) return res.status(400).json({ error: 'Enter at least 3 characters to search contacts.' });
  if (datasetId && !validDatabaseId(datasetId)) return res.status(400).json({ error: 'Invalid dataset ID.' });
  const dataset = (await q('SELECT id,name,columns,row_count,created_at FROM datasets ORDER BY id DESC LIMIT 1')).rows[0] || null;
  if (datasetId && String(dataset?.id) !== datasetId) return res.status(409).json({ error: 'The contact dataset changed. Reloading the first page.' });
  if (!dataset) return res.json({ dataset: null, items: [], total: 0, limit, nextCursor: null });
  const beforeId = before ? readContactsCursor(before, { datasetId: dataset.id, search }) : null;
  const params = [dataset.id];
  const clauses = ['dataset_id=$1'];
  if (search) { params.push(`%${search}%`); clauses.push(`(data::text ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
  if (beforeId) { params.push(beforeId); clauses.push(`id < $${params.length}::bigint`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit + 1);
  const [items, count] = await Promise.all([
    q(`SELECT id,data,display_name,phone,birth_date,anniversary_date,active FROM contacts ${where} ORDER BY id DESC LIMIT $${params.length}`, params),
    !includeTotal ? Promise.resolve(null) : search
      ? q('SELECT count(*)::bigint AS total FROM contacts WHERE dataset_id=$1 AND (data::text ILIKE $2 OR phone ILIKE $2)', [dataset.id, `%${search}%`])
      : Promise.resolve({ rows: [{ total: dataset.row_count }] }),
  ]);
  const hasNext = items.rows.length > limit;
  const pageItems = items.rows.slice(0, limit);
  res.json({ dataset, items: pageItems, total: count ? Number(count.rows[0].total) : null, limit,
    nextCursor: hasNext ? createContactsCursor({ id: pageItems.at(-1).id, datasetId: dataset.id, search }) : null });
}));

app.patch('/api/contacts/:id', asyncRoute(async (req, res) => {
  const dataset = (await q('SELECT * FROM datasets ORDER BY id DESC LIMIT 1')).rows[0];
  if (!dataset) return res.status(404).json({ error: 'No dataset is active.' });
  const data = req.body.data;
  if (!data || typeof data !== 'object' || dataset.columns.some(header => !(header in data))) return res.status(400).json({ error: 'Include every active column.' });
  const transformed = transformRows({ headers: dataset.columns, rows: [dataset.columns.map(header => data[header])] }, dataset.mapping);
  if (transformed.invalid.length) return res.status(400).json({ error: transformed.invalid[0].reasons.join(', ') });
  const record = transformed.valid[0];
  const result = await q('UPDATE contacts SET data=$1,display_name=$2,phone=$3,birth_date=$4,anniversary_date=$5,active=$6 WHERE id=$7 RETURNING *', [record.data, record.name, record.phone, record.birth, record.anniversary, req.body.active !== false, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Contact not found.' });
  await audit('contact.updated', { id: req.params.id });
  res.json(result.rows[0]);
}));

app.delete('/api/contacts/:id', asyncRoute(async (req, res) => {
  const id = req.params.id;
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ error: 'Invalid contact ID.' });
  const result = await transaction(async client => {
    const contact = (await client.query('SELECT id,dataset_id FROM contacts WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!contact) return null;
    const deliveries = await client.query('SELECT status FROM deliveries WHERE contact_id=$1 FOR UPDATE', [id]);
    if (deliveries.rows.some(row => row.status === 'sending')) return { sending: true };
    await client.query('DELETE FROM deliveries WHERE contact_id=$1', [id]);
    await client.query('DELETE FROM contacts WHERE id=$1', [id]);
    await client.query('UPDATE datasets SET row_count=GREATEST(row_count-1,0) WHERE id=$1', [contact.dataset_id]);
    return { datasetId: contact.dataset_id };
  });
  if (!result) return res.status(404).json({ error: 'Contact not found.' });
  if (result.sending) return res.status(409).json({ error: 'A wish is being sent to this contact. Try deleting them after it finishes.' });
  await audit('contact.deleted', { id, datasetId: result.datasetId });
  res.json({ ok: true });
}));

app.get('/api/contacts/:id/greeting-review', asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { occasion, channel } = req.query;
  if (!/^[1-9]\d*$/.test(id) || !['birthday', 'anniversary'].includes(occasion) || !['sms', 'voice'].includes(channel)) {
    return res.status(400).json({ error: 'Choose a valid contact, occasion, and channel.' });
  }
  const contact = (await q("SELECT id,display_name,phone,to_char(birth_date,'YYYY-MM-DD') AS birth_date,to_char(anniversary_date,'YYYY-MM-DD') AS anniversary_date,active FROM contacts WHERE id=$1", [id])).rows[0];
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  const [slot, attempts, pending, manualLimit] = await Promise.all([
    q('SELECT content,ready_url_encrypted FROM wish_templates WHERE settings_slot=true AND active=true AND occasion=$1 AND channel=$2', [occasion, channel]),
    q(`SELECT d.status,d.created_at,d.sent_at,d.attempts,d.provider_response FROM deliveries d JOIN campaigns c ON c.id=d.campaign_id
      WHERE d.contact_id=$1 AND c.occasion=$2 AND c.channel=$3 ORDER BY d.created_at DESC LIMIT 1`, [id, occasion, channel]),
    q(`SELECT 1 FROM deliveries d JOIN campaigns c ON c.id=d.campaign_id
      WHERE d.contact_id=$1 AND c.occasion=$2 AND c.channel=$3 AND d.status IN ('queued','sending') LIMIT 1`, [id, occasion, channel]),
    manualSendAllowance(contact.phone),
  ]);
  const greeting = slot.rows[0];
  const providerUrl = greeting?.ready_url_encrypted ? buildReadyUrl(decryptSecret(greeting.ready_url_encrypted), contact) : null;
  const providerHost = providerUrl?.host || null;
  const urlMessage = channel === 'sms' && providerUrl ? smsMessageFromUrl(providerUrl) : '';
  res.json({ contact, configured: Boolean(providerHost), previewText: urlMessage || greeting?.content || '', providerHost,
    providerTemplateId: providerUrl?.searchParams.get('templateid') || null,
    mismatchedName: urlMessage ? mismatchedSmsName(urlMessage, contact) : '',
    lastAttempt: publicDeliveryResult(attempts.rows[0]), pending: Boolean(pending.rowCount), manualLimit });
}));

app.post('/api/contacts/:id/send-greeting', asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { occasion, channel } = req.body;
  if (!/^[1-9]\d*$/.test(id) || !['birthday', 'anniversary'].includes(occasion) || !['sms', 'voice'].includes(channel)) {
    return res.status(400).json({ error: 'Choose a valid contact, occasion, and channel.' });
  }
  const contact = (await q('SELECT id,display_name,phone,birth_date,anniversary_date,active FROM contacts WHERE id=$1', [id])).rows[0];
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  if (!contact.active) return res.status(400).json({ error: 'Activate this contact before sending a greeting.' });
  if (!(occasion === 'birthday' ? contact.birth_date : contact.anniversary_date)) {
    return res.status(400).json({ error: `This contact has no ${occasion} date.` });
  }
  const slot = (await q('SELECT id,ready_url_encrypted FROM wish_templates WHERE settings_slot=true AND active=true AND ready_url_encrypted IS NOT NULL AND occasion=$1 AND channel=$2', [occasion, channel])).rows[0];
  if (!slot) return res.status(400).json({ error: `Add the ${occasion} ${channel.toUpperCase()} URL in Settings first.` });
  if (channel === 'sms') {
    const message = smsMessageFromUrl(buildReadyUrl(decryptSecret(slot.ready_url_encrypted), contact));
    const wrongName = mismatchedSmsName(message, contact);
    if (wrongName) return res.status(400).json({ error: `The saved SMS says “Dear ${wrongName}” for ${contact.display_name}. Use {name} in the SMS URL in Settings.` });
  }
  const pending = await q(`SELECT 1 FROM deliveries d JOIN campaigns c ON c.id=d.campaign_id
    WHERE d.contact_id=$1 AND c.occasion=$2 AND c.channel=$3 AND d.status IN ('queued','sending') LIMIT 1`, [id, occasion, channel]);
  if (pending.rowCount) return res.status(409).json({ error: 'A greeting for this contact is already queued or sending.' });
  const campaign = await createCampaign({
    occasion, channel, templateId: slot.id, contactIds: [id], sendAt: new Date().toISOString(),
    name: `${occasion} ${channel} for ${contact.display_name || contact.phone}`, forceResend: true, manualContactSend: true,
  });
  await audit('contact.greeting_requested', { contactId: id, campaignId: campaign.id, occasion, channel });
  processDueDeliveries().catch(error => console.error('Delivery worker:', error.message));
  res.json({ campaignId: campaign.id, recipientCount: campaign.recipientCount });
}));

app.post('/api/contacts/clear', asyncRoute(async (req, res) => {
  if (req.body.confirm !== 'CLEAR') return res.status(400).json({ error: 'Type CLEAR to confirm.' });
  const importing = await q("SELECT 1 FROM import_jobs WHERE status IN ('queued','processing','waiting_for_sends') LIMIT 1");
  if (importing.rowCount) return res.status(409).json({ error: 'An import is in progress. Wait for it to finish before clearing contacts.' });
  const active = await q("SELECT 1 FROM campaigns WHERE status='scheduled' AND send_at<=now() LIMIT 1");
  if (active.rowCount) return res.status(409).json({ error: 'A campaign is sending. Wait for it to finish.' });
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(7286, 1)');
    const pendingImport = await client.query("SELECT 1 FROM import_jobs WHERE status IN ('queued','processing','waiting_for_sends') LIMIT 1");
    if (pendingImport.rowCount) {
      const error = new Error('An import is in progress. Wait for it to finish before clearing contacts.');
      error.status = 409;
      throw error;
    }
    await client.query('DELETE FROM deliveries');
    await client.query('DELETE FROM campaigns');
    await client.query('DELETE FROM datasets');
  });
  await audit('dataset.cleared');
  res.json({ ok: true });
}));

app.get('/api/templates', asyncRoute(async (_, res) => res.json((await q('SELECT id,name,occasion,channel,content,provider_config,active,created_at,settings_slot FROM wish_templates ORDER BY created_at DESC')).rows)));
app.post('/api/templates', asyncRoute(async (req, res) => {
  const { name, occasion, channel, content, providerConfig = {} } = req.body;
  if (!name || !content || !['birthday','anniversary'].includes(occasion) || !['sms','voice'].includes(channel)) return res.status(400).json({ error: 'Complete all template fields.' });
  if (channel === 'voice') assertSafeEndpoint(content);
  const result = await q('INSERT INTO wish_templates(name,occasion,channel,content,provider_config) VALUES($1,$2,$3,$4,$5) RETURNING *', [String(name).trim(), occasion, channel, String(content).trim(), JSON.stringify(providerConfig)]);
  await audit('template.created', { id: result.rows[0].id });
  res.json(result.rows[0]);
}));
app.patch('/api/templates/:id', asyncRoute(async (req, res) => {
  const old = (await q('SELECT * FROM wish_templates WHERE id=$1', [req.params.id])).rows[0];
  if (!old) return res.status(404).json({ error: 'Template not found.' });
  const next = { ...old, ...req.body };
  if (!next.name || !next.content || !['birthday','anniversary'].includes(next.occasion) || !['sms','voice'].includes(next.channel)) return res.status(400).json({ error: 'Complete all template fields.' });
  if (next.channel === 'voice') assertSafeEndpoint(next.content);
  const result = await q('UPDATE wish_templates SET name=$1,occasion=$2,channel=$3,content=$4,active=$5,provider_config=$6 WHERE id=$7 RETURNING *', [next.name, next.occasion, next.channel, next.content, next.active, JSON.stringify(req.body.providerConfig ?? old.provider_config ?? {}), req.params.id]);
  await audit('template.updated', { id: req.params.id });
  res.json(result.rows[0]);
}));

const greetingSlots = [
  ['birthday', 'sms', 'Birthday SMS'], ['birthday', 'voice', 'Birthday Voice Call'],
  ['anniversary', 'sms', 'Anniversary SMS'], ['anniversary', 'voice', 'Anniversary Voice Call'],
];
app.get('/api/greeting-urls', asyncRoute(async (_, res) => {
  const rows = (await q('SELECT occasion,channel,content,ready_url_encrypted FROM wish_templates WHERE settings_slot=true')).rows;
  res.json(greetingSlots.map(([occasion, channel]) => {
    const row = rows.find(item => item.occasion === occasion && item.channel === channel);
    return { occasion, channel, url: decryptSecret(row?.ready_url_encrypted), previewText: row?.content || '' };
  }));
}));
app.put('/api/greeting-urls', asyncRoute(async (req, res) => {
  const entries = req.body.entries;
  if (!Array.isArray(entries) || entries.length !== greetingSlots.length) return res.status(400).json({ error: 'Provide all four greeting URL cards.' });
  const cleaned = greetingSlots.map(([occasion, channel, label]) => {
    const matches = entries.filter(item => item.occasion === occasion && item.channel === channel);
    if (matches.length !== 1) throw clientError(`Provide one ${label} card.`);
    const url = String(matches[0].url || '').trim();
    const previewText = String(matches[0].previewText || '').trim();
    if (url.length > 8000 || previewText.length > 2000) throw clientError(`${label} is too long.`);
    if (url) validateReadyUrl(url);
    return { occasion, channel, label, url, previewText };
  });
  await transaction(async client => {
    const schedule = (await client.query("SELECT value FROM app_settings WHERE key='schedule' FOR UPDATE")).rows[0]?.value || {};
    for (const entry of cleaned) {
      const encrypted = encryptSecret(entry.url);
      const existing = (await client.query('SELECT id FROM wish_templates WHERE occasion=$1 AND channel=$2 AND settings_slot=true FOR UPDATE', [entry.occasion, entry.channel])).rows[0];
      let templateId = existing?.id || null;
      if (existing) {
        await client.query('UPDATE wish_templates SET content=$1,active=$2,ready_url_encrypted=$3 WHERE id=$4', [entry.previewText, Boolean(entry.url), encrypted, existing.id]);
      } else if (entry.url) {
        const inserted = await client.query('INSERT INTO wish_templates(name,occasion,channel,content,active,ready_url_encrypted,settings_slot) VALUES($1,$2,$3,$4,true,$5,true) RETURNING id', [entry.label, entry.occasion, entry.channel, entry.previewText, encrypted]);
        templateId = inserted.rows[0].id;
      }
      schedule[`${entry.occasion}${entry.channel === 'sms' ? 'Sms' : 'Voice'}TemplateId`] = entry.url ? templateId : null;
    }
    await client.query("UPDATE app_settings SET value=$1 WHERE key='schedule'", [JSON.stringify(schedule)]);
  });
  await audit('greeting_urls.updated');
  res.json({ ok: true });
}));

app.get('/api/providers', asyncRoute(async (_, res) => res.json((await q('SELECT channel,endpoint,method,public_config,secret_encrypted IS NOT NULL AS has_secret,updated_at FROM provider_configs')).rows)));
app.put('/api/providers/:channel', asyncRoute(async (req, res) => {
  const channel = req.params.channel;
  if (!['sms','voice'].includes(channel)) return res.status(400).json({ error: 'Invalid channel.' });
  const providerUrl = assertSafeEndpoint(String(req.body.endpoint || ''));
  if (['key','token','number','sms'].some(key => providerUrl.searchParams.has(key))) return res.status(400).json({ error: 'Save the base API URL here. Put the API key in its separate field.' });
  const endpoint = providerUrl.toString();
  const method = req.body.method === 'POST' ? 'POST' : 'GET';
  const publicConfig = req.body.publicConfig || {};
  const old = (await q('SELECT secret_encrypted FROM provider_configs WHERE channel=$1', [channel])).rows[0];
  const encrypted = req.body.secret ? encryptSecret(req.body.secret) : old?.secret_encrypted || null;
  await q(`INSERT INTO provider_configs(channel,endpoint,method,public_config,secret_encrypted) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(channel) DO UPDATE SET endpoint=EXCLUDED.endpoint,method=EXCLUDED.method,public_config=EXCLUDED.public_config,secret_encrypted=EXCLUDED.secret_encrypted,updated_at=now()`, [channel, endpoint, method, JSON.stringify(publicConfig), encrypted]);
  await audit('provider.updated', { channel });
  res.json({ channel, endpoint, method, public_config: publicConfig, has_secret: Boolean(encrypted) });
}));
app.post('/api/providers/:channel/test', asyncRoute(async (req, res) => {
  const channel = req.params.channel;
  if (!['sms','voice'].includes(channel) || !/^\d{10,15}$/.test(String(req.body.phone || ''))) return res.status(400).json({ error: 'Enter a valid test phone number.' });
  const content = String(req.body.content || '');
  if (!content) return res.status(400).json({ error: 'Enter test content or hosted audio URL.' });
  if (channel === 'voice') assertSafeEndpoint(content);
  const response = await sendProvider(channel, { phone: req.body.phone, display_name: 'Friend' }, content);
  await audit('provider.test_sent', { channel });
  res.json({ response });
}));

app.get('/api/settings', asyncRoute(async (_, res) => res.json((await q("SELECT value FROM app_settings WHERE key='schedule'")).rows[0]?.value || {})));
app.put('/api/settings', asyncRoute(async (req, res) => {
  const value = req.body;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.sendTime || '')) return res.status(400).json({ error: 'Choose a valid send time.' });
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.timezone }); } catch { return res.status(400).json({ error: 'Choose a valid timezone.' }); }
  const current = (await q("SELECT value FROM app_settings WHERE key='schedule'")).rows[0]?.value || {};
  const updated = { ...current, timezone: value.timezone, sendTime: value.sendTime,
    birthdayEnabled: Boolean(value.birthdayEnabled), anniversaryEnabled: Boolean(value.anniversaryEnabled) };
  await q("UPDATE app_settings SET value=$1 WHERE key='schedule'", [JSON.stringify(updated)]);
  await audit('settings.updated');
  res.json(updated);
}));

app.use((error, _req, res, _next) => {
  const response = errorResponse(error);
  if (response.status >= 500) console.error(error);
  res.status(response.status).json({ error: response.error });
});

await setupDatabase();
await recoverImports();
async function markStaleDeliveries() {
  await q(`UPDATE deliveries SET status='failed', sending_started_at=NULL,
    error='Worker stopped during provider request; delivery result is unknown. Review before retrying.'
    WHERE status='sending' AND sending_started_at < now() - interval '5 minutes'`);
}
await markStaleDeliveries();
const server = app.listen(Number(process.env.PORT || 4000), () => console.log(`WishYou API listening on port ${process.env.PORT || 4000}`));
const timers = [
  setInterval(() => processDueDeliveries().catch(error => console.error('Delivery worker:', error.message)), 1000),
  setInterval(() => scheduleTodaysWishes().catch(error => console.error('Scheduler:', error.message)), 5000),
  setInterval(() => markStaleDeliveries().catch(error => console.error('Stale delivery recovery:', error.message)), 60000),
];
scheduleTodaysWishes().catch(error => console.error('Scheduler:', error.message));
processDueDeliveries().catch(error => console.error('Delivery worker:', error.message));

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const timer of timers) clearInterval(timer);
  const listenerStopped = new Promise(resolve => server.close(resolve));
  try {
    const drained = await stopDeliveryWorker();
    if (!drained) console.error('Delivery worker did not drain; in-flight results will require review.');
    await stopImports();
    await listenerStopped;
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
