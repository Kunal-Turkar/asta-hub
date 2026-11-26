import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import { splitCommandArgs } from '../shared/commandArgs';
import type {
  ClassifiedAsset,
  DiscoveredWindowsApp,
  ExecutableSubsystem,
  LocalInstallRecord,
  ToolExecutionEvent,
  TrustInspectionResult,
  WingetPackageMatch,
} from '../shared/types';

function execFileAsync(
  command: string,
  args: string[],
  envExtra?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        env: { ...process.env, ...envExtra },
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? ((error as { code: number }).code ?? 1)
            : error
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      }
    );
  });
}

export function detectExecutableSubsystem(
  exePath: string
): ExecutableSubsystem {
  try {
    const fd = fs.openSync(exePath, 'r');
    try {
      const dosBuf = Buffer.alloc(64);
      fs.readSync(fd, dosBuf, 0, 64, 0);
      if (dosBuf.readUInt16LE(0) !== 0x5a4d) return 'unknown'; // MZ
      const peOffset = dosBuf.readUInt32LE(0x3c);
      const peBuf = Buffer.alloc(96);
      fs.readSync(fd, peBuf, 0, 96, peOffset);
      if (peBuf.readUInt32LE(0) !== 0x00004550) return 'unknown'; // PE\0\0
      const subsystem = peBuf.readUInt16LE(24 + 68);
      if (subsystem === 2) return 'gui';
      if (subsystem === 3) return 'console';
      return 'unknown';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return 'unknown';
  }
}

export function findExecutablesRecursively(
  dirPath: string,
  maxDepth = 4
): string[] {
  const results: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.exe$/i.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(dirPath, 0);
  return results;
}

export function pickPrimaryExecutable(
  executables: string[],
  repoName: string
): string | null {
  if (executables.length === 0) return null;
  const normalizedRepo = repoName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const scored = executables.map((exePath) => {
    const base = path.basename(exePath, '.exe').toLowerCase();
    const normBase = base.replace(/[^a-z0-9]/g, '');
    let score = 0;

    if (/^(unins|uninstall|update|updater|crashpad|squirrel|elevate|createdump)/i.test(base)) {
      score -= 100;
    }
    if (normBase === normalizedRepo) score += 80;
    else if (normBase.includes(normalizedRepo) || normalizedRepo.includes(normBase)) {
      score += 40;
    }

    const depth = exePath.split(path.sep).length;
    score -= depth;

    return { exePath, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.exePath ?? null;
}

export function buildDiscoveryTokens(
  repoName: string,
  owner: string,
  wingetId?: string | null
): string[] {
  const tokens = new Set<string>();
  const add = (val: string | null | undefined) => {
    const clean = (val ?? '').trim().toLowerCase();
    if (clean.length >= 2) tokens.add(clean);
  };

  add(repoName);
  add(repoName.replace(/[-_.]+/g, ' '));
  add(repoName.replace(/[-_.]+/g, ''));
  if (/plus-plus/i.test(repoName)) {
    add(repoName.replace(/-?plus-plus/gi, '++'));
  }
  if (repoName.toLowerCase() === 'ripgrep') add('rg');
  if (repoName.toLowerCase() === 'helix') add('hx');
  if (wingetId) {
    add(wingetId);
    const tail = wingetId.split('.').pop();
    add(tail);
  }
  if (owner.length >= 3 && owner.toLowerCase() !== 'microsoft') {
    add(owner);
  }

  return [...tokens];
}

function cleanDisplayIconPath(rawIcon: string | null | undefined): string | null {
  if (!rawIcon) return null;
  const withoutIndex = rawIcon.split(',')[0].trim();
  const unquoted = withoutIndex.replace(/^"(.*)"$/, '$1').trim();
  if (/\.exe$/i.test(unquoted) && fs.existsSync(unquoted)) {
    return unquoted;
  }
  return null;
}

export class WindowsService {
  private activeToolRuns = new Map<
    string,
    { child: ChildProcess; stoppedByUser: boolean }
  >();

  async inspectBinaryTrust(params: {
    filePath: string;
    fileName: string;
    fileSize: number;
    sha256: string;
    expectedSha256: string | null;
  }): Promise<TrustInspectionResult> {
    const checksumVerified = params.expectedSha256
      ? params.sha256.toLowerCase() === params.expectedSha256.toLowerCase()
      : null;

    let signatureStatus = 'NotChecked';
    let signerSubject: string | null = null;
    let signerIssuer: string | null = null;

    if (/\.(exe|msi|msix|appx)$/i.test(params.fileName)) {
      const psScript = `
        $sig = Get-AuthenticodeSignature -LiteralPath $env:ASTA_TARGET_FILE
        [PSCustomObject]@{
          Status = [string]$sig.Status
          Subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
          Issuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { $null }
        } | ConvertTo-Json -Compress
      `;
      const res = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { ASTA_TARGET_FILE: params.filePath }
      );
      if (res.code === 0 && res.stdout.trim()) {
        try {
          const parsed = JSON.parse(res.stdout.trim()) as {
            Status?: string;
            Subject?: string | null;
            Issuer?: string | null;
          };
          signatureStatus = parsed.Status || 'Unknown';
          signerSubject = parsed.Subject ?? null;
          signerIssuer = parsed.Issuer ?? null;
        } catch {
          signatureStatus = 'Unknown';
        }
      }
    } else if (/\.(zip|7z)$/i.test(params.fileName)) {
      signatureStatus = 'Archive';
    }

    return {
      filePath: params.filePath,
      fileName: params.fileName,
      fileSize: params.fileSize,
      sha256: params.sha256,
      expectedSha256: params.expectedSha256,
      checksumVerified,
      signatureStatus,
      signerSubject,
      signerIssuer,
    };
  }

  async installStagedAsset(params: {
    repoId: string;
    repoName: string;
    libraryRoot: string;
    stagedFilePath: string;
    asset: ClassifiedAsset;
    releaseTag: string;
    trust: TrustInspectionResult;
  }): Promise<LocalInstallRecord> {
    const safeRepoDir = params.repoId.replace(/[<>:"/\\|?*]/g, '__');
    const safeTag = params.releaseTag.replace(/[<>:"/\\|?*]/g, '_');
    const lowerName = params.asset.name.toLowerCase();
    const now = new Date().toISOString();

    if (lowerName.endsWith('.zip')) {
      const installDir = path.join(params.libraryRoot, 'apps', safeRepoDir, safeTag);
      fs.mkdirSync(installDir, { recursive: true });

      const psExtract = `Expand-Archive -LiteralPath $env:ASTA_SRC -DestinationPath $env:ASTA_DEST -Force`;
      const res = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psExtract],
        {
          ASTA_SRC: params.stagedFilePath,
          ASTA_DEST: installDir,
        }
      );

      if (res.code !== 0) {
        throw new Error(
          `Failed to extract ZIP archive: ${res.stderr || res.stdout || 'Unknown error'}`
        );
      }

      const detectedExecutables = findExecutablesRecursively(installDir);
      const primaryExe = pickPrimaryExecutable(detectedExecutables, params.repoName);

      return {
        repoId: params.repoId,
        mode: 'portable',
        version: params.releaseTag,
        assetName: params.asset.name,
        installDir,
        executablePath: primaryExe,
        detectedExecutables,
        sha256: params.trust.sha256,
        publisher: params.trust.signerSubject,
        signatureStatus: params.trust.signatureStatus,
        subsystem: primaryExe ? detectExecutableSubsystem(primaryExe) : 'unknown',
        installedAt: now,
      };
    }

    if (lowerName.endsWith('.7z')) {
      const sevenZipCandidates = [
        '7z.exe',
        'C:\\Program Files\\7-Zip\\7z.exe',
        'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      ];
      let sevenZipExe: string | null = null;
      for (const candidate of sevenZipCandidates) {
        if (candidate === '7z.exe' || fs.existsSync(candidate)) {
          const probe = await execFileAsync(candidate, ['--help']);
          if (probe.code === 0 || probe.stdout.includes('7-Zip')) {
            sevenZipExe = candidate;
            break;
          }
        }
      }

      if (!sevenZipExe) {
        throw new Error(
          '7-Zip is required to extract .7z archives. Install 7-Zip or choose a .zip / .exe release asset.'
        );
      }

      const installDir = path.join(params.libraryRoot, 'apps', safeRepoDir, safeTag);
      fs.mkdirSync(installDir, { recursive: true });
      const res = await execFileAsync(sevenZipExe, [
        'x',
        params.stagedFilePath,
        `-o${installDir}`,
        '-y',
      ]);

      if (res.code !== 0) {
        throw new Error(`7-Zip extraction failed: ${res.stderr || res.stdout}`);
      }

      const detectedExecutables = findExecutablesRecursively(installDir);
      const primaryExe = pickPrimaryExecutable(detectedExecutables, params.repoName);

      return {
        repoId: params.repoId,
        mode: 'portable',
        version: params.releaseTag,
        assetName: params.asset.name,
        installDir,
        executablePath: primaryExe,
        detectedExecutables,
        sha256: params.trust.sha256,
        publisher: params.trust.signerSubject,
        signatureStatus: params.trust.signatureStatus,
        subsystem: primaryExe ? detectExecutableSubsystem(primaryExe) : 'unknown',
        installedAt: now,
      };
    }

    if (
      lowerName.endsWith('.exe') &&
      (params.asset.kind === 'portable' || params.asset.kind === 'executable')
    ) {
      const installDir = path.join(params.libraryRoot, 'apps', safeRepoDir, safeTag);
      fs.mkdirSync(installDir, { recursive: true });
      const targetExe = path.join(installDir, path.basename(params.stagedFilePath));
      fs.copyFileSync(params.stagedFilePath, targetExe);

      return {
        repoId: params.repoId,
        mode: 'portable',
        version: params.releaseTag,
        assetName: params.asset.name,
        installDir,
        executablePath: targetExe,
        detectedExecutables: [targetExe],
        sha256: params.trust.sha256,
        publisher: params.trust.signerSubject,
        signatureStatus: params.trust.signatureStatus,
        subsystem: detectExecutableSubsystem(targetExe),
        installedAt: now,
      };
    }

    // Windows Installer (.exe setup / .msi / .msix)
    const openError = await shell.openPath(params.stagedFilePath);
    if (openError) {
      throw new Error(`Could not launch installer: ${openError}`);
    }

    return {
      repoId: params.repoId,
      mode: 'installer',
      version: params.releaseTag,
      assetName: params.asset.name,
      installDir: path.dirname(params.stagedFilePath),
      executablePath: null,
      detectedExecutables: [],
      sha256: params.trust.sha256,
      publisher: params.trust.signerSubject,
      signatureStatus: params.trust.signatureStatus,
      subsystem: 'unknown',
      cachedInstallerPath: params.stagedFilePath,
      installedAt: now,
    };
  }

  async discoverInstalledApps(params: {
    repoName: string;
    owner: string;
    wingetId?: string | null;
  }): Promise<DiscoveredWindowsApp[]> {
    const tokens = buildDiscoveryTokens(
      params.repoName,
      params.owner,
      params.wingetId
    );

    const psScript = `
      $tokens = ($env:ASTA_TOKENS | ConvertFrom-Json)
      $regPaths = @(
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
      )
      $regMatches = foreach ($rp in $regPaths) {
        Get-ItemProperty $rp -ErrorAction SilentlyContinue | Where-Object {
          $dn = [string]$_.DisplayName
          $loc = [string]$_.InstallLocation
          $icon = [string]$_.DisplayIcon
          if (-not $dn -and -not $loc) { return $false }
          foreach ($t in $tokens) {
            if ($dn.ToLower().Contains($t) -or $loc.ToLower().Contains($t) -or $icon.ToLower().Contains($t)) {
              return $true
            }
          }
          return $false
        } | Select-Object @{N='DisplayName';E={[string]$_.DisplayName}},
                          @{N='DisplayVersion';E={[string]$_.DisplayVersion}},
                          @{N='Publisher';E={[string]$_.Publisher}},
                          @{N='InstallLocation';E={[string]$_.InstallLocation}},
                          @{N='DisplayIcon';E={[string]$_.DisplayIcon}},
                          @{N='UninstallString';E={[string]$_.UninstallString}}
      }

      $dirRoots = @(
        $env:ProgramFiles,
        \${env:ProgramFiles(x86)},
        (Join-Path $env:LOCALAPPDATA 'Programs'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\\WinGet\\Packages'),
        $env:LOCALAPPDATA
      ) | Where-Object { $_ -and (Test-Path $_) }

      $dirMatches = foreach ($root in $dirRoots) {
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object {
          $n = $_.Name.ToLower()
          foreach ($t in $tokens) {
            if ($n.Contains($t)) { return $true }
          }
          return $false
        } | Select-Object @{N='Name';E={$_.Name}}, @{N='FullName';E={$_.FullName}}
      }

      [PSCustomObject]@{
        Registry = @($regMatches)
        Dirs = @($dirMatches)
      } | ConvertTo-Json -Depth 4 -Compress
    `;

    const psRes = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { ASTA_TOKENS: JSON.stringify(tokens) }
    );

    const candidates: DiscoveredWindowsApp[] = [];
    const seenKeys = new Set<string>();

    const addCandidate = (candidate: DiscoveredWindowsApp) => {
      const key = (
        candidate.executablePath ||
        candidate.installDir
      ).toLowerCase();
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      candidates.push(candidate);
    };

    if (psRes.code === 0 && psRes.stdout.trim()) {
      try {
        const parsed = JSON.parse(psRes.stdout.trim()) as {
          Registry?: Array<{
            DisplayName?: string;
            DisplayVersion?: string;
            Publisher?: string;
            InstallLocation?: string;
            DisplayIcon?: string;
            UninstallString?: string;
          }>;
          Dirs?: Array<{ Name?: string; FullName?: string }>;
        };

        for (const reg of parsed.Registry ?? []) {
          const iconExe = cleanDisplayIconPath(reg.DisplayIcon);
          let installDir = (reg.InstallLocation ?? '').trim().replace(/^"(.*)"$/, '$1');
          if ((!installDir || !fs.existsSync(installDir)) && iconExe) {
            installDir = path.dirname(iconExe);
          }

          let detectedExecutables: string[] = [];
          if (installDir && fs.existsSync(installDir)) {
            detectedExecutables = findExecutablesRecursively(installDir, 3);
          }
          if (iconExe && !detectedExecutables.includes(iconExe)) {
            detectedExecutables.unshift(iconExe);
          }

          const primaryExe =
            iconExe ?? pickPrimaryExecutable(detectedExecutables, params.repoName);

          if (primaryExe || (installDir && fs.existsSync(installDir))) {
            addCandidate({
              displayName: reg.DisplayName?.trim() || params.repoName,
              displayVersion: reg.DisplayVersion?.trim() || null,
              publisher: reg.Publisher?.trim() || null,
              installDir:
                installDir && fs.existsSync(installDir)
                  ? installDir
                  : path.dirname(primaryExe!),
              executablePath: primaryExe,
              detectedExecutables,
              uninstallCommand: reg.UninstallString?.trim() || null,
              subsystem: primaryExe
                ? detectExecutableSubsystem(primaryExe)
                : 'unknown',
              source: 'registry',
            });
          }
        }

        for (const dir of parsed.Dirs ?? []) {
          if (!dir.FullName || !fs.existsSync(dir.FullName)) continue;
          const detectedExecutables = findExecutablesRecursively(dir.FullName, 3);
          if (detectedExecutables.length === 0) continue;
          const primaryExe = pickPrimaryExecutable(
            detectedExecutables,
            params.repoName
          );
          if (!primaryExe) continue;
          const isWingetPkg = dir.FullName
            .toLowerCase()
            .includes('\\winget\\packages\\');
          addCandidate({
            displayName: dir.Name || params.repoName,
            displayVersion: null,
            publisher: null,
            installDir: dir.FullName,
            executablePath: primaryExe,
            detectedExecutables,
            uninstallCommand: null,
            subsystem: detectExecutableSubsystem(primaryExe),
            source: isWingetPkg ? 'winget' : 'filesystem',
          });
        }
      } catch {
        // Ignore malformed discovery payload and continue with PATH probe
      }
    }

    // Also probe PATH via where.exe for CLI tools (e.g. rg.exe, yt-dlp.exe, lazygit.exe)
    const pathNames = new Set<string>([
      params.repoName,
      params.repoName.replace(/[-_]/g, ''),
    ]);
    if (params.repoName.toLowerCase() === 'ripgrep') pathNames.add('rg');
    if (params.repoName.toLowerCase() === 'helix') pathNames.add('hx');

    for (const exeQuery of pathNames) {
      const whereRes = await execFileAsync('where.exe', [exeQuery]);
      if (whereRes.code !== 0 || !whereRes.stdout) continue;
      for (const line of whereRes.stdout.split(/\r?\n/)) {
        const exePath = line.trim();
        if (!exePath || !/\.exe$/i.test(exePath) || !fs.existsSync(exePath)) {
          continue;
        }
        addCandidate({
          displayName: path.basename(exePath),
          displayVersion: null,
          publisher: null,
          installDir: path.dirname(exePath),
          executablePath: exePath,
          detectedExecutables: [exePath],
          uninstallCommand: null,
          subsystem: detectExecutableSubsystem(exePath),
          source: 'path',
        });
      }
    }

    // Rank candidates that already resolved an executable higher
    candidates.sort((a, b) => {
      const score = (c: DiscoveredWindowsApp) =>
        (c.executablePath ? 50 : 0) +
        (c.source === 'registry' ? 20 : c.source === 'winget' ? 15 : 10);
      return score(b) - score(a);
    });

    return candidates;
  }

  async launchExecutable(executablePath: string): Promise<void> {
    await this.launchExecutableWithOptions({ executablePath });
  }

  async launchExecutableWithOptions(params: {
    executablePath: string;
    argsString?: string;
    asAdmin?: boolean;
  }): Promise<void> {
    const { executablePath, argsString = '', asAdmin = false } = params;
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Executable not found on disk: ${executablePath}`);
    }

    const parsedArgs = splitCommandArgs(argsString);
    const subsystem = detectExecutableSubsystem(executablePath);

    if (asAdmin) {
      const psAdmin =
        parsedArgs.length > 0
          ? `$a = ($env:ASTA_ARGS_JSON | ConvertFrom-Json); Start-Process -FilePath $env:ASTA_EXE_PATH -ArgumentList $a -Verb RunAs`
          : `Start-Process -FilePath $env:ASTA_EXE_PATH -Verb RunAs`;
      const res = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psAdmin],
        {
          ASTA_EXE_PATH: executablePath,
          ASTA_ARGS_JSON: JSON.stringify(parsedArgs),
        }
      );
      if (res.code !== 0) {
        throw new Error(
          res.stderr || 'Failed to launch with administrator privileges.'
        );
      }
      return;
    }

    if (subsystem === 'console') {
      const exeName = path.basename(executablePath);
      const exeDir = path.dirname(executablePath);
      const psCommand =
        parsedArgs.length > 0
          ? `$env:Path = $env:ASTA_EXE_DIR + ';' + $env:Path; Set-Location -LiteralPath $env:ASTA_EXE_DIR; $a = ($env:ASTA_ARGS_JSON | ConvertFrom-Json); & $env:ASTA_EXE_PATH @a`
          : `$env:Path = $env:ASTA_EXE_DIR + ';' + $env:Path; Set-Location -LiteralPath $env:ASTA_EXE_DIR; Write-Host "Ready: ${exeName}" -ForegroundColor Cyan; & $env:ASTA_EXE_PATH --help`;
      const child = spawn('powershell.exe', ['-NoExit', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ASTA_EXE_DIR: exeDir,
          ASTA_EXE_PATH: executablePath,
          ASTA_ARGS_JSON: JSON.stringify(parsedArgs),
        },
      });
      child.unref();
      return;
    }

    if (parsedArgs.length > 0) {
      const child = spawn(executablePath, parsedArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(executablePath),
      });
      child.unref();
      return;
    }

    const openError = await shell.openPath(executablePath);
    if (openError) {
      throw new Error(`Failed to launch executable: ${openError}`);
    }
  }

  startToolRun(params: {
    repoId: string;
    executablePath: string;
    argsString: string;
    workingDir?: string;
    onEvent: (event: ToolExecutionEvent) => void;
  }): { runId: string } {
    if (!fs.existsSync(params.executablePath)) {
      throw new Error(`Executable not found on disk: ${params.executablePath}`);
    }

    const runId = crypto.randomUUID();
    const args = splitCommandArgs(params.argsString);
    const cwd =
      params.workingDir && fs.existsSync(params.workingDir)
        ? params.workingDir
        : path.dirname(params.executablePath);

    const child = spawn(params.executablePath, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        PATH: `${path.dirname(params.executablePath)};${process.env.PATH ?? ''}`,
      },
    });

    const entry = { child, stoppedByUser: false };
    this.activeToolRuns.set(runId, entry);

    params.onEvent({
      runId,
      repoId: params.repoId,
      status: 'running',
      chunk: `$ "${path.basename(params.executablePath)}" ${params.argsString}\n`,
    });

    child.stdout?.on('data', (buf: Buffer) => {
      params.onEvent({
        runId,
        repoId: params.repoId,
        status: 'running',
        chunk: buf.toString(),
      });
    });

    child.stderr?.on('data', (buf: Buffer) => {
      params.onEvent({
        runId,
        repoId: params.repoId,
        status: 'running',
        chunk: buf.toString(),
      });
    });

    child.on('error', (err) => {
      this.activeToolRuns.delete(runId);
      params.onEvent({
        runId,
        repoId: params.repoId,
        status: 'failed',
        chunk: `\n[Process error] ${err.message}\n`,
        exitCode: 1,
      });
    });

    child.on('close', (code) => {
      this.activeToolRuns.delete(runId);
      params.onEvent({
        runId,
        repoId: params.repoId,
        status: entry.stoppedByUser
          ? 'stopped'
          : code === 0
            ? 'completed'
            : 'failed',
        exitCode: code,
      });
    });

    return { runId };
  }

  async stopToolRun(runId: string): Promise<void> {
    const entry = this.activeToolRuns.get(runId);
    if (!entry) return;
    entry.stoppedByUser = true;
    const pid = entry.child.pid;
    if (pid && process.platform === 'win32') {
      await execFileAsync('taskkill.exe', ['/pid', String(pid), '/t', '/f']);
    } else {
      entry.child.kill('SIGTERM');
    }
  }

  async runSystemUninstaller(uninstallCommand: string): Promise<void> {
    const child = spawn(uninstallCommand, {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  async uninstallViaWinget(wingetId: string): Promise<void> {
    const res = await execFileAsync('winget', [
      'uninstall',
      '--id',
      wingetId,
      '--exact',
      '--accept-source-agreements',
    ]);
    if (res.code !== 0) {
      throw new Error(res.stderr || res.stdout || `winget uninstall exited with ${res.code}`);
    }
  }

  async createDesktopShortcut(
    targetExePath: string,
    shortcutDisplayName: string
  ): Promise<string> {
    if (!fs.existsSync(targetExePath)) {
      throw new Error(`Target executable does not exist: ${targetExePath}`);
    }
    const safeTitle = shortcutDisplayName.replace(/[<>:"/\\|?*]/g, '_');
    const psScript = `
      $desktop = [Environment]::GetFolderPath('Desktop')
      $lnkPath = Join-Path $desktop ($env:ASTA_SHORTCUT_NAME + '.lnk')
      $ws = New-Object -ComObject WScript.Shell
      $sc = $ws.CreateShortcut($lnkPath)
      $sc.TargetPath = $env:ASTA_TARGET_EXE
      $sc.WorkingDirectory = Split-Path -Parent $env:ASTA_TARGET_EXE
      $sc.Save()
      Write-Output $lnkPath
    `;
    const res = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        ASTA_SHORTCUT_NAME: safeTitle,
        ASTA_TARGET_EXE: targetExePath,
      }
    );
    if (res.code !== 0) {
      throw new Error(`Failed to create shortcut: ${res.stderr}`);
    }
    return res.stdout.trim();
  }

  async openTerminal(cwd: string): Promise<void> {
    const targetDir = fs.existsSync(cwd) ? cwd : process.env.USERPROFILE || 'C:\\';
    const wtCheck = await execFileAsync('where.exe', ['wt.exe']);
    if (wtCheck.code === 0) {
      const child = spawn('wt.exe', ['-d', targetDir], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return;
    }

    const child = spawn(
      'powershell.exe',
      ['-NoExit', '-Command', 'Set-Location -LiteralPath $env:ASTA_CWD'],
      {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ASTA_CWD: targetDir },
      }
    );
    child.unref();
  }

  async openInEditor(cwd: string, editorCmd: string): Promise<void> {
    const cmd = editorCmd.trim() || 'code';
    const child = spawn(cmd, [cwd], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();
  }

  async searchWinget(query: string): Promise<WingetPackageMatch[]> {
    const res = await execFileAsync('winget', [
      'search',
      query,
      '--accept-source-agreements',
    ]);
    if (res.code !== 0 || !res.stdout) return [];

    const lines = res.stdout
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);

    const sepIdx = lines.findIndex((l) => /^-{5,}/.test(l.trim()));
    if (sepIdx < 1) return [];

    const matches: WingetPackageMatch[] = [];
    for (let i = sepIdx + 1; i < lines.length && matches.length < 15; i++) {
      const parts = lines[i].trim().split(/\s{2,}/);
      if (parts.length >= 3) {
        matches.push({
          name: parts[0],
          id: parts[1],
          version: parts[2],
        });
      }
    }
    return matches;
  }

  async installViaWinget(
    wingetId: string,
    onLog: (line: string) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'winget',
        [
          'install',
          '--id',
          wingetId,
          '--exact',
          '--accept-source-agreements',
          '--accept-package-agreements',
        ],
        { windowsHide: true }
      );

      child.stdout.on('data', (d: Buffer) => {
        for (const line of d.toString().split(/\r?\n/)) {
          if (line.trim()) onLog(line.trim());
        }
      });

      child.stderr.on('data', (d: Buffer) => {
        for (const line of d.toString().split(/\r?\n/)) {
          if (line.trim()) onLog(line.trim());
        }
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`winget exited with code ${code}`));
      });
    });
  }
}
