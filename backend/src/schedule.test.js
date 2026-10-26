import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticScheduleSlot } from './schedule.js';

test('automatic sends run at or after the configured local time on the same day', () => {
  const timezone = 'Asia/Kolkata';
  assert.equal(automaticScheduleSlot(new Date('2026-10-22T06:04:59Z'), timezone, '11:35'), null);
  assert.equal(automaticScheduleSlot(new Date('2026-10-22T06:05:04Z'), timezone, '11:35').sendAt.toISOString(), '2026-10-22T06:05:00.000Z');
  assert.equal(automaticScheduleSlot(new Date('2026-10-22T06:06:00Z'), timezone, '11:35').sendAt.toISOString(), '2026-10-22T06:05:00.000Z');
  assert.equal(automaticScheduleSlot(new Date('2026-10-21T18:30:00Z'), timezone, '11:35'), null);
});

test('automatic send time follows the configured timezone', () => {
  const slot = automaticScheduleSlot(new Date('2026-10-22T15:35:02Z'), 'America/New_York', '11:35');
  assert.equal(slot.sendAt.toISOString(), '2026-10-22T15:35:00.000Z');
  assert.equal(slot.day, '22');
});

test('a skipped daylight-saving hour never sends before the chosen local time', () => {
  assert.equal(automaticScheduleSlot(new Date('2026-03-08T06:59:00Z'), 'America/New_York', '02:30'), null);
  assert.ok(automaticScheduleSlot(new Date('2026-03-08T07:00:00Z'), 'America/New_York', '02:30'));
});
