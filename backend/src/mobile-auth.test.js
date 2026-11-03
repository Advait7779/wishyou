import assert from 'node:assert/strict';
import test from 'node:test';
import { mobileRouteAllowed } from './mobile-auth.js';
import { mergeMobileSchedule } from './mobile-schedule.js';

test('mobile scope permits contacts and schedule but never provider administration', () => {
  for (const [method, path] of [['GET', '/api/dashboard'], ['GET', '/api/contacts'], ['POST', '/api/contacts'],
    ['PUT', '/api/mobile/schedule'], ['POST', '/api/contacts/12/send-greeting'], ['PATCH', '/api/contacts/12'],
    ['GET', '/api/imports/uploads/latest'], ['PATCH', '/api/imports/uploads/12345678-1234-4234-8234-123456789abc']]) assert.equal(mobileRouteAllowed(method, path), true, `${method} ${path}`);
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/api/greeting-urls', '/api/providers', '/api/providers/sms/test', '/api/templates', '/api/templates/1', '/api/settings']) assert.equal(mobileRouteAllowed(method, path), false, `${method} ${path}`);
  }
});

test('mobile schedule updates retain the timezone and web template associations', () => {
  const current = { timezone: 'Asia/Kolkata', birthdaySmsTemplateId: 7, sendTime: '09:00' };
  const result = mergeMobileSchedule(current, { sendTime: '00:15', birthdayEnabled: true, anniversaryEnabled: false, timezone: 'UTC', birthdaySmsTemplateId: 999 });
  assert.deepEqual(result, { ...current, sendTime: '00:15', birthdayEnabled: true, anniversaryEnabled: false });
  assert.throws(() => mergeMobileSchedule(current, { sendTime: '25:00', birthdayEnabled: true, anniversaryEnabled: false }));
  assert.throws(() => mergeMobileSchedule(current, { sendTime: '09:00', birthdayEnabled: 'false', anniversaryEnabled: false }));
});
