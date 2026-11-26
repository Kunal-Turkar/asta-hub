import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  classifyReleaseAssets,
  parseGitHubRepoInput,
} from '../shared/assetClassifier';
import { IPC_CHANNELS } from '../shared/ipc';
import { STARTER_CATALOG } from '../shared/starterCatalog';
import type {
  ActivityTask,
  AddRepoOptions,
  AppSettings,
  CatalogExport,
  ClassifiedAsset,
  DiscoveredWindowsApp,
  DownloadForInspectionResult,
  InstallAssetRequest,
  PortableStatus,
  RepoRecord,
  TaskKind,
  ToolExecutionEvent,
  ToolPreset,
  TrustInspectionResult,
} from '../shared/types';
import { LibraryDatabase } from './db';
import { DownloadService, sanitizeFileName } from './downloadService';
import { GitHubService } from './githubService';
import { GitService } from './gitService';
import { findPortableGitBinary } from './portablePaths';
import { detectExecutableSubsystem, WindowsService } from './windowsService';

function resolveHostArch(pref: AppSettings['preferredArch']): 'x64' | 'arm64' {
  if (pref === 'x64' || pref === 'arm64') return pref;
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

class TaskTracker {
  private tasks: ActivityTask[] = [];
  private getWindow: () => BrowserWindow | null;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
  }

  list(): ActivityTask[] {
    return [...this.tasks];
  }

  create(repoId: string, title: string, kind: TaskKind): ActivityTask {
    const task: ActivityTask = {
      id: crypto.randomUUID(),
      repoId,
      title,
      kind,
      status: 'running',
      progress: 0,
      message: 'Starting...',
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.tasks.unshift(task);
    if (this.tasks.length > 80) {
      this.tasks.length = 80;
    }
    this.emit(task);
    return task;
  }

  update(
    taskId: string,
    patch: Partial<Pick<ActivityTask, 'status' | 'progress' | 'message' | 'finishedAt'>>,
    logLine?: string
  ): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    Object.assign(task, patch);
    if (logLine) {
      task.logs.push(logLine);
      if (task.logs.length > 250) {
        task.logs.shift();
      }
    }
    this.emit(task);
  }

  private emit(task: ActivityTask): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.EVENT_TASK_UPDATE, {
        ...task,
        logs: [...task.logs],
      });
    }
  }
}

export function seedStarterCatalogIfEmpty(db: LibraryDatabase): number {
  const existing = db.listRepos();
  if (existing.length > 0) return 0;
  let added = 0;
  for (const seed of STARTER_CATALOG) {
    const parsed = parseGitHubRepoInput(seed.fullName);
    if (!parsed) continue;
    const id = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    db.upsertRepo({
      id,
      owner: parsed.owner,
      name: parsed.repo,
      fullName: `${parsed.owner}/${parsed.repo}`,
      description: seed.description,
      htmlUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
      avatarUrl: `https://github.com/${parsed.owner}.png?size=96`,
      tags: seed.tags,
      wingetId: seed.wingetId ?? null,
    });
    added++;
  }
  return added;
}

export function registerIpcHandlers(deps: {
  db: LibraryDatabase;
  github: GitHubService;
  downloader: DownloadService;
  windows: WindowsService;
  git: GitService;
  getWindow: () => BrowserWindow | null;
  portableInfo: {
    isPortableMode: boolean;
    baseDir: string;
    userDataDir: string;
    portableDataDir: string | null;
  };
}): void {
  const { db, github, downloader, windows, git, getWindow, portableInfo } = deps;
  const tracker = new TaskTracker(getWindow);

  const notifyLibraryUpdated = () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.EVENT_LIBRARY_UPDATED);
    }
  };

  const emitToolOutput = (event: ToolExecutionEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.EVENT_TOOL_OUTPUT, event);
    }
  };

  async function tryAutoLinkDiscoveredApp(
    repo: RepoRecord,
    previousKeys?: Set<string>
  ): Promise<boolean> {
    const matches = await windows.discoverInstalledApps({
      repoName: repo.name,
      owner: repo.owner,
      wingetId: repo.wingetId,
    });
    const best =
      (previousKeys
        ? matches.find(
            (m) =>
              m.executablePath &&
              !previousKeys.has(m.executablePath.toLowerCase())
          )
        : undefined) ?? matches.find((m) => Boolean(m.executablePath));

    if (!best?.executablePath) return false;
    const current = db.getRepo(repo.id);
    if (!current?.localInstall) return false;

    db.upsertInstall({
      ...current.localInstall,
      version: best.displayVersion || current.localInstall.version,
      installDir: best.installDir,
      executablePath: best.executablePath,
      detectedExecutables: best.detectedExecutables,
      publisher: best.publisher ?? current.localInstall.publisher,
      subsystem: best.subsystem,
      uninstallCommand: best.uninstallCommand,
    });
    notifyLibraryUpdated();
    return true;
  }

  function schedulePostInstallerDiscovery(
    repo: RepoRecord,
    previousKeys: Set<string>
  ): void {
    const delaysMs = [4000, 10000, 18000, 30000, 45000];
    let idx = 0;

    const tick = async () => {
      const current = db.getRepo(repo.id);
      if (!current?.localInstall || current.localInstall.executablePath) {
        return;
      }
      try {
        const linked = await tryAutoLinkDiscoveredApp(repo, previousKeys);
        if (linked) return;
      } catch {
        // ignore transient discovery error during install
      }
      idx++;
      if (idx < delaysMs.length) {
        setTimeout(tick, delaysMs[idx] - delaysMs[idx - 1]);
      }
    };

    setTimeout(tick, delaysMs[0]);
  }

  async function syncSingleRepoInternal(repoId: string): Promise<RepoRecord> {
    const existing = db.getRepo(repoId);
    if (!existing) {
      throw new Error(`Repository not found: ${repoId}`);
    }
    const settings = db.getSettings();
    const hostArch = resolveHostArch(settings.preferredArch);

    const bundle = await github.fetchFullRepoBundle({
      owner: existing.owner,
      repo: existing.name,
      token: settings.githubToken,
      etag: existing.etag,
      hostArch,
      preferredAssetPattern: existing.preferredAssetPattern,
      preferPortable: settings.preferPortableAssets,
    });

    const now = new Date().toISOString();
    if (bundle.notModified) {
      return db.upsertRepo({
        ...existing,
        etag: bundle.etag,
        lastSyncedAt: now,
        latestRelease:
          bundle.latestRelease !== undefined
            ? bundle.latestRelease
            : existing.latestRelease,
      });
    }

    const meta = bundle.metadata!;
    return db.upsertRepo({
      id: meta.fullName.toLowerCase(),
      owner: meta.owner,
      name: meta.name,
      fullName: meta.fullName,
      description: meta.description || existing.description,
      htmlUrl: meta.htmlUrl,
      homepage: meta.homepage,
      avatarUrl: meta.avatarUrl,
      stars: meta.stars,
      forks: meta.forks,
      language: meta.language,
      license: meta.license,
      topics: meta.topics,
      defaultBranch: meta.defaultBranch,
      pushedAt: meta.pushedAt,
      readmeMarkdown: bundle.readmeMarkdown ?? existing.readmeMarkdown,
      etag: bundle.etag,
      lastSyncedAt: now,
      latestRelease: bundle.latestRelease ?? null,
    });
  }

  ipcMain.handle(IPC_CHANNELS.LIBRARY_LIST, () => db.listRepos());

  ipcMain.handle(IPC_CHANNELS.LIBRARY_ADD, async (_ev, opts: AddRepoOptions) => {
    const parsed = parseGitHubRepoInput(opts.input);
    if (!parsed) {
      throw new Error(
        'Invalid GitHub repository. Enter a URL like https://github.com/owner/repo or owner/repo.'
      );
    }

    const settings = db.getSettings();
    const hostArch = resolveHostArch(settings.preferredArch);
    const id = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    const existing = db.getRepo(id);
    const task = tracker.create(id, `Sync ${parsed.owner}/${parsed.repo}`, 'sync');

    try {
      tracker.update(task.id, { progress: 35, message: 'Fetching GitHub metadata & releases...' });
      const bundle = await github.fetchFullRepoBundle({
        owner: parsed.owner,
        repo: parsed.repo,
        token: settings.githubToken,
        etag: existing?.etag,
        hostArch,
        preferredAssetPattern: existing?.preferredAssetPattern,
        preferPortable: settings.preferPortableAssets,
      });

      const meta = bundle.metadata;
      const saved = db.upsertRepo({
        id,
        owner: meta?.owner ?? parsed.owner,
        name: meta?.name ?? parsed.repo,
        fullName: meta?.fullName ?? `${parsed.owner}/${parsed.repo}`,
        description: meta?.description ?? existing?.description ?? '',
        htmlUrl: meta?.htmlUrl ?? `https://github.com/${parsed.owner}/${parsed.repo}`,
        homepage: meta?.homepage ?? existing?.homepage ?? null,
        avatarUrl:
          meta?.avatarUrl ??
          existing?.avatarUrl ??
          `https://github.com/${parsed.owner}.png?size=96`,
        stars: meta?.stars ?? existing?.stars ?? 0,
        forks: meta?.forks ?? existing?.forks ?? 0,
        language: meta?.language ?? existing?.language ?? null,
        license: meta?.license ?? existing?.license ?? null,
        topics: meta?.topics ?? existing?.topics ?? [],
        defaultBranch: meta?.defaultBranch ?? existing?.defaultBranch ?? 'main',
        pushedAt: meta?.pushedAt ?? existing?.pushedAt ?? null,
        readmeMarkdown: bundle.readmeMarkdown ?? existing?.readmeMarkdown ?? null,
        etag: bundle.etag,
        lastSyncedAt: new Date().toISOString(),
        tags: opts.tags?.length ? opts.tags : existing?.tags ?? [],
        notes: opts.notes ?? existing?.notes ?? '',
        wingetId: opts.wingetId ?? existing?.wingetId ?? null,
        latestRelease: bundle.latestRelease ?? existing?.latestRelease ?? null,
      });

      tracker.update(
        task.id,
        {
          status: 'completed',
          progress: 100,
          message: 'Repository added & synced',
          finishedAt: new Date().toISOString(),
        },
        `Synced ${saved.fullName}`
      );
      notifyLibraryUpdated();
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.update(
        task.id,
        { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
        msg
      );
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_REMOVE, (_ev, repoId: string) => {
    db.removeRepo(repoId);
    notifyLibraryUpdated();
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SYNC_ONE, async (_ev, repoId: string) => {
    const task = tracker.create(repoId, `Sync ${repoId}`, 'sync');
    try {
      tracker.update(task.id, { progress: 40, message: 'Checking GitHub...' });
      const updated = await syncSingleRepoInternal(repoId);
      tracker.update(task.id, {
        status: 'completed',
        progress: 100,
        message: 'Up to date',
        finishedAt: new Date().toISOString(),
      });
      notifyLibraryUpdated();
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.update(
        task.id,
        { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
        msg
      );
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_CHECK_UPDATES, async () => {
    const repos = db.listRepos();
    const task = tracker.create('library', 'Sync All & Check Updates', 'sync');
    let checked = 0;
    let updatesFound = 0;

    try {
      for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        const pct = Math.round(((i + 1) / Math.max(1, repos.length)) * 100);
        tracker.update(
          task.id,
          { progress: pct, message: `Checking ${repo.fullName} (${i + 1}/${repos.length})...` },
          `Checking ${repo.fullName}`
        );
        try {
          const synced = await syncSingleRepoInternal(repo.id);
          checked++;
          if (synced.hasUpdate) updatesFound++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tracker.update(task.id, {}, `Skipped ${repo.fullName}: ${msg}`);
          if (msg.toLowerCase().includes('rate limit')) {
            throw err;
          }
        }
      }
      tracker.update(task.id, {
        status: 'completed',
        progress: 100,
        message: `Checked ${checked} repos (${updatesFound} updates)`,
        finishedAt: new Date().toISOString(),
      });
      notifyLibraryUpdated();
      return { checked, updatesFound };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.update(
        task.id,
        { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
        msg
      );
      notifyLibraryUpdated();
      throw err;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_UPDATE_META,
    (
      _ev,
      repoId: string,
      patch: Partial<{
        tags: string[];
        notes: string;
        isFavorite: boolean;
        wingetId: string | null;
        preferredAssetPattern: string | null;
        toolPresets: ToolPreset[];
      }>
    ) => {
      const updated = db.updateRepoMeta(repoId, patch);
      notifyLibraryUpdated();
      return updated;
    }
  );

  ipcMain.handle(IPC_CHANNELS.LIBRARY_LOAD_STARTER, () => {
    let added = 0;
    for (const seed of STARTER_CATALOG) {
      const parsed = parseGitHubRepoInput(seed.fullName);
      if (!parsed) continue;
      const id = `${parsed.owner}/${parsed.repo}`.toLowerCase();
      if (db.getRepo(id)) continue;
      db.upsertRepo({
        id,
        owner: parsed.owner,
        name: parsed.repo,
        fullName: `${parsed.owner}/${parsed.repo}`,
        description: seed.description,
        htmlUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
        avatarUrl: `https://github.com/${parsed.owner}.png?size=96`,
        tags: seed.tags,
        wingetId: seed.wingetId ?? null,
      });
      added++;
    }
    notifyLibraryUpdated();
    return { added };
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_IMPORT_STARS, async () => {
    const settings = db.getSettings();
    const task = tracker.create('stars', 'Import GitHub Starred Repos', 'sync');
    try {
      tracker.update(task.id, { progress: 30, message: 'Fetching your GitHub stars...' });
      const starred = await github.fetchAuthenticatedUserStars(settings.githubToken);
      let imported = 0;
      let skipped = 0;
      for (const s of starred) {
        const id = s.fullName.toLowerCase();
        if (db.getRepo(id)) {
          skipped++;
          continue;
        }
        db.upsertRepo({
          id,
          owner: s.owner,
          name: s.name,
          fullName: s.fullName,
          description: s.description,
          htmlUrl: s.htmlUrl,
          homepage: s.homepage,
          avatarUrl: s.avatarUrl,
          stars: s.stars,
          forks: s.forks,
          language: s.language,
          license: s.license,
          topics: s.topics,
          defaultBranch: s.defaultBranch,
          pushedAt: s.pushedAt,
          tags: s.topics.slice(0, 3),
        });
        imported++;
      }
      tracker.update(task.id, {
        status: 'completed',
        progress: 100,
        message: `Imported ${imported} starred repos (${skipped} already in library)`,
        finishedAt: new Date().toISOString(),
      });
      notifyLibraryUpdated();
      return { imported, skipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.update(task.id, {
        status: 'failed',
        message: msg,
        finishedAt: new Date().toISOString(),
      });
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_EXPORT_JSON, async () => {
    const payload = db.exportCatalog();
    const win = getWindow();
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Export ASTA Hub Library Catalog',
      defaultPath: 'asta-hub-catalog.json',
      filters: [{ name: 'JSON Catalog', extensions: ['json'] }],
    });
    if (!res.canceled && res.filePath) {
      fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    }
    return payload;
  });

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_IMPORT_JSON,
    async (_ev, payload?: CatalogExport) => {
      let data = payload;
      if (!data) {
        const win = getWindow();
        const res = await dialog.showOpenDialog(win ?? undefined!, {
          title: 'Import ASTA Hub Library Catalog',
          properties: ['openFile'],
          filters: [{ name: 'JSON Catalog', extensions: ['json'] }],
        });
        if (res.canceled || res.filePaths.length === 0) {
          return { added: 0 };
        }
        const raw = fs.readFileSync(res.filePaths[0], 'utf8');
        data = JSON.parse(raw) as CatalogExport;
      }

      if (!data || !Array.isArray(data.repos)) {
        throw new Error('Invalid catalog JSON format.');
      }

      let added = 0;
      for (const entry of data.repos) {
        const parsed = parseGitHubRepoInput(entry.fullName);
        if (!parsed) continue;
        const id = `${parsed.owner}/${parsed.repo}`.toLowerCase();
        if (db.getRepo(id)) continue;
        db.upsertRepo({
          id,
          owner: parsed.owner,
          name: parsed.repo,
          fullName: `${parsed.owner}/${parsed.repo}`,
          description: '',
          htmlUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
          avatarUrl: `https://github.com/${parsed.owner}.png?size=96`,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          notes: typeof entry.notes === 'string' ? entry.notes : '',
          isFavorite: Boolean(entry.isFavorite),
          wingetId: entry.wingetId ?? null,
          preferredAssetPattern: entry.preferredAssetPattern ?? null,
        });
        added++;
      }

      notifyLibraryUpdated();
      return { added };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RELEASE_DOWNLOAD_INSPECT,
    async (
      _ev,
      req: InstallAssetRequest
    ): Promise<DownloadForInspectionResult> => {
      const repo = db.getRepo(req.repoId);
      if (!repo || !repo.latestRelease) {
        throw new Error('No release metadata cached for this repository. Sync first.');
      }
      const asset = repo.latestRelease.assets.find((a) => a.id === req.assetId);
      if (!asset) {
        throw new Error('Selected release asset was not found.');
      }

      const settings = db.getSettings();
      const downloadDir = path.join(
        settings.libraryRoot,
        'downloads',
        sanitizeFileName(repo.fullName.replace('/', '__'))
      );

      const task = tracker.create(
        repo.id,
        `Download ${asset.name}`,
        'download'
      );

      try {
        const dl = await downloader.downloadFile({
          url: asset.downloadUrl,
          destDir: downloadDir,
          fileName: asset.name,
          token: settings.githubToken,
          onProgress: (percent, done, total) => {
            const mbDone = (done / (1024 * 1024)).toFixed(1);
            const mbTotal = total > 0 ? ` / ${(total / (1024 * 1024)).toFixed(1)} MB` : ' MB';
            tracker.update(task.id, {
              progress: percent,
              message: `Downloading ${mbDone}${mbTotal}`,
            });
          },
        });

        tracker.update(task.id, {
          progress: 98,
          message: 'Inspecting SHA-256 & Authenticode signature...',
        });

        const expectedSha256 = await downloader.fetchExpectedChecksum(
          asset.checksumUrl,
          asset.name,
          settings.githubToken
        );

        const trust = await windows.inspectBinaryTrust({
          filePath: dl.filePath,
          fileName: asset.name,
          fileSize: dl.fileSize,
          sha256: dl.sha256,
          expectedSha256,
        });

        tracker.update(
          task.id,
          {
            status: 'completed',
            progress: 100,
            message: 'Downloaded & verified — ready to run',
            finishedAt: new Date().toISOString(),
          },
          `SHA-256: ${trust.sha256} (Signature: ${trust.signatureStatus})`
        );

        return {
          stagedFilePath: dl.filePath,
          asset,
          releaseTag: repo.latestRelease.tagName,
          trust,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracker.update(
          task.id,
          { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
          msg
        );
        throw err;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RELEASE_INSPECT_CACHED,
    async (_ev, repoId: string): Promise<DownloadForInspectionResult> => {
      const repo = db.getRepo(repoId);
      const cachedPath = repo?.localInstall?.cachedInstallerPath;
      if (!repo || !cachedPath || !fs.existsSync(cachedPath)) {
        throw new Error(
          'Cached installer file was not found in data/downloads/. Download it again from Windows Setup & Releases.'
        );
      }

      const fileName = path.basename(cachedPath);
      const fileSize = fs.statSync(cachedPath).size;
      const sha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(cachedPath))
        .digest('hex');

      const matchedAsset =
        repo.latestRelease?.assets.find(
          (a) => a.name.toLowerCase() === fileName.toLowerCase()
        ) ??
        ({
          id: -1,
          name: fileName,
          downloadUrl: repo.htmlUrl,
          size: fileSize,
          downloadCount: 0,
          contentType: 'application/octet-stream',
          kind: 'installer',
          arch: 'x64',
          score: 70,
          isRecommended: true,
          checksumUrl: null,
          checksumAssetName: null,
          reasons: ['Cached offline setup'],
        } satisfies ClassifiedAsset);

      const trust = await windows.inspectBinaryTrust({
        filePath: cachedPath,
        fileName,
        fileSize,
        sha256,
        expectedSha256: repo.localInstall?.sha256 ?? null,
      });

      return {
        stagedFilePath: cachedPath,
        asset: matchedAsset,
        releaseTag: repo.localInstall?.version ?? repo.latestRelease?.tagName ?? 'cached',
        trust,
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RELEASE_INSTALL_STAGED,
    async (
      _ev,
      params: {
        repoId: string;
        stagedFilePath: string;
        assetId: number;
        releaseTag: string;
        trust: TrustInspectionResult;
      }
    ) => {
      const repo = db.getRepo(params.repoId);
      if (!repo) {
        throw new Error('Repository context missing.');
      }
      const asset: ClassifiedAsset | undefined =
        params.assetId === -1
          ? {
              id: -1,
              name: path.basename(params.stagedFilePath),
              downloadUrl: repo.htmlUrl,
              size: params.trust.fileSize,
              downloadCount: 0,
              contentType: 'application/octet-stream',
              kind: 'installer',
              arch: 'x64',
              score: 70,
              isRecommended: true,
              checksumUrl: null,
              checksumAssetName: null,
              reasons: ['Cached offline setup'],
            }
          : repo.latestRelease?.assets.find((a) => a.id === params.assetId);
      if (!asset) {
        throw new Error('Asset metadata missing.');
      }

      const settings = db.getSettings();
      const task = tracker.create(
        repo.id,
        `Setup ${repo.name} (${asset.name})`,
        asset.kind === 'portable' ? 'extract' : 'install'
      );

      try {
        tracker.update(task.id, {
          progress: 40,
          message:
            asset.kind === 'installer'
              ? 'Launching Windows installer...'
              : 'Extracting & registering portable app...',
        });

        let previousKeys: Set<string> | null = null;
        if (asset.kind === 'installer') {
          try {
            const existingDiscovered = await windows.discoverInstalledApps({
              repoName: repo.name,
              owner: repo.owner,
              wingetId: repo.wingetId,
            });
            previousKeys = new Set(
              existingDiscovered
                .map((d) => d.executablePath?.toLowerCase())
                .filter((x): x is string => Boolean(x))
            );
          } catch {
            previousKeys = new Set();
          }
        }

        const record = await windows.installStagedAsset({
          repoId: repo.id,
          repoName: repo.name,
          libraryRoot: settings.libraryRoot,
          stagedFilePath: params.stagedFilePath,
          asset,
          releaseTag: params.releaseTag,
          trust: params.trust,
        });

        db.upsertInstall(record);

        if (
          !settings.keepDownloadedInstallers &&
          asset.kind !== 'installer' &&
          fs.existsSync(params.stagedFilePath)
        ) {
          try {
            fs.unlinkSync(params.stagedFilePath);
          } catch {
            // ignore cleanup error
          }
        }

        if (asset.kind === 'installer' && previousKeys) {
          schedulePostInstallerDiscovery(repo, previousKeys);
        }

        tracker.update(task.id, {
          status: 'completed',
          progress: 100,
          message:
            record.mode === 'portable'
              ? `Ready to launch (${record.version})`
              : `Installer launched (${record.version}) — scanning for executable`,
          finishedAt: new Date().toISOString(),
        });

        notifyLibraryUpdated();
        return db.getRepo(repo.id)!;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracker.update(
          task.id,
          { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
          msg
        );
        throw err;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.APP_LAUNCH, async (_ev, repoId: string) => {
    const repo = db.getRepo(repoId);
    if (!repo?.localInstall?.executablePath) {
      throw new Error('No launchable executable is configured for this app yet.');
    }
    await windows.launchExecutable(repo.localInstall.executablePath);
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_LAUNCH_WITH_ARGS,
    async (_ev, repoId: string, argsString: string, asAdmin?: boolean) => {
      const repo = db.getRepo(repoId);
      if (!repo?.localInstall?.executablePath) {
        throw new Error('No launchable executable is configured for this app yet.');
      }
      await windows.launchExecutableWithOptions({
        executablePath: repo.localInstall.executablePath,
        argsString,
        asAdmin: Boolean(asAdmin),
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_EXECUTABLE,
    (_ev, repoId: string, executablePath: string) => {
      const repo = db.getRepo(repoId);
      if (!repo?.localInstall) {
        throw new Error('No installed app record found.');
      }
      const detected = repo.localInstall.detectedExecutables.includes(executablePath)
        ? repo.localInstall.detectedExecutables
        : [executablePath, ...repo.localInstall.detectedExecutables];

      db.upsertInstall({
        ...repo.localInstall,
        executablePath,
        detectedExecutables: detected,
        subsystem: detectExecutableSubsystem(executablePath),
      });
      notifyLibraryUpdated();
      return db.getRepo(repoId)!;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_DETECT_INSTALLED,
    async (_ev, repoId: string): Promise<DiscoveredWindowsApp[]> => {
      const repo = db.getRepo(repoId);
      if (!repo) throw new Error(`Repository not found: ${repoId}`);
      return windows.discoverInstalledApps({
        repoName: repo.name,
        owner: repo.owner,
        wingetId: repo.wingetId,
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_LINK_INSTALLED,
    (
      _ev,
      repoId: string,
      payload: { discovered?: DiscoveredWindowsApp; executablePath?: string }
    ) => {
      const repo = db.getRepo(repoId);
      if (!repo) throw new Error(`Repository not found: ${repoId}`);

      const exePath =
        payload.executablePath ?? payload.discovered?.executablePath ?? null;
      if (!exePath) {
        throw new Error('Selected installation has no executable path.');
      }
      const installDir =
        payload.discovered?.installDir ?? path.dirname(exePath);
      const detectedExecutables =
        payload.discovered?.detectedExecutables.length
          ? payload.discovered.detectedExecutables
          : [exePath];
      const subsystem =
        payload.discovered?.subsystem ?? detectExecutableSubsystem(exePath);

      const existing = repo.localInstall;
      db.upsertInstall({
        repoId: repo.id,
        mode:
          existing?.mode ??
          (payload.discovered?.source === 'winget' ? 'winget' : 'installer'),
        version:
          existing?.version ??
          payload.discovered?.displayVersion ??
          repo.latestRelease?.tagName ??
          'linked',
        assetName:
          existing?.assetName ??
          payload.discovered?.displayName ??
          path.basename(exePath),
        installDir,
        executablePath: exePath,
        detectedExecutables,
        sha256: existing?.sha256 ?? null,
        publisher: payload.discovered?.publisher ?? existing?.publisher ?? null,
        signatureStatus:
          existing?.signatureStatus ??
          (payload.discovered ? 'SystemInstalled' : 'Linked'),
        subsystem,
        uninstallCommand:
          payload.discovered?.uninstallCommand ??
          existing?.uninstallCommand ??
          null,
        installedAt: existing?.installedAt ?? new Date().toISOString(),
      });

      notifyLibraryUpdated();
      return db.getRepo(repoId)!;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_RUN_TOOL_START,
    (_ev, repoId: string, argsString: string, workingDir?: string) => {
      const repo = db.getRepo(repoId);
      if (!repo?.localInstall?.executablePath) {
        throw new Error('No installed executable is linked for this tool.');
      }
      return windows.startToolRun({
        repoId: repo.id,
        executablePath: repo.localInstall.executablePath,
        argsString: argsString ?? '',
        workingDir,
        onEvent: emitToolOutput,
      });
    }
  );

  ipcMain.handle(IPC_CHANNELS.APP_RUN_TOOL_STOP, (_ev, runId: string) =>
    windows.stopToolRun(runId)
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_UNINSTALL_PORTABLE,
    async (_ev, repoId: string, runSystemUninstaller?: boolean) => {
      const repo = db.getRepo(repoId);
      if (!repo?.localInstall) {
        throw new Error('No local install record found.');
      }

      const settings = db.getSettings();
      const managedAppsRoot = path.resolve(settings.libraryRoot, 'apps');
      const safeRepoDir = path.resolve(
        managedAppsRoot,
        repo.id.replace(/[<>:"/\\|?*]/g, '__')
      );

      if (
        repo.localInstall.mode === 'portable' &&
        safeRepoDir.startsWith(managedAppsRoot + path.sep) &&
        fs.existsSync(safeRepoDir)
      ) {
        fs.rmSync(safeRepoDir, { recursive: true, force: true });
      } else if (runSystemUninstaller) {
        if (repo.localInstall.mode === 'winget' && repo.wingetId) {
          await windows.uninstallViaWinget(repo.wingetId);
        } else if (repo.localInstall.uninstallCommand) {
          await windows.runSystemUninstaller(repo.localInstall.uninstallCommand);
        }
      }

      db.removeInstall(repoId);
      notifyLibraryUpdated();
      return db.getRepo(repoId)!;
    }
  );

  ipcMain.handle(IPC_CHANNELS.APP_CREATE_SHORTCUT, async (_ev, repoId: string) => {
    const repo = db.getRepo(repoId);
    if (!repo?.localInstall?.executablePath) {
      throw new Error('No executable configured to create a shortcut.');
    }
    return windows.createDesktopShortcut(
      repo.localInstall.executablePath,
      repo.name
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_CLONE,
    async (_ev, repoId: string, customParentDir?: string) => {
      const repo = db.getRepo(repoId);
      if (!repo) throw new Error(`Repository not found: ${repoId}`);
      const settings = db.getSettings();
      const cloneUrl = `${repo.htmlUrl}.git`;

      const task = tracker.create(repo.id, `Clone ${repo.fullName}`, 'clone');

      try {
        const record = await git.cloneRepo({
          repoId: repo.id,
          owner: repo.owner,
          name: repo.name,
          cloneUrl,
          libraryRoot: settings.libraryRoot,
          customParentDir,
          onProgress: (percent, line) => {
            tracker.update(
              task.id,
              {
                progress: percent >= 0 ? percent : 50,
                message: line,
              },
              line
            );
          },
        });

        db.upsertClone(record);
        tracker.update(task.id, {
          status: 'completed',
          progress: 100,
          message: `Cloned to ${record.clonePath}`,
          finishedAt: new Date().toISOString(),
        });
        notifyLibraryUpdated();
        return db.getRepo(repo.id)!;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracker.update(
          task.id,
          { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
          msg
        );
        throw err;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_ev, repoId: string) => {
    const repo = db.getRepo(repoId);
    if (!repo?.localClone) throw new Error('Repository is not cloned locally.');
    const task = tracker.create(repo.id, `Pull ${repo.fullName}`, 'pull');

    try {
      const record = await git.pullRepo({
        repoId: repo.id,
        clonePath: repo.localClone.clonePath,
        onProgress: (percent, line) => {
          tracker.update(
            task.id,
            { progress: percent >= 0 ? percent : 50, message: line },
            line
          );
        },
      });
      db.upsertClone(record);
      tracker.update(task.id, {
        status: 'completed',
        progress: 100,
        message: 'Repository pulled',
        finishedAt: new Date().toISOString(),
      });
      notifyLibraryUpdated();
      return db.getRepo(repo.id)!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.update(
        task.id,
        { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
        msg
      );
      throw err;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_RUN_COMMAND,
    async (_ev, repoId: string, command: string) => {
      const repo = db.getRepo(repoId);
      if (!repo?.localClone) {
        throw new Error('Clone the repository first before running setup commands.');
      }
      const task = tracker.create(
        repo.id,
        `Run "${command}" in ${repo.name}`,
        'setup'
      );

      try {
        const result = await git.runSetupCommand({
          clonePath: repo.localClone.clonePath,
          command,
          onLog: (line) => {
            tracker.update(task.id, { progress: -1, message: line }, line);
          },
        });
        tracker.update(task.id, {
          status: result.exitCode === 0 ? 'completed' : 'failed',
          progress: 100,
          message:
            result.exitCode === 0
              ? `Command exited cleanly (0)`
              : `Exited with code ${result.exitCode}`,
          finishedAt: new Date().toISOString(),
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracker.update(
          task.id,
          { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
          msg
        );
        throw err;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_REMOVE_CLONE_RECORD, (_ev, repoId: string) => {
    db.removeClone(repoId);
    notifyLibraryUpdated();
    return db.getRepo(repoId)!;
  });

  ipcMain.handle(IPC_CHANNELS.WINGET_SEARCH, (_ev, query: string) =>
    windows.searchWinget(query)
  );

  ipcMain.handle(
    IPC_CHANNELS.WINGET_INSTALL,
    async (_ev, repoId: string, wingetId: string) => {
      const repo = db.getRepo(repoId);
      if (!repo) throw new Error(`Repository not found: ${repoId}`);
      const task = tracker.create(repo.id, `Winget install ${wingetId}`, 'winget');

      try {
        await windows.installViaWinget(wingetId, (line) => {
          tracker.update(task.id, { progress: -1, message: line }, line);
        });
        db.updateRepoMeta(repoId, { wingetId });
        db.upsertInstall({
          repoId: repo.id,
          mode: 'winget',
          version: repo.latestRelease?.tagName ?? 'winget',
          assetName: wingetId,
          installDir: 'winget-managed',
          executablePath: null,
          detectedExecutables: [],
          sha256: null,
          publisher: 'Winget',
          signatureStatus: 'WingetVerified',
          subsystem: 'unknown',
          installedAt: new Date().toISOString(),
        });
        await tryAutoLinkDiscoveredApp(repo).catch(() => false);
        tracker.update(task.id, {
          status: 'completed',
          progress: 100,
          message: `Installed ${wingetId} via Winget`,
          finishedAt: new Date().toISOString(),
        });
        notifyLibraryUpdated();
        return db.getRepo(repoId)!;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracker.update(
          task.id,
          { status: 'failed', message: msg, finishedAt: new Date().toISOString() },
          msg
        );
        throw err;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_PATH, async (_ev, targetPath: string) => {
    const err = await shell.openPath(targetPath);
    if (err) throw new Error(err);
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_ev, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP/HTTPS external links are allowed.');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_TERMINAL, (_ev, cwd: string) =>
    windows.openTerminal(cwd)
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EDITOR, (_ev, cwd: string) => {
    const settings = db.getSettings();
    return windows.openInEditor(cwd, settings.preferredEditor);
  });

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_PICK_DIRECTORY,
    async (_ev, defaultPath?: string) => {
      const win = getWindow();
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_PICK_EXECUTABLE,
    async (_ev, defaultPath?: string) => {
      const win = getWindow();
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        defaultPath,
        properties: ['openFile'],
        filters: [{ name: 'Windows Executables', extensions: ['exe', 'bat', 'cmd'] }],
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_PICK_ANY_FILE,
    async (_ev, defaultPath?: string) => {
      const win = getWindow();
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        defaultPath,
        properties: ['openFile'],
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    }
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_RATE_LIMIT, () =>
    github.getRateLimit()
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => db.getSettings());

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE,
    (_ev, patch: Partial<AppSettings>) => {
      const prev = db.getSettings();
      const updated = db.updateSettings(patch);
      if (
        patch.preferPortableAssets !== undefined &&
        patch.preferPortableAssets !== prev.preferPortableAssets
      ) {
        const hostArch = resolveHostArch(updated.preferredArch);
        for (const repo of db.listRepos()) {
          if (!repo.latestRelease || repo.latestRelease.assets.length === 0) {
            continue;
          }
          const rawLike = repo.latestRelease.assets.map((a) => ({
            id: a.id,
            name: a.name,
            browser_download_url: a.downloadUrl,
            size: a.size,
            download_count: a.downloadCount,
            content_type: a.contentType,
          }));
          const reclassified = classifyReleaseAssets(
            rawLike,
            hostArch,
            repo.preferredAssetPattern,
            { preferPortable: updated.preferPortableAssets }
          );
          db.updateRepoMeta(repo.id, {
            latestRelease: {
              ...repo.latestRelease,
              assets: reclassified.assets,
              recommendedAssetId: reclassified.recommendedAssetId,
            },
          });
        }
        notifyLibraryUpdated();
      }
      return updated;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABLE_GET_STATUS,
    (): PortableStatus => {
      const settings = db.getSettings();
      const repos = db.listRepos();
      const installed = repos.filter((r) => Boolean(r.localInstall));
      const portableReady = installed.filter(
        (r) =>
          r.localInstall?.mode === 'portable' &&
          r.localInstall.availableOnCurrentPc !== false
      ).length;
      const missingOnThisPc = repos.filter(
        (r) =>
          r.localInstall?.availableOnCurrentPc === false ||
          r.localClone?.availableOnCurrentPc === false
      ).length;
      const cachedInstallers = installed.filter(
        (r) =>
          Boolean(r.localInstall?.cachedInstallerPath) &&
          fs.existsSync(r.localInstall!.cachedInstallerPath!)
      ).length;

      return {
        isPortableMode: portableInfo.isPortableMode,
        baseDir: portableInfo.baseDir,
        userDataDir: portableInfo.userDataDir,
        libraryRoot: settings.libraryRoot,
        portableGitPath: findPortableGitBinary(portableInfo.portableDataDir),
        stats: {
          totalInstalled: installed.length,
          portableReady,
          missingOnThisPc,
          cachedInstallers,
        },
      };
    }
  );

  ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR_DOWNLOADS, () => {
    const settings = db.getSettings();
    const dlDir = path.join(settings.libraryRoot, 'downloads');
    if (!fs.existsSync(dlDir)) return { removedBytes: 0, filesRemoved: 0 };

    let removedBytes = 0;
    let filesRemoved = 0;

    function measure(target: string) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const full = path.join(target, entry.name);
        if (entry.isDirectory()) {
          measure(full);
        } else {
          removedBytes += fs.statSync(full).size;
          filesRemoved++;
        }
      }
    }

    measure(dlDir);
    fs.rmSync(dlDir, { recursive: true, force: true });
    fs.mkdirSync(dlDir, { recursive: true });
    return { removedBytes, filesRemoved };
  });

  ipcMain.handle(IPC_CHANNELS.TASKS_LIST, () => tracker.list());
}
