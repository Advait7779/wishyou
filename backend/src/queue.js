import { q, transaction } from './db.js';
import { sendProvider } from './providers.js';
import { automaticScheduleSlot } from './schedule.js';
import { clientError } from './api-errors.js';

let processing = false;
let scheduling = false;
let stopping = false;
const workerState = {
  delivery: { lastSuccess: Date.now(), activeSince: null, failures: 0 },
  scheduler: { lastSuccess: Date.now(), activeSince: null, failures: 0 },
};
const DELIVERY_BATCH_SIZE = 20;
const DELIVERY_CONCURRENCY = 5;

export function queueWorkerHealth({ importActive = false } = {}) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(workerState).map(([name, state]) => [name,
    state.failures < 3 && (state.activeSince === null
      ? now - state.lastSuccess < 2 * 60 * 1000
      : importActive || now - state.activeSince < 10 * 60 * 1000)]));
}

function rateFor(channel) {
  const configured = Number(process.env[channel === 'sms' ? 'SMS_RATE_PER_SECOND' : 'VOICE_RATE_PER_SECOND']);
  return Number.isFinite(configured) && configured > 0 ? Math.max(0.1, Math.min(configured, 100)) : channel === 'sms' ? 5 : 1;
}

async function reserveProviderSlot(channel) {
  const result = await q(`UPDATE provider_rate_slots
    SET next_at=GREATEST(next_at,now()) + (interval '1 second' / $2::double precision)
    WHERE channel=$1
    RETURNING next_at - (interval '1 second' / $2::double precision) AS slot_at`, [channel, rateFor(channel)]);
  if (!result.rowCount) throw new Error(`No rate slot configured for ${channel}.`);
  const delay = new Date(result.rows[0].slot_at).getTime() - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
}

async function sendClaimed(job) {
  try {
    await reserveProviderSlot(job.channel);
    const result = await sendProvider(job.channel, job, job.content_snapshot, job.provider_snapshot);
    await q("UPDATE deliveries SET status='sent', sent_at=now(), provider_response=$2, error=NULL, sending_started_at=NULL WHERE id=$1 AND status='sending'", [job.id, result]);
  } catch (error) {
    const retry = error.retryable === true && job.attempts < 3;
    await q("UPDATE deliveries SET status=$2, error=$3, next_attempt_at=$4, sending_started_at=NULL WHERE id=$1 AND status='sending'", [job.id, retry ? 'queued' : 'failed', String(error.message).slice(0, 1000), retry ? new Date(Date.now() + job.attempts * 60000) : null]);
  }
}

export async function processDueDeliveries() {
  if (processing || stopping) return;
  processing = true;
  workerState.delivery.activeSince = Date.now();
  try {
    const jobs = await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(7286, 1)');
      return client.query(`WITH claim AS (
        SELECT d.id FROM deliveries d JOIN campaigns c ON c.id=d.campaign_id
        WHERE d.status='queued' AND c.send_at<=now()
          AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=now())
        ORDER BY d.id LIMIT $1 FOR UPDATE OF d SKIP LOCKED
      ), updated AS (
        UPDATE deliveries d SET status='sending', attempts=d.attempts+1, sending_started_at=now()
        FROM claim WHERE d.id=claim.id
        RETURNING d.id, d.phone, d.contact_name AS display_name, d.attempts, d.campaign_id
      ) SELECT u.*, c.channel, c.content_snapshot, c.provider_snapshot
        FROM updated u JOIN campaigns c ON c.id=u.campaign_id`, [DELIVERY_BATCH_SIZE]);
    });
    for (let start = 0; start < jobs.rows.length; start += DELIVERY_CONCURRENCY) {
      await Promise.all(jobs.rows.slice(start, start + DELIVERY_CONCURRENCY).map(sendClaimed));
    }
    await q(`UPDATE campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.campaign_id=c.id AND d.status='failed') THEN 'completed_with_errors' ELSE 'completed' END
      WHERE c.status='scheduled' AND c.send_at<=now() AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.campaign_id=c.id AND d.status IN ('queued','sending'))`);
    workerState.delivery.lastSuccess = Date.now();
    workerState.delivery.failures = 0;
  } catch (error) {
    workerState.delivery.failures += 1;
    throw error;
  } finally { processing = false; workerState.delivery.activeSince = null; }
}

export async function stopDeliveryWorker() {
  stopping = true;
  const deadline = Date.now() + 75000;
  while ((processing || scheduling) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  return !processing && !scheduling;
}

const MANUAL_SEND_LIMIT = 2;

export async function manualSendAllowance(phone, query = q) {
  const recent = (await query(`SELECT requested_at FROM manual_contact_sends
    WHERE phone=$1 AND requested_at > now() - interval '24 hours' ORDER BY requested_at`, [phone])).rows;
  const remaining = Math.max(0, MANUAL_SEND_LIMIT - recent.length);
  const retryAt = remaining ? null : new Date(new Date(recent[recent.length - MANUAL_SEND_LIMIT].requested_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { limit: MANUAL_SEND_LIMIT, remaining, retryAt };
}

export async function createCampaign({ occasion, channel, templateId, sendAt, name, contactIds, scope = 'all', autoGenerated = false, scheduleDate = null, forceResend = false, manualContactSend = false }) {
  if (!['birthday', 'anniversary'].includes(occasion) || !['sms', 'voice'].includes(channel)) throw clientError('Invalid occasion or channel.');
  const templateResult = await q('SELECT * FROM wish_templates WHERE id=$1 AND active=true AND occasion=$2 AND channel=$3', [templateId, occasion, channel]);
  const template = templateResult.rows[0];
  if (!template) throw clientError('Select an active matching wish template.');
  if (!template.ready_url_encrypted) {
    const provider = (await q('SELECT secret_encrypted FROM provider_configs WHERE channel=$1', [channel])).rows[0];
    if (!provider) throw clientError(`Add a ready-made ${occasion} ${channel.toUpperCase()} URL in Settings before sending.`);
    if (channel === 'sms' && !provider.secret_encrypted) throw clientError('Add the SMS API key in Settings before sending.');
  }
  const when = new Date(sendAt);
  if (Number.isNaN(when.getTime())) throw clientError('Choose a valid send time.');
  if (autoGenerated && !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate || '')) throw clientError('Automatic sends require a schedule date.');
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(7286, 1)');
    const params = [];
    let where = 'WHERE active=true';
    if (Array.isArray(contactIds)) {
      if (!contactIds.length) throw clientError('Select at least one contact.');
      params.push(contactIds);
      where += ` AND id = ANY($${params.length}::bigint[])`;
    }
    where += occasion === 'birthday' ? ' AND birth_date IS NOT NULL' : ' AND anniversary_date IS NOT NULL';
    if (scope === 'today') {
      const dateColumn = occasion === 'birthday' ? 'birth_date' : 'anniversary_date';
      const settings = (await client.query("SELECT value FROM app_settings WHERE key='schedule'")).rows[0]?.value || {};
      params.push(settings.timezone || 'Asia/Kolkata');
      where += ` AND EXTRACT(MONTH FROM ${dateColumn})=EXTRACT(MONTH FROM (now() AT TIME ZONE $${params.length})) AND EXTRACT(DAY FROM ${dateColumn})=EXTRACT(DAY FROM (now() AT TIME ZONE $${params.length}))`;
    }
    if (manualContactSend && (!Array.isArray(contactIds) || contactIds.length !== 1)) throw clientError('Manual contact sends require exactly one contact.');
    const matching = await client.query(`SELECT COUNT(*)::int AS count FROM contacts ${where}`, params);
    if (!matching.rows[0].count) throw clientError('No eligible contacts were found.');
    const providerSnapshot = template.ready_url_encrypted ? { readyUrlEncrypted: template.ready_url_encrypted } : template.provider_config || {};
    if (manualContactSend) {
      const contact = (await client.query(`SELECT phone FROM contacts ${where} LIMIT 1`, params)).rows[0];
      const phone = contact.phone;
      await client.query('SELECT pg_advisory_xact_lock(7285, hashtext($1))', [phone]);
      const allowance = await manualSendAllowance(phone, client.query.bind(client));
      if (!allowance.remaining) {
        const error = new Error(`Manual send limit reached for this number. You can send again after ${new Date(allowance.retryAt).toUTCString()}.`);
        error.status = 429;
        throw error;
      }
      await client.query('INSERT INTO manual_contact_sends(phone) VALUES($1)', [phone]);
    }
    const campaign = await client.query('INSERT INTO campaigns(name,occasion,channel,template_id,content_snapshot,provider_snapshot,send_at,auto_generated,schedule_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [name || `${occasion} wishes`, occasion, channel, template.id, template.content, providerSnapshot, when, autoGenerated, scheduleDate]);
    const addedResult = await client.query(`WITH candidates AS (
      SELECT DISTINCT ON (phone) id, display_name, phone FROM contacts ${where} ORDER BY phone,id
    ), inserted AS (
      INSERT INTO deliveries(campaign_id,contact_id,contact_name,phone)
      SELECT $${params.length + 1}, candidate.id, candidate.display_name, candidate.phone
      FROM candidates candidate
      WHERE $${params.length + 2}::boolean OR NOT EXISTS (
        SELECT 1 FROM deliveries previous JOIN campaigns sent_campaign ON sent_campaign.id=previous.campaign_id
        WHERE previous.phone=candidate.phone AND previous.status='sent'
          AND sent_campaign.occasion=$${params.length + 3} AND sent_campaign.channel=$${params.length + 4}
          AND sent_campaign.send_at >= date_trunc('year',$${params.length + 5}::timestamptz)
          AND sent_campaign.send_at < date_trunc('year',$${params.length + 5}::timestamptz) + interval '1 year'
      ) RETURNING id
    ) SELECT COUNT(*)::int AS count FROM inserted`, [...params, campaign.rows[0].id, forceResend, occasion, channel, when]);
    const added = addedResult.rows[0].count, skipped = matching.rows[0].count - added;
    if (!added) {
      if (!autoGenerated) throw clientError('All selected contacts already received this wish this year.');
      await client.query("UPDATE campaigns SET status='completed' WHERE id=$1", [campaign.rows[0].id]);
    }
    return { ...campaign.rows[0], status: added ? campaign.rows[0].status : 'completed', recipientCount: added, skippedDuplicates: skipped };
  });
}

export async function scheduleTodaysWishes() {
  if (scheduling || stopping) return;
  scheduling = true;
  workerState.scheduler.activeSince = Date.now();
  try {
    const settings = (await q("SELECT value FROM app_settings WHERE key='schedule'")).rows[0]?.value || {};
    const timezone = settings.timezone || 'Asia/Kolkata';
    const slot = automaticScheduleSlot(new Date(), timezone, settings.sendTime || '09:00');
    if (!slot) {
      workerState.scheduler.lastSuccess = Date.now();
      workerState.scheduler.failures = 0;
      return;
    }
    const { year, month, day, sendAt } = slot;
    let queued = false;
    let lastError = null;
    for (const occasion of ['birthday', 'anniversary']) {
      if (!settings[`${occasion}Enabled`]) continue;
      const dateColumn = occasion === 'birthday' ? 'birth_date' : 'anniversary_date';
      const hasContacts = await q(`SELECT 1 FROM contacts WHERE active=true AND EXTRACT(MONTH FROM ${dateColumn})=$1 AND EXTRACT(DAY FROM ${dateColumn})=$2 LIMIT 1`, [Number(month), Number(day)]);
      if (!hasContacts.rowCount) continue;
      for (const channel of ['sms', 'voice']) {
        const templateId = settings[`${occasion}${channel === 'sms' ? 'Sms' : 'Voice'}TemplateId`];
        if (!templateId) continue;
        const exists = await q(`SELECT 1 FROM campaigns WHERE auto_generated=true AND occasion=$1 AND channel=$2
          AND (schedule_date=$3::date OR (schedule_date IS NULL AND (send_at AT TIME ZONE $4)::date=$3::date)) LIMIT 1`,
          [occasion, channel, `${year}-${month}-${day}`, timezone]);
        if (exists.rowCount) continue;
        try {
          const campaign = await createCampaign({ occasion, channel, templateId, sendAt, name: `${occasion} ${channel} • ${year}-${month}-${day}`, scope: 'today', autoGenerated: true, scheduleDate: `${year}-${month}-${day}` });
          queued ||= campaign.recipientCount > 0;
        } catch (error) { console.error('Automatic campaign error:', error.message); lastError = error; }
      }
    }
    if (queued) processDueDeliveries().catch(error => console.error('Delivery worker:', error.message));
    if (lastError) throw lastError;
    workerState.scheduler.lastSuccess = Date.now();
    workerState.scheduler.failures = 0;
  } catch (error) {
    workerState.scheduler.failures += 1;
    throw error;
  } finally {
    scheduling = false;
    workerState.scheduler.activeSince = null;
  }
}
