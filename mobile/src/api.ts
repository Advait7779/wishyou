import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const host = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ && host ? `http://${host}:4001` : '')).replace(/\/$/, '');
const storageKey = `wishyou-session-${API_URL.replace(/[^a-zA-Z0-9]/g, '_')}`;
let accessToken = '';
let accessExpiresAt = 0;
let refreshPromise: Promise<string> | null = null;
export let onExpired = () => {};
export function setOnExpired(callback: () => void) { onExpired = callback; }
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); } }

async function raw(path: string, options: RequestInit = {}) {
  if (!API_URL) throw new ApiError('Set EXPO_PUBLIC_API_URL to your hosted API address.');
  if (!__DEV__ && !API_URL.startsWith('https://')) throw new ApiError('The released app requires an HTTPS API address.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(`${API_URL}/api${path}`, { ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status}).`, response.status);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new ApiError('Cannot reach the server. Check your connection and try again.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

async function refresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const saved = await SecureStore.getItemAsync(storageKey);
    if (!saved) throw new ApiError('Please sign in.', 401);
    const result = await raw('/mobile/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: JSON.parse(saved).refreshToken }) });
    await SecureStore.setItemAsync(storageKey, JSON.stringify({ refreshToken: result.refreshToken, email: result.email }));
    accessToken = result.accessToken;
    accessExpiresAt = Date.now() + 14 * 60 * 1000;
    return result.email;
  })().catch(async error => {
    if (error.status === 401) { accessToken = ''; await SecureStore.deleteItemAsync(storageKey); onExpired(); }
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export const restore = refresh;
export async function login(email: string, password: string) {
  const result = await raw('/mobile/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await SecureStore.setItemAsync(storageKey, JSON.stringify({ refreshToken: result.refreshToken, email: result.email }));
  accessToken = result.accessToken;
  accessExpiresAt = Date.now() + 14 * 60 * 1000;
  return result.email as string;
}
export async function api(path: string, options: RequestInit = {}): Promise<any> {
  try { return await raw(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } }); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await refresh();
    return raw(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } });
  }
}
export const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });
export async function authorizedHeaders() { if (!accessToken || Date.now() >= accessExpiresAt) await refresh(); return { Authorization: `Bearer ${accessToken}` }; }
export async function logout() {
  try { await api('/mobile/logout', json('POST', {})); }
  finally { accessToken = ''; await SecureStore.deleteItemAsync(storageKey); }
}
