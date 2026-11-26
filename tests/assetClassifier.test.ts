import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyReleaseAssets,
  parseGitHubRepoInput,
  type RawGitHubAsset,
} from '../src/shared/assetClassifier';

describe('parseGitHubRepoInput', () => {
  it('parses standard HTTPS GitHub URLs and strips .git or release subpaths', () => {
    assert.deepEqual(parseGitHubRepoInput('https://github.com/microsoft/PowerToys'), {
      owner: 'microsoft',
      repo: 'PowerToys',
    });
    assert.deepEqual(
      parseGitHubRepoInput('https://github.com/localsend/localsend.git'),
      { owner: 'localsend', repo: 'localsend' }
    );
    assert.deepEqual(
      parseGitHubRepoInput('https://github.com/yt-dlp/yt-dlp/releases/tag/2025.01.01'),
      { owner: 'yt-dlp', repo: 'yt-dlp' }
    );
  });

  it('parses owner/repo shorthand and SSH URLs', () => {
    assert.deepEqual(parseGitHubRepoInput('BurntSushi/ripgrep'), {
      owner: 'BurntSushi',
      repo: 'ripgrep',
    });
    assert.deepEqual(
      parseGitHubRepoInput('git@github.com:jesseduffield/lazygit.git'),
      { owner: 'jesseduffield', repo: 'lazygit' }
    );
  });

  it('rejects non-GitHub URLs and malformed inputs', () => {
    assert.equal(parseGitHubRepoInput(''), null);
    assert.equal(parseGitHubRepoInput('https://gitlab.com/org/repo'), null);
    assert.equal(parseGitHubRepoInput('onlyonepart'), null);
  });
});

describe('classifyReleaseAssets', () => {
  const sampleAssets: RawGitHubAsset[] = [
    {
      id: 1,
      name: 'MyTool-1.2.0-linux-x86_64.tar.gz',
      browser_download_url: 'https://example.com/linux.tar.gz',
      size: 1000,
      download_count: 200,
    },
    {
      id: 2,
      name: 'MyTool-1.2.0-macos-arm64.dmg',
      browser_download_url: 'https://example.com/mac.dmg',
      size: 1000,
      download_count: 300,
    },
    {
      id: 3,
      name: 'MyTool-1.2.0-win-arm64-setup.exe',
      browser_download_url: 'https://example.com/win-arm64.exe',
      size: 1500,
      download_count: 50,
    },
    {
      id: 4,
      name: 'MyTool-1.2.0-win-x64-setup.exe',
      browser_download_url: 'https://example.com/win-x64.exe',
      size: 2000,
      download_count: 1000,
    },
    {
      id: 5,
      name: 'MyTool-1.2.0-win-x64-portable.zip',
      browser_download_url: 'https://example.com/win-x64.zip',
      size: 1800,
      download_count: 400,
    },
    {
      id: 6,
      name: 'SHA256SUMS.txt',
      browser_download_url: 'https://example.com/SHA256SUMS.txt',
      size: 200,
      download_count: 10,
    },
  ];

  it('selects x64 Windows setup over arm64 and excludes Linux/macOS on x64 host', () => {
    const res = classifyReleaseAssets(sampleAssets, 'x64');
    assert.equal(res.recommendedAssetId, 4);

    const winSetup = res.assets.find((a) => a.id === 4)!;
    assert.equal(winSetup.kind, 'installer');
    assert.equal(winSetup.arch, 'x64');
    assert.equal(winSetup.isRecommended, true);
    assert.equal(winSetup.checksumAssetName, 'SHA256SUMS.txt');

    const portable = res.assets.find((a) => a.id === 5)!;
    assert.equal(portable.kind, 'portable');
    assert.equal(portable.arch, 'x64');

    const linux = res.assets.find((a) => a.id === 1)!;
    assert.equal(linux.kind, 'other');
    assert.ok(linux.score < 0);
  });

  it('respects preferredAssetPattern when user prefers portable ZIP over installer', () => {
    const res = classifyReleaseAssets(sampleAssets, 'x64', 'portable\\.zip');
    assert.equal(res.recommendedAssetId, 5);
  });

  it('picks arm64 setup on arm64 host', () => {
    const res = classifyReleaseAssets(sampleAssets, 'arm64');
    assert.equal(res.recommendedAssetId, 3);
  });

  it('prefers portable ZIP over setup EXE when preferPortable is enabled', () => {
    const res = classifyReleaseAssets(sampleAssets, 'x64', null, {
      preferPortable: true,
    });
    assert.equal(res.recommendedAssetId, 5);
  });
});
