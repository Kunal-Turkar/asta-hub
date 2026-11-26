import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectRepoFiles } from '../src/shared/stackInspector';

describe('inspectRepoFiles', () => {
  it('detects Node.js package manager and available scripts', () => {
    const stacks = inspectRepoFiles({
      fileNames: ['package.json', 'pnpm-lock.yaml', 'README.md'],
      packageJsonScripts: {
        dev: 'vite',
        build: 'vite build',
      },
    });

    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].id, 'node');
    assert.equal(stacks[0].label, 'Node.js (pnpm)');
    assert.deepEqual(
      stacks[0].commands.map((c) => c.command),
      ['pnpm install', 'pnpm dev', 'pnpm build']
    );
  });

  it('detects multi-stack repos (.NET + Docker + Python)', () => {
    const stacks = inspectRepoFiles({
      fileNames: ['App.sln', 'requirements.txt', 'docker-compose.yml'],
    });

    const ids = stacks.map((s) => s.id);
    assert.ok(ids.includes('dotnet'));
    assert.ok(ids.includes('python'));
    assert.ok(ids.includes('docker'));
  });
});
