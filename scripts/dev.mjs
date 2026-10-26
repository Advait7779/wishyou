import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:backend'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev:frontend'], { stdio: 'inherit', shell: true }),
];

function stop() { for (const child of children) child.kill(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
