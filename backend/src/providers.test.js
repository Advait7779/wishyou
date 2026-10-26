import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderRequest, buildReadyUrl, decryptSecret, encryptSecret, validateReadyUrl } from './providers.js';

test('SMS adapter replaces sample values and encodes message text', () => {
  const { url } = buildProviderRequest('sms', { endpoint: 'https://example.test/api/smsapi', method: 'GET', public_config: { route: '31', sender: 'ADAVAT', templateId: 'default' } }, { phone: '910000000000', display_name: 'Asha' }, 'Happy birthday, {name}!', 'test-key', { templateId: 'birthday-id' });
  assert.equal(url.searchParams.get('number'), '910000000000');
  assert.equal(url.searchParams.get('sms'), 'Happy birthday, Asha!');
  assert.equal(url.searchParams.get('templateid'), 'birthday-id');
  assert.equal(url.searchParams.get('key'), 'test-key');
});

test('provider secret is encrypted at rest', () => {
  process.env.CONFIG_ENCRYPTION_KEY = '0'.repeat(64);
  const encrypted = encryptSecret('test-key');
  assert.ok(!encrypted.includes('test-key'));
  assert.equal(decryptSecret(encrypted), 'test-key');
});

test('ready-made SMS URL replaces sample recipient and name placeholders', () => {
  const raw = 'https://example.test/send?key=secret&number=9000000000&sms=Happy+Birthday%2C+%7Bname%7D%21';
  validateReadyUrl(raw);
  const url = buildReadyUrl(raw, { phone: '9876543210', display_name: 'Asha' });
  assert.equal(url.searchParams.get('number'), '9876543210');
  assert.equal(url.searchParams.get('sms'), 'Happy Birthday, Asha!');
  assert.equal(url.searchParams.get('key'), 'secret');
});

test('ready-made voice URL accepts phone placeholder and alp name token', () => {
  const raw = 'https://example.test/call?phone={phone}&script=Hello+[alp]';
  validateReadyUrl(raw);
  const url = buildReadyUrl(raw, { phone: '9876543210', display_name: 'Asha' });
  assert.equal(url.searchParams.get('phone'), '9876543210');
  assert.equal(url.searchParams.get('script'), 'Hello Asha');
});
