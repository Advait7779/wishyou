import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function passwordVersion(passwordHash) {
  return createHash('sha256').update(passwordHash).digest('hex');
}

export async function syncConfiguredAdmin(query, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = (await query('SELECT id,password_hash FROM admins WHERE email=$1', [normalizedEmail])).rows[0];
  if (!existing) {
    await query('INSERT INTO admins(email,password_hash) VALUES($1,$2)', [normalizedEmail, await bcrypt.hash(password, 12)]);
  } else if (!await bcrypt.compare(password, existing.password_hash)) {
    await query('UPDATE admins SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(password, 12), existing.id]);
  }
}
