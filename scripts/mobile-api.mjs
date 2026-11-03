import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

console.log('Mobile test API on port 4001: provider sends are paused for this process. Data changes use the configured database.');
const child = spawn(process.execPath, ['src/server.js'], {
  cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
  env: { ...process.env, PORT: process.env.MOBILE_API_PORT || '4001', BACKGROUND_JOBS_ENABLED: 'false' }, stdio: 'inherit', windowsHide: true,
});
child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
