import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const isWin = process.platform === 'win32';
const electronBin = isWin
  ? path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(rootDir, 'node_modules', '.bin', 'electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.', ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
