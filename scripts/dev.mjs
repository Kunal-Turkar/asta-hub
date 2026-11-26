import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const rootDir = process.cwd();
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for Vite dev server on port ${port}`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

function runSyncOrThrow(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: isWin,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('[dev] Compiling Electron main & shared TypeScript...');
  await runSyncOrThrow(npmCmd, ['run', 'build:main']);

  console.log('[dev] Starting Vite dev server...');
  const vite = spawn(npmCmd, ['exec', '--', 'vite', '--port', '5173'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWin,
  });

  const cleanup = () => {
    if (!vite.killed) vite.kill();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await waitForPort(5173);
  console.log('[dev] Launching Electron...');

  const electronBin = isWin
    ? path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(rootDir, 'node_modules', '.bin', 'electron');

  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const electron = spawn(electronBin, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });

  electron.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
