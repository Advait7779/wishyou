import { clientError } from './api-errors.js';

export function mergeMobileSchedule(current, input = {}) {
  const { sendTime, birthdayEnabled, anniversaryEnabled } = input;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime || '') || typeof birthdayEnabled !== 'boolean' || typeof anniversaryEnabled !== 'boolean') {
    throw clientError('Choose a valid time and automatic wish settings.');
  }
  return { ...current, sendTime, birthdayEnabled, anniversaryEnabled };
}
