import crypto from 'node:crypto';
import { q } from './db.js';
import { clientError } from './api-errors.js';

function encryptionKey() {
  const hex = process.env.CONFIG_ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(hex ?? '')) throw new Error('CONFIG_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(secret) {
  if (!secret) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(buffer => buffer.toString('base64url')).join('.');
}

export function decryptSecret(value) {
  if (!value) return '';
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString();
}

export function renderMessage(template, contact) {
  return String(template).replace(/\{(name|phone)\}|\[alp\]/gi, token => token.toLowerCase() === '{phone}' ? contact.phone : (contact.display_name || 'Friend'));
}

function assertSafeEndpoint(value) {
  let url;
  try { url = new URL(value); }
  catch { throw clientError('Enter a valid provider URL.'); }
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw clientError('Provider URL must use HTTPS.');
  }
  if (url.username || url.password) throw clientError('Provider URL cannot contain a username or password.');
  return url;
}

export function buildReadyUrl(value, contact) {
  const name = contact.display_name || 'Friend';
  const expanded = String(value).replace(/\{phone\}/gi, encodeURIComponent(contact.phone)).replace(/\{name\}|\[alp\]/gi, encodeURIComponent(name));
  const url = assertSafeEndpoint(expanded);
  for (const [key, original] of url.searchParams) {
    const resolved = original.replace(/\{phone\}/gi, contact.phone).replace(/\{name\}|\[alp\]/gi, name);
    if (/^(phone|number|mobile|to|recipient|contact)$/i.test(key)) url.searchParams.set(key, contact.phone);
    else if (resolved !== original) url.searchParams.set(key, resolved);
  }
  return url;
}

export function validateReadyUrl(value) {
  const url = assertSafeEndpoint(String(value).replace(/\{phone\}/gi, '910000000000').replace(/\{name\}|\[alp\]/gi, 'Friend'));
  const hasPhone = /\{phone\}/i.test(value) || [...url.searchParams.keys()].some(key => /^(phone|number|mobile|to|recipient|contact)$/i.test(key));
  if (!hasPhone) throw clientError('Add {phone} or a phone/number query parameter to the provider URL.');
}

export function buildProviderRequest(channel, config, contact, content, secret, templateConfig = {}) {
  const url = assertSafeEndpoint(templateConfig.endpoint || config.endpoint);
  const publicConfig = config.public_config || {};
  const method = config.method === 'POST' ? 'POST' : 'GET';
  const fields = channel === 'sms'
    ? { key: secret, route: templateConfig.route || publicConfig.route || '', sender: templateConfig.sender || publicConfig.sender || '', number: contact.phone, sms: renderMessage(content, contact), templateid: templateConfig.templateId || publicConfig.templateId || '' }
    : { [publicConfig.phoneParam || 'number']: contact.phone, [publicConfig.audioParam || 'audio_url']: content };
  if (channel === 'voice' && secret) fields[publicConfig.keyParam || 'key'] = secret;
  if (channel === 'sms' && (!fields.route || !fields.sender || !fields.templateid)) {
    throw clientError('SMS route, sender ID, and provider template ID are required.');
  }
  if (method === 'GET') {
    for (const [key, value] of Object.entries(fields)) if (value !== '') url.searchParams.set(key, value);
    return { url, init: { signal: AbortSignal.timeout(15000) } };
  }
  return { url, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields), signal: AbortSignal.timeout(15000) } };
}

export function assertProviderAccepted(responseText) {
  let body;
  try { body = JSON.parse(responseText); } catch { body = null; }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const state = String(body.status ?? body.result ?? '').toLowerCase();
    const explicitError = typeof body.error === 'string' && !['', '0', 'none', 'null', 'no error'].includes(body.error.trim().toLowerCase());
    if (body.success === false || body.status === false || /^(fail(?:ed|ure)?|error|reject(?:ed)?|invalid|unauthorized)$/.test(state) ||
      explicitError) {
      throw new Error(`Provider rejected the request: ${String(explicitError ? body.error : body.message || state).slice(0, 200)}`);
    }
  } else if (/^\s*(?:error|failed|rejected)\b/i.test(responseText)) {
    throw new Error(`Provider rejected the request: ${responseText.slice(0, 200)}`);
  }
}

export async function sendProvider(channel, contact, content, templateConfig = {}) {
  if (templateConfig.readyUrlEncrypted) {
    const url = buildReadyUrl(decryptSecret(templateConfig.readyUrlEncrypted), contact);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const responseText = (await response.text()).slice(0, 1000);
    if (!response.ok) {
      const error = new Error(`Provider returned HTTP ${response.status}: ${responseText}`);
      error.retryable = response.status === 429;
      throw error;
    }
    assertProviderAccepted(responseText);
    return responseText;
  }
  const result = await q('SELECT * FROM provider_configs WHERE channel=$1', [channel]);
  const config = result.rows[0];
  if (!config) throw new Error(`${channel.toUpperCase()} provider is not configured.`);
  const secret = decryptSecret(config.secret_encrypted);
  if (channel === 'sms' && !secret) throw new Error('SMS API key is not configured.');
  const { url, init } = buildProviderRequest(channel, config, contact, content, secret, templateConfig);
  const response = await fetch(url, init);
  const responseText = (await response.text()).slice(0, 1000);
  if (!response.ok) {
    const error = new Error(`Provider returned HTTP ${response.status}: ${responseText}`);
    error.retryable = response.status === 429;
    throw error;
  }
  assertProviderAccepted(responseText);
  return responseText;
}

export { assertSafeEndpoint };
