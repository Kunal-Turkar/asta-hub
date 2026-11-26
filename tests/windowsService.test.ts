import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildDiscoveryTokens,
  findExecutablesRecursively,
  pickPrimaryExecutable,
  WindowsService,
} from '../src/main/windowsService';
import type { ToolExecutionEvent } from '../src/shared/types';

describe('windowsService executable discovery', () => {
  it('ranks primary repo executable above uninstallers and nested helpers', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-exe-test-'));
    try {
      const helperDir = path.join(tmpDir, 'bin', 'helpers');
      fs.mkdirSync(helperDir, { recursive: true });

      const uninst = path.join(tmpDir, 'unins000.exe');
      const helper = path.join(helperDir, 'crashpad_handler.exe');
      const mainExe = path.join(tmpDir, 'LocalSend.exe');

      fs.writeFileSync(uninst, 'stub');
      fs.writeFileSync(helper, 'stub');
      fs.writeFileSync(mainExe, 'stub');

      const found = findExecutablesRecursively(tmpDir);
      assert.equal(found.length, 3);

      const primary = pickPrimaryExecutable(found, 'localsend');
      assert.equal(primary, mainExe);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('builds normalized discovery tokens for Windows installers and winget aliases', () => {
    const tokens = buildDiscoveryTokens(
      'notepad-plus-plus',
      'notepad-plus-plus',
      'Notepad++.Notepad++'
    );
    assert.ok(tokens.includes('notepad++'));
    assert.ok(tokens.includes('notepad-plus-plus'));

    const rgTokens = buildDiscoveryTokens('ripgrep', 'BurntSushi', 'BurntSushi.ripgrep.MSVC');
    assert.ok(rgTokens.includes('rg'));
    assert.ok(rgTokens.includes('ripgrep'));
  });

  it('streams stdout and exit code via startToolRun', async () => {
    const service = new WindowsService();
    const events: ToolExecutionEvent[] = [];

    await new Promise<void>((resolve) => {
      service.startToolRun({
        repoId: 'test/node',
        executablePath: process.execPath,
        argsString: '-e "console.log(\'hello-from-tool\')"',
        onEvent: (ev) => {
          events.push(ev);
          if (ev.status !== 'running') {
            resolve();
          }
        },
      });
    });

    const combinedOutput = events.map((e) => e.chunk ?? '').join('');
    const terminal = events.at(-1);
    assert.equal(terminal?.status, 'completed');
    assert.equal(terminal?.exitCode, 0);
    assert.ok(combinedOutput.includes('hello-from-tool'));
  });
});
