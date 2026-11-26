import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isUpdateAvailable, LibraryDatabase } from '../src/main/db';
import { parseExpectedSha256 } from '../src/main/downloadService';

describe('parseExpectedSha256', () => {
  it('extracts matching hash from SHA256SUMS multi-line files', () => {
    const hashA = 'a'.repeat(64);
    const hashB = 'b'.repeat(64);
    const content = [
      `${hashA}  tool-linux.tar.gz`,
      `${hashB} *tool-win-x64.zip`,
    ].join('\n');

    assert.equal(parseExpectedSha256(content, 'tool-win-x64.zip'), hashB);
    assert.equal(parseExpectedSha256(content, 'missing.exe'), null);
  });

  it('extracts bare single-line hash files', () => {
    const hash = '0123456789abcdef'.repeat(4);
    assert.equal(parseExpectedSha256(`${hash}\n`, 'anything.exe'), hash);
  });
});

describe('LibraryDatabase', () => {
  it('persists repos, tags, installs, clones, and settings to SQLite on disk', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-db-test-'));
    const dbPath = path.join(tmpDir, 'library.db');
    const defaults = {
      libraryRoot: path.join(tmpDir, 'lib'),
      githubToken: '',
      enableWingetFallback: true,
      preferPortableAssets: false,
      keepDownloadedInstallers: true,
      preferredArch: 'auto' as const,
      preferredEditor: 'code',
      theme: 'dark' as const,
    };

    try {
      const db = new LibraryDatabase(dbPath, defaults);
      await db.init();

      db.upsertRepo({
        id: 'sharkdp/bat',
        owner: 'sharkdp',
        name: 'bat',
        fullName: 'sharkdp/bat',
        description: 'Cat clone with wings',
        htmlUrl: 'https://github.com/sharkdp/bat',
        stars: 50000,
        tags: ['CLI', 'Rust'],
        toolPresets: [
          { id: '1', label: 'Show Help', args: '--help', workingDir: null },
        ],
        latestRelease: {
          tagName: 'v0.25.0',
          name: 'v0.25.0',
          body: 'Release notes',
          publishedAt: '2026-01-01T00:00:00Z',
          htmlUrl: 'https://github.com/sharkdp/bat/releases/tag/v0.25.0',
          prerelease: false,
          assets: [],
          recommendedAssetId: null,
        },
      });

      db.upsertInstall({
        repoId: 'sharkdp/bat',
        mode: 'portable',
        version: 'v0.24.0',
        assetName: 'bat-v0.24.0-x86_64-pc-windows-msvc.zip',
        installDir: 'C:\\Apps\\bat',
        executablePath: 'C:\\Apps\\bat\\bat.exe',
        detectedExecutables: ['C:\\Apps\\bat\\bat.exe'],
        sha256: 'abc',
        publisher: null,
        signatureStatus: 'Archive',
        subsystem: 'console',
        uninstallCommand: null,
        installedAt: '2026-01-01T00:00:00Z',
      });

      db.updateSettings({ preferredEditor: 'cursor' });
      db.close();

      // Re-open from disk to prove persistence
      const db2 = new LibraryDatabase(dbPath, defaults);
      await db2.init();
      const loaded = db2.getRepo('sharkdp/bat');
      assert.ok(loaded);
      assert.equal(loaded.stars, 50000);
      assert.deepEqual(loaded.tags, ['CLI', 'Rust']);
      assert.equal(loaded.toolPresets[0]?.label, 'Show Help');
      assert.equal(loaded.localInstall?.version, 'v0.24.0');
      assert.equal(loaded.localInstall?.subsystem, 'console');
      assert.equal(loaded.hasUpdate, true);
      assert.equal(db2.getSettings().preferredEditor, 'cursor');
      assert.equal(isUpdateAvailable('v0.25.0', '0.25.0'), false);
      assert.equal(isUpdateAvailable('0.24.0', 'v0.25.0'), true);
      db2.close();

      // Verify single-folder portable relocation across two completely different paths
      const pc1Data = path.join(tmpDir, 'pc1', 'data');
      const pc2Data = path.join(tmpDir, 'usb-drive', 'ASTA-Hub', 'data');
      const exeRel = path.join('apps', 'bat', 'bat.exe');
      fs.mkdirSync(path.join(pc1Data, 'apps', 'bat'), { recursive: true });
      fs.writeFileSync(path.join(pc1Data, exeRel), 'exe');

      const pDb1 = new LibraryDatabase(
        path.join(pc1Data, 'userData', 'library.db'),
        { ...defaults, libraryRoot: './data', preferPortableAssets: true },
        pc1Data
      );
      await pDb1.init();
      pDb1.upsertRepo({
        id: 'sharkdp/bat',
        owner: 'sharkdp',
        name: 'bat',
        fullName: 'sharkdp/bat',
        description: 'Cat clone',
        htmlUrl: 'https://github.com/sharkdp/bat',
      });
      pDb1.upsertInstall({
        repoId: 'sharkdp/bat',
        mode: 'portable',
        version: 'v0.25.0',
        assetName: 'bat.zip',
        installDir: path.join(pc1Data, 'apps', 'bat'),
        executablePath: path.join(pc1Data, exeRel),
        detectedExecutables: [path.join(pc1Data, exeRel)],
        sha256: 'abc',
        publisher: null,
        signatureStatus: 'Archive',
        subsystem: 'console',
        installedAt: '2026-01-01T00:00:00Z',
      });
      pDb1.close();

      // Simulate copying the single folder onto another drive/PC
      fs.cpSync(pc1Data, pc2Data, { recursive: true });

      const pDb2 = new LibraryDatabase(
        path.join(pc2Data, 'userData', 'library.db'),
        { ...defaults, libraryRoot: './data', preferPortableAssets: true },
        pc2Data
      );
      await pDb2.init();
      const relocated = pDb2.getRepo('sharkdp/bat');
      assert.ok(relocated?.localInstall);
      assert.equal(relocated.localInstall.executablePath, path.join(pc2Data, exeRel));
      assert.equal(relocated.localInstall.availableOnCurrentPc, true);
      pDb2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
