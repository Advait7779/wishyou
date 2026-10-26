export function automaticScheduleSlot(now, timezone, sendTime) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const local = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) return null;
  if (`${local.hour}:${local.minute}` < sendTime) return null;

  const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(now).find(part => part.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';
  const sendAt = new Date(`${local.year}-${local.month}-${local.day}T${sendTime}:00${offset}`);
  // A restarted worker still schedules today's wishes after the configured time.
  // The persisted campaign date and unique index prevent a second send.
  if (now < sendAt) return null;
  return {
    year: local.year, month: local.month, day: local.day,
    sendAt,
  };
}
