import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { clientError } from './api-errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');
export const mobileRouteAllowed = (method, path) =>
  (method === 'GET' && ['/api/dashboard', '/api/contacts', '/api/mobile/schedule'].includes(path)) ||
  (method === 'PUT' && path === '/api/mobile/schedule') ||
  (method === 'POST' && ['/api/contacts', '/api/contacts/clear', '/api/mobile/logout'].includes(path)) ||
  (/^\/api\/contacts\/[1-9]\d*$/.test(path) && ['PATCH', 'DELETE'].includes(method)) ||
  (/^\/api\/contacts\/[1-9]\d*\/greeting-review$/.test(path) && method === 'GET') ||
  (/^\/api\/contacts\/[1-9]\d*\/send-greeting$/.test(path) && method === 'POST') ||
  (/^\/api\/imports\/uploads(?:\/(?:latest|[0-9a-f-]{36})(?:\/complete)?)?$/.test(path) && ['GET', 'POST', 'PATCH', 'DELETE'].includes(method));

export async function setupMobileSessions(query) {
  await query(`CREATE TABLE IF NOT EXISTS mobile_sessions (
    id UUID PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    password_version TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  ); CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
    token_hash TEXT PRIMARY KEY, session_id UUID NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ
  ); CREATE INDEX IF NOT EXISTS mobile_refresh_session_idx ON mobile_refresh_tokens(session_id);
  CREATE TABLE IF NOT EXISTS manual_send_requests (
    request_key UUID PRIMARY KEY, contact_id BIGINT NOT NULL, occasion TEXT NOT NULL, channel TEXT NOT NULL,
    campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE
  ); DELETE FROM mobile_sessions WHERE expires_at < now()-interval '1 day'`);
}

export function installMobileLogin(app, asyncRoute, { query, transaction, email, version }) {
  const issue = async (client, session, adminEmail) => {
    const refreshToken = randomBytes(32).toString('base64url');
    await client.query('INSERT INTO mobile_refresh_tokens(token_hash,session_id) VALUES($1,$2)', [digest(refreshToken), session.id]);
    return { accessToken: jwt.sign({ id: session.admin_id, email: adminEmail, client: 'mobile', sessionId: session.id,
      passwordVersion: version() }, process.env.JWT_SECRET, { expiresIn: '15m', audience: 'wishyou-mobile', issuer: 'wishyou' }),
      refreshToken, email: adminEmail };
  };
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
  app.post('/api/mobile/login', limit, asyncRoute(async (req, res) => {
    const inputEmail = String(req.body?.email || '').trim().toLowerCase();
    const admin = inputEmail === email ? (await query('SELECT * FROM admins WHERE email=$1', [email])).rows[0] : null;
    if (!admin || !await bcrypt.compare(String(req.body?.password || ''), admin.password_hash)) throw clientError('Invalid email or password.', 401);
    const result = await transaction(async client => {
      const session = (await client.query(`INSERT INTO mobile_sessions(id,admin_id,password_version,expires_at)
        VALUES($1,$2,$3,now()+interval '30 days') RETURNING *`, [randomUUID(), admin.id, version()])).rows[0];
      return issue(client, session, email);
    });
    res.set('Cache-Control', 'no-store').json(result);
  }));
  app.post('/api/mobile/refresh', limit, asyncRoute(async (req, res) => {
    const token = String(req.body?.refreshToken || '');
    if (!/^[\w-]{43}$/.test(token)) throw clientError('Please sign in again.', 401);
    // Commit replay revocation before reporting the error.
    const result = await transaction(async client => {
      const row = (await client.query(`SELECT s.*,t.used_at FROM mobile_refresh_tokens t
        JOIN mobile_sessions s ON s.id=t.session_id WHERE t.token_hash=$1 FOR UPDATE OF s,t`, [digest(token)])).rows[0];
      if (!row) return null;
      if (row.used_at || row.password_version !== version() || row.revoked_at || new Date(row.expires_at) <= new Date()) {
        await client.query('UPDATE mobile_sessions SET revoked_at=now() WHERE id=$1', [row.id]);
        return null;
      }
      await client.query('UPDATE mobile_refresh_tokens SET used_at=now() WHERE token_hash=$1', [digest(token)]);
      return issue(client, row, email);
    });
    if (!result) throw clientError('Please sign in again.', 401);
    res.set('Cache-Control', 'no-store').json(result);
  }));
}

export async function validateMobileSession(query, token, version) {
  const claims = jwt.verify(token, process.env.JWT_SECRET, { audience: 'wishyou-mobile', issuer: 'wishyou', algorithms: ['HS256'] });
  if (claims.client !== 'mobile' || claims.passwordVersion !== version) throw clientError('Please sign in again.', 401);
  const row = (await query(`SELECT 1 FROM mobile_sessions WHERE id=$1 AND admin_id=$2 AND password_version=$3
    AND revoked_at IS NULL AND expires_at>now()`, [claims.sessionId, claims.id, version])).rows[0];
  if (!row) throw clientError('Please sign in again.', 401);
  return claims;
}
