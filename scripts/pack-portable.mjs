import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const isWin = process.platform === 'win32';
const withData = process.argv.includes('--with-data');

function run(commandLine) {
  const res = spawnSync(commandLine, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log('[portable] Building main & renderer bundles...');
run('npm run build');

console.log('[portable] Packaging unpacked Windows application directory...');
run('npx electron-builder --dir');

const unpackedDir = path.join(rootDir, 'dist-package', 'win-unpacked');
const portableOutDir = path.join(rootDir, 'dist-package', 'ASTA-Hub-Portable');

if (!fs.existsSync(unpackedDir)) {
  console.error(`[portable] Expected unpacked directory missing: ${unpackedDir}`);
  process.exit(1);
}

if (fs.existsSync(portableOutDir)) {
  fs.rmSync(portableOutDir, { recursive: true, force: true });
}

fs.cpSync(unpackedDir, portableOutDir, { recursive: true });
fs.writeFileSync(
  path.join(portableOutDir, 'portable.flag'),
  'Single-folder Portable Mode marker for ASTA Hub.\n',
  'utf8'
);

const dataDir = path.join(portableOutDir, 'data');
for (const sub of ['userData', 'apps', 'repos', 'downloads', 'tools']) {
  fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
}

const sourceDataDir = path.join(rootDir, 'data');
if (withData && fs.existsSync(sourceDataDir)) {
  console.log('[portable] Copying ./data into portable bundle...');
  fs.cpSync(sourceDataDir, dataDir, { recursive: true });
}

console.log(`[portable] Ready! Single transferable folder created at:`);
console.log(`  ${portableOutDir}`);
