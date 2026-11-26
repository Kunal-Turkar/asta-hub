import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { inspectRepoFiles } from '../shared/stackInspector';
import type { DetectedStack, LocalCloneRecord } from '../shared/types';

function readPackageJsonScripts(
  repoPath: string
): Record<string, string> | undefined {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return raw.scripts;
  } catch {
    return undefined;
  }
}

export function scanLocalRepoStacks(repoPath: string): DetectedStack[] {
  if (!fs.existsSync(repoPath)) return [];
  const entries = fs.readdirSync(repoPath);
  const scripts = readPackageJsonScripts(repoPath);
  return inspectRepoFiles({
    fileNames: entries,
    packageJsonScripts: scripts,
  });
}

function getCurrentBranch(repoPath: string, gitBin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      gitBin,
      ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { windowsHide: true },
      (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      }
    );
  });
}

export class GitService {
  private getGitBin: () => string;

  constructor(getGitBin: () => string = () => 'git') {
    this.getGitBin = getGitBin;
  }

  async cloneRepo(params: {
    repoId: string;
    owner: string;
    name: string;
    cloneUrl: string;
    libraryRoot: string;
    customParentDir?: string;
    onProgress: (percent: number, line: string) => void;
  }): Promise<LocalCloneRecord> {
    const parentDir =
      params.customParentDir ?? path.join(params.libraryRoot, 'repos', params.owner);
    fs.mkdirSync(parentDir, { recursive: true });
    const targetDir = path.join(parentDir, params.name);

    if (fs.existsSync(path.join(targetDir, '.git'))) {
      return this.pullRepo({
        repoId: params.repoId,
        clonePath: targetDir,
        onProgress: params.onProgress,
      });
    }

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      throw new Error(`Target folder is not empty: ${targetDir}`);
    }

    const gitBin = this.getGitBin();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        gitBin,
        ['clone', '--progress', params.cloneUrl, targetDir],
        { windowsHide: true }
      );

      const handleOutput = (chunk: Buffer) => {
        const lines = chunk.toString().split(/[\r\n]+/).filter(Boolean);
        for (const line of lines) {
          const pctMatch = /(\d{1,3})%/.exec(line);
          const pct = pctMatch ? Math.min(99, Number(pctMatch[1])) : -1;
          params.onProgress(pct, line.trim());
        }
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git clone failed with exit code ${code}`));
      });
    });

    const branch = await getCurrentBranch(targetDir, gitBin);
    const stacks = scanLocalRepoStacks(targetDir);

    return {
      repoId: params.repoId,
      clonePath: targetDir,
      branch,
      lastPulledAt: new Date().toISOString(),
      stacks,
    };
  }

  async pullRepo(params: {
    repoId: string;
    clonePath: string;
    onProgress: (percent: number, line: string) => void;
  }): Promise<LocalCloneRecord> {
    if (!fs.existsSync(params.clonePath)) {
      throw new Error(`Local clone directory not found: ${params.clonePath}`);
    }

    const gitBin = this.getGitBin();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(gitBin, ['-C', params.clonePath, 'pull', '--progress'], {
        windowsHide: true,
      });

      const handleOutput = (chunk: Buffer) => {
        const lines = chunk.toString().split(/[\r\n]+/).filter(Boolean);
        for (const line of lines) {
          const pctMatch = /(\d{1,3})%/.exec(line);
          const pct = pctMatch ? Math.min(99, Number(pctMatch[1])) : -1;
          params.onProgress(pct, line.trim());
        }
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git pull failed with exit code ${code}`));
      });
    });

    const branch = await getCurrentBranch(params.clonePath, gitBin);
    const stacks = scanLocalRepoStacks(params.clonePath);

    return {
      repoId: params.repoId,
      clonePath: params.clonePath,
      branch,
      lastPulledAt: new Date().toISOString(),
      stacks,
    };
  }

  async runSetupCommand(params: {
    clonePath: string;
    command: string;
    onLog: (line: string) => void;
  }): Promise<{ exitCode: number; output: string }> {
    if (!fs.existsSync(params.clonePath)) {
      throw new Error(`Clone directory does not exist: ${params.clonePath}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(params.command, {
        cwd: params.clonePath,
        shell: true,
        windowsHide: true,
      });

      let fullOutput = '';
      const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        fullOutput += text;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) params.onLog(line);
        }
      };

      child.stdout.on('data', handleChunk);
      child.stderr.on('data', handleChunk);
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ exitCode: code ?? 0, output: fullOutput });
      });
    });
  }
}
