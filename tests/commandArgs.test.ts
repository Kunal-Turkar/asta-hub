import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitCommandArgs } from '../src/shared/commandArgs';

describe('splitCommandArgs', () => {
  it('parses flags, quoted Windows paths with spaces, and single quotes', () => {
    const args = splitCommandArgs(
      '--search "hello world" -g \'*.ts\' "C:\\My Folder\\file.txt"'
    );
    assert.deepEqual(args, [
      '--search',
      'hello world',
      '-g',
      '*.ts',
      'C:\\My Folder\\file.txt',
    ]);
  });

  it('returns empty array for whitespace-only input', () => {
    assert.deepEqual(splitCommandArgs('   \t  '), []);
  });
});
