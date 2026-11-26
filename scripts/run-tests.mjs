import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const isWin = process.platform === 'win32';

// Build shared & main TS (plus tests) into dist-test using tsc
const build = spawnSync(
  isWin ? 'npx.cmd' : 'npx',
  ['tsc', '-p', 'tsconfig.test.json'],
  { cwd: rootDir, stdio: 'inherit', shell: isWin }
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const testDir = path.join(rootDir, 'dist-test', 'tests');
const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(testDir, f));

const res = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: rootDir,
  stdio: 'inherit',
});

process.exit(res.status ?? 1);
