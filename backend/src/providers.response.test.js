import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProviderAccepted } from './providers.js';

test('explicit provider rejection in an HTTP 200 body is not accepted', () => {
  assert.throws(() => assertProviderAccepted('{"success":false,"message":"Invalid template"}'), /Invalid template/);
  assert.throws(() => assertProviderAccepted('{"status":"failed","error":"No credits"}'), /No credits/);
  assert.throws(() => assertProviderAccepted('ERROR invalid number'), /rejected/);
});

test('provider acceptance body remains accepted without claiming phone delivery', () => {
  assert.doesNotThrow(() => assertProviderAccepted('{"status":"success","message_id":"abc"}'));
});
