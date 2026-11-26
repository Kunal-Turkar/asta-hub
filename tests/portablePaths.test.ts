import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  detectPortableContext,
  findPortableGitBinary,
  fromPortablePath,
  resolveConfiguredLibraryRoot,
  toPortablePath,
} from '../src/main/portablePaths';

describe('portablePaths', () => {
  it('encodes and decodes paths inside libraryRoot across different drive letters', () => {
    const pc1Root = 'D:\\ASTA\\data';
    const pc2Root = 'E:\\USB\\ASTA-Hub\\data';

    const originalExe = 'D:\\ASTA\\data\\apps\\yt-dlp\\2026\\yt-dlp.exe';
    const stored = toPortablePath(originalExe, pc1Root);
    assert.equal(stored, '@LIBRARY/apps/yt-dlp/2026/yt-dlp.exe');

    // Resolve on PC #2 under a completely different drive/folder
    const resolvedOnPc2 = fromPortablePath(stored, pc2Root);
    assert.equal(
      resolvedOnPc2,
      path.resolve(pc2Root, 'apps', 'yt-dlp', '2026', 'yt-dlp.exe')
    );

    // Paths outside libraryRoot stay untouched
    const external = 'C:\\Program Files\\PowerToys\\PowerToys.exe';
    assert.equal(toPortablePath(external, pc1Root), external);
    assert.equal(fromPortablePath(external, pc2Root), external);
  });

  it('detects portable mode via portable.flag or data/ directory and resolves ./data', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-port-test-'));
    try {
      const noFlag = detectPortableContext({
        isPackaged: true,
        execPath: path.join(tmpDir, 'ASTA Hub.exe'),
        cwd: tmpDir,
      });
      assert.equal(noFlag.isPortableMode, false);

      fs.writeFileSync(path.join(tmpDir, 'portable.flag'), '1');
      const withFlag = detectPortableContext({
        isPackaged: true,
        execPath: path.join(tmpDir, 'ASTA Hub.exe'),
        cwd: tmpDir,
      });
      assert.equal(withFlag.isPortableMode, true);
      assert.equal(withFlag.userDataDir, path.join(tmpDir, 'data', 'userData'));
      assert.equal(
        resolveConfiguredLibraryRoot('./data', withFlag.portableDataDir),
        path.join(tmpDir, 'data')
      );

      // PortableGit binary lookup
      assert.equal(findPortableGitBinary(withFlag.portableDataDir), null);
      const gitExe = path.join(
        withFlag.portableDataDir!,
        'tools',
        'git',
        'cmd',
        'git.exe'
      );
      fs.mkdirSync(path.dirname(gitExe), { recursive: true });
      fs.writeFileSync(gitExe, 'stub');
      assert.equal(findPortableGitBinary(withFlag.portableDataDir), gitExe);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
