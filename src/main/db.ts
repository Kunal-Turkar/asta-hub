import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import type {
  AppSettings,
  CatalogExport,
  LocalCloneRecord,
  LocalInstallRecord,
  ReleaseInfo,
  RepoRecord,
} from '../shared/types';
import {
  fromPortablePath,
  resolveConfiguredLibraryRoot,
  toPortablePath,
} from './portablePaths';

function normalizeVersionTag(v: string): string {
  return v.trim().replace(/^v/i, '').toLowerCase();
}

export function isUpdateAvailable(
  installedVersion: string | null | undefined,
  latestTag: string | null | undefined
): boolean {
  if (!installedVersion || !latestTag) return false;
  return normalizeVersionTag(installedVersion) !== normalizeVersionTag(latestTag);
}

function resolveSqlWasmPath(): string {
  const resolved = require.resolve('sql.js/dist/sql-wasm.wasm');
  const unpacked = resolved.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpacked)) return unpacked;
  return resolved;
}

export class LibraryDatabase {
  private db!: Database;
  private dbPath: string;
  private defaultSettings: AppSettings;
  private portableDataDir: string | null;

  constructor(
    dbPath: string,
    defaultSettings: AppSettings,
    portableDataDir: string | null = null
  ) {
    this.dbPath = dbPath;
    this.defaultSettings = defaultSettings;
    this.portableDataDir = portableDataDir;
  }

  async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const wasmBytes = fs.readFileSync(resolveSqlWasmPath());
    const wasmBinary = wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength
    );
    const SQL = await initSqlJs({ wasmBinary });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createSchema();
    this.persist();
  }

  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
    }
  }

  private createSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        html_url TEXT NOT NULL,
        homepage TEXT,
        avatar_url TEXT,
        stars INTEGER NOT NULL DEFAULT 0,
        forks INTEGER NOT NULL DEFAULT 0,
        language TEXT,
        license TEXT,
        topics_json TEXT NOT NULL DEFAULT '[]',
        default_branch TEXT NOT NULL DEFAULT 'main',
        pushed_at TEXT,
        readme_markdown TEXT,
        etag TEXT,
        last_synced_at TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        winget_id TEXT,
        preferred_asset_pattern TEXT,
        tool_presets_json TEXT NOT NULL DEFAULT '[]',
        latest_release_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_installs (
        repo_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        version TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        install_dir TEXT NOT NULL,
        executable_path TEXT,
        detected_executables_json TEXT NOT NULL DEFAULT '[]',
        sha256 TEXT,
        publisher TEXT,
        signature_status TEXT,
        subsystem TEXT DEFAULT 'unknown',
        uninstall_command TEXT,
        cached_installer_path TEXT,
        installed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_clones (
        repo_id TEXT PRIMARY KEY,
        clone_path TEXT NOT NULL,
        branch TEXT,
        last_pulled_at TEXT NOT NULL,
        stacks_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Safe forward migrations for existing databases
    this.ensureColumn('repos', 'tool_presets_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('local_installs', 'subsystem', "TEXT DEFAULT 'unknown'");
    this.ensureColumn('local_installs', 'uninstall_command', 'TEXT');
    this.ensureColumn('local_installs', 'cached_installer_path', 'TEXT');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.queryAll<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private persist(): void {
    const exported = this.db.export();
    const tmpPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.from(exported));
    fs.renameSync(tmpPath, this.dbPath);
  }

  private queryAll<T extends Record<string, SqlValue>>(
    sql: string,
    params: SqlValue[] = []
  ): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  private queryOne<T extends Record<string, SqlValue>>(
    sql: string,
    params: SqlValue[] = []
  ): T | null {
    const rows = this.queryAll<T>(sql, params);
    return rows[0] ?? null;
  }

  private runStmt(sql: string, params: SqlValue[] = []): void {
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
    this.persist();
  }

  getEffectiveLibraryRoot(): string {
    const row = this.queryOne<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'libraryRoot'"
    );
    const raw = row?.value ?? this.defaultSettings.libraryRoot;
    return resolveConfiguredLibraryRoot(raw, this.portableDataDir);
  }

  getSettings(): AppSettings {
    const rows = this.queryAll<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      libraryRoot: resolveConfiguredLibraryRoot(
        map.get('libraryRoot') ?? this.defaultSettings.libraryRoot,
        this.portableDataDir
      ),
      githubToken: map.get('githubToken') ?? this.defaultSettings.githubToken,
      enableWingetFallback:
        map.has('enableWingetFallback')
          ? map.get('enableWingetFallback') === 'true'
          : this.defaultSettings.enableWingetFallback,
      preferPortableAssets:
        map.has('preferPortableAssets')
          ? map.get('preferPortableAssets') === 'true'
          : this.defaultSettings.preferPortableAssets,
      keepDownloadedInstallers:
        map.has('keepDownloadedInstallers')
          ? map.get('keepDownloadedInstallers') === 'true'
          : this.defaultSettings.keepDownloadedInstallers,
      preferredArch:
        (map.get('preferredArch') as AppSettings['preferredArch']) ??
        this.defaultSettings.preferredArch,
      preferredEditor:
        map.get('preferredEditor') ?? this.defaultSettings.preferredEditor,
      theme:
        (map.get('theme') as AppSettings['theme']) ?? this.defaultSettings.theme,
    };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const entries = Object.entries(patch) as [keyof AppSettings, AppSettings[keyof AppSettings]][];
    for (const [key, val] of entries) {
      if (val === undefined) continue;
      let storedValue = String(val);
      if (key === 'libraryRoot' && this.portableDataDir) {
        const resolvedNew = path.resolve(storedValue);
        const resolvedPortable = path.resolve(this.portableDataDir);
        if (resolvedNew.toLowerCase() === resolvedPortable.toLowerCase()) {
          storedValue = './data';
        }
      }
      this.db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, storedValue]
      );
    }
    this.persist();
    return this.getSettings();
  }

  private mapRowToRepo(
    row: Record<string, SqlValue>,
    installMap: Map<string, LocalInstallRecord>,
    cloneMap: Map<string, LocalCloneRecord>,
    libraryRoot: string
  ): RepoRecord {
    const id = String(row.id);
    const latestRelease = row.latest_release_json
      ? (JSON.parse(String(row.latest_release_json)) as ReleaseInfo)
      : null;
    const localInstall = installMap.get(id) ?? null;
    const localClone = cloneMap.get(id) ?? null;
    const rawPresets = JSON.parse(
      String(row.tool_presets_json ?? '[]')
    ) as RepoRecord['toolPresets'];
    const toolPresets = rawPresets.map((p) => ({
      ...p,
      workingDir: fromPortablePath(p.workingDir, libraryRoot),
    }));

    return {
      id,
      owner: String(row.owner),
      name: String(row.name),
      fullName: String(row.full_name),
      description: String(row.description ?? ''),
      htmlUrl: String(row.html_url),
      homepage: row.homepage ? String(row.homepage) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      stars: Number(row.stars ?? 0),
      forks: Number(row.forks ?? 0),
      language: row.language ? String(row.language) : null,
      license: row.license ? String(row.license) : null,
      topics: JSON.parse(String(row.topics_json ?? '[]')) as string[],
      defaultBranch: String(row.default_branch ?? 'main'),
      pushedAt: row.pushed_at ? String(row.pushed_at) : null,
      readmeMarkdown: row.readme_markdown ? String(row.readme_markdown) : null,
      etag: row.etag ? String(row.etag) : null,
      lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
      isFavorite: Number(row.is_favorite ?? 0) === 1,
      notes: String(row.notes ?? ''),
      tags: JSON.parse(String(row.tags_json ?? '[]')) as string[],
      wingetId: row.winget_id ? String(row.winget_id) : null,
      preferredAssetPattern: row.preferred_asset_pattern
        ? String(row.preferred_asset_pattern)
        : null,
      toolPresets,
      latestRelease,
      localInstall,
      localClone,
      hasUpdate: isUpdateAvailable(
        localInstall?.version,
        latestRelease?.tagName
      ),
    };
  }

  private loadInstallMap(libraryRoot: string): Map<string, LocalInstallRecord> {
    const rows = this.queryAll<Record<string, SqlValue>>(
      'SELECT * FROM local_installs'
    );
    const map = new Map<string, LocalInstallRecord>();
    for (const r of rows) {
      const repoId = String(r.repo_id);
      const mode = String(r.mode) as LocalInstallRecord['mode'];
      const installDir =
        fromPortablePath(String(r.install_dir), libraryRoot) ?? String(r.install_dir);
      const executablePath = fromPortablePath(
        r.executable_path ? String(r.executable_path) : null,
        libraryRoot
      );
      const rawDetected = JSON.parse(
        String(r.detected_executables_json ?? '[]')
      ) as string[];
      const detectedExecutables = rawDetected
        .map((p) => fromPortablePath(p, libraryRoot) ?? p)
        .filter(Boolean);
      const cachedInstallerPath = fromPortablePath(
        r.cached_installer_path ? String(r.cached_installer_path) : null,
        libraryRoot
      );

      const availableOnCurrentPc = executablePath
        ? fs.existsSync(executablePath)
        : mode === 'portable'
          ? fs.existsSync(installDir)
          : false;

      map.set(repoId, {
        repoId,
        mode,
        version: String(r.version),
        assetName: String(r.asset_name),
        installDir,
        executablePath,
        detectedExecutables,
        sha256: r.sha256 ? String(r.sha256) : null,
        publisher: r.publisher ? String(r.publisher) : null,
        signatureStatus: r.signature_status ? String(r.signature_status) : null,
        subsystem: (r.subsystem ? String(r.subsystem) : 'unknown') as LocalInstallRecord['subsystem'],
        uninstallCommand: r.uninstall_command ? String(r.uninstall_command) : null,
        cachedInstallerPath,
        availableOnCurrentPc,
        installedAt: String(r.installed_at),
      });
    }
    return map;
  }

  private loadCloneMap(libraryRoot: string): Map<string, LocalCloneRecord> {
    const rows = this.queryAll<Record<string, SqlValue>>(
      'SELECT * FROM local_clones'
    );
    const map = new Map<string, LocalCloneRecord>();
    for (const r of rows) {
      const repoId = String(r.repo_id);
      const clonePath =
        fromPortablePath(String(r.clone_path), libraryRoot) ?? String(r.clone_path);
      map.set(repoId, {
        repoId,
        clonePath,
        branch: r.branch ? String(r.branch) : null,
        lastPulledAt: String(r.last_pulled_at),
        stacks: JSON.parse(
          String(r.stacks_json ?? '[]')
        ) as LocalCloneRecord['stacks'],
        availableOnCurrentPc: fs.existsSync(clonePath),
      });
    }
    return map;
  }

  listRepos(): RepoRecord[] {
    const libraryRoot = this.getEffectiveLibraryRoot();
    const rows = this.queryAll<Record<string, SqlValue>>(
      'SELECT * FROM repos ORDER BY is_favorite DESC, stars DESC, full_name ASC'
    );
    const installMap = this.loadInstallMap(libraryRoot);
    const cloneMap = this.loadCloneMap(libraryRoot);
    return rows.map((row) =>
      this.mapRowToRepo(row, installMap, cloneMap, libraryRoot)
    );
  }

  getRepo(repoId: string): RepoRecord | null {
    const libraryRoot = this.getEffectiveLibraryRoot();
    const row = this.queryOne<Record<string, SqlValue>>(
      'SELECT * FROM repos WHERE id = ?',
      [repoId.toLowerCase()]
    );
    if (!row) return null;
    return this.mapRowToRepo(
      row,
      this.loadInstallMap(libraryRoot),
      this.loadCloneMap(libraryRoot),
      libraryRoot
    );
  }

  upsertRepo(repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    description: string;
    htmlUrl: string;
    homepage?: string | null;
    avatarUrl?: string | null;
    stars?: number;
    forks?: number;
    language?: string | null;
    license?: string | null;
    topics?: string[];
    defaultBranch?: string;
    pushedAt?: string | null;
    readmeMarkdown?: string | null;
    etag?: string | null;
    lastSyncedAt?: string | null;
    isFavorite?: boolean;
    notes?: string;
    tags?: string[];
    wingetId?: string | null;
    preferredAssetPattern?: string | null;
    toolPresets?: RepoRecord['toolPresets'];
    latestRelease?: ReleaseInfo | null;
  }): RepoRecord {
    const id = repo.id.toLowerCase();
    const existing = this.getRepo(id);
    const now = new Date().toISOString();

    const mergedTags = repo.tags ?? existing?.tags ?? [];
    const mergedNotes = repo.notes ?? existing?.notes ?? '';
    const mergedFavorite =
      repo.isFavorite !== undefined
        ? repo.isFavorite
        : (existing?.isFavorite ?? false);
    const mergedWinget =
      repo.wingetId !== undefined
        ? repo.wingetId
        : (existing?.wingetId ?? null);
    const mergedPattern =
      repo.preferredAssetPattern !== undefined
        ? repo.preferredAssetPattern
        : (existing?.preferredAssetPattern ?? null);
    const mergedPresets = (repo.toolPresets ?? existing?.toolPresets ?? []).map(
      (p) => ({
        ...p,
        workingDir: toPortablePath(
          p.workingDir,
          this.getEffectiveLibraryRoot()
        ),
      })
    );

    this.runStmt(
      `INSERT INTO repos (
        id, owner, name, full_name, description, html_url, homepage, avatar_url,
        stars, forks, language, license, topics_json, default_branch, pushed_at,
        readme_markdown, etag, last_synced_at, is_favorite, notes, tags_json,
        winget_id, preferred_asset_pattern, tool_presets_json, latest_release_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner = excluded.owner,
        name = excluded.name,
        full_name = excluded.full_name,
        description = excluded.description,
        html_url = excluded.html_url,
        homepage = excluded.homepage,
        avatar_url = excluded.avatar_url,
        stars = excluded.stars,
        forks = excluded.forks,
        language = excluded.language,
        license = excluded.license,
        topics_json = excluded.topics_json,
        default_branch = excluded.default_branch,
        pushed_at = excluded.pushed_at,
        readme_markdown = COALESCE(excluded.readme_markdown, repos.readme_markdown),
        etag = COALESCE(excluded.etag, repos.etag),
        last_synced_at = COALESCE(excluded.last_synced_at, repos.last_synced_at),
        is_favorite = excluded.is_favorite,
        notes = excluded.notes,
        tags_json = excluded.tags_json,
        winget_id = excluded.winget_id,
        preferred_asset_pattern = excluded.preferred_asset_pattern,
        tool_presets_json = excluded.tool_presets_json,
        latest_release_json = COALESCE(excluded.latest_release_json, repos.latest_release_json)`,
      [
        id,
        repo.owner,
        repo.name,
        repo.fullName,
        repo.description,
        repo.htmlUrl,
        repo.homepage ?? existing?.homepage ?? null,
        repo.avatarUrl ?? existing?.avatarUrl ?? null,
        repo.stars ?? existing?.stars ?? 0,
        repo.forks ?? existing?.forks ?? 0,
        repo.language ?? existing?.language ?? null,
        repo.license ?? existing?.license ?? null,
        JSON.stringify(repo.topics ?? existing?.topics ?? []),
        repo.defaultBranch ?? existing?.defaultBranch ?? 'main',
        repo.pushedAt ?? existing?.pushedAt ?? null,
        repo.readmeMarkdown !== undefined
          ? repo.readmeMarkdown
          : (existing?.readmeMarkdown ?? null),
        repo.etag !== undefined ? repo.etag : (existing?.etag ?? null),
        repo.lastSyncedAt !== undefined
          ? repo.lastSyncedAt
          : (existing?.lastSyncedAt ?? null),
        mergedFavorite ? 1 : 0,
        mergedNotes,
        JSON.stringify(mergedTags),
        mergedWinget,
        mergedPattern,
        JSON.stringify(mergedPresets),
        repo.latestRelease !== undefined
          ? repo.latestRelease
            ? JSON.stringify(repo.latestRelease)
            : null
          : existing?.latestRelease
            ? JSON.stringify(existing.latestRelease)
            : null,
        now,
      ]
    );

    return this.getRepo(id)!;
  }

  updateRepoMeta(
    repoId: string,
    patch: Partial<{
      tags: string[];
      notes: string;
      isFavorite: boolean;
      wingetId: string | null;
      preferredAssetPattern: string | null;
      toolPresets: RepoRecord['toolPresets'];
      latestRelease: ReleaseInfo | null;
    }>
  ): RepoRecord {
    const existing = this.getRepo(repoId);
    if (!existing) {
      throw new Error(`Repository not found: ${repoId}`);
    }
    return this.upsertRepo({
      ...existing,
      tags: patch.tags ?? existing.tags,
      notes: patch.notes ?? existing.notes,
      isFavorite: patch.isFavorite ?? existing.isFavorite,
      wingetId:
        patch.wingetId !== undefined ? patch.wingetId : existing.wingetId,
      preferredAssetPattern:
        patch.preferredAssetPattern !== undefined
          ? patch.preferredAssetPattern
          : existing.preferredAssetPattern,
      toolPresets: patch.toolPresets ?? existing.toolPresets,
      latestRelease:
        patch.latestRelease !== undefined
          ? patch.latestRelease
          : existing.latestRelease,
    });
  }

  removeRepo(repoId: string): void {
    const id = repoId.toLowerCase();
    this.db.run('DELETE FROM local_installs WHERE repo_id = ?', [id]);
    this.db.run('DELETE FROM local_clones WHERE repo_id = ?', [id]);
    this.db.run('DELETE FROM repos WHERE id = ?', [id]);
    this.persist();
  }

  upsertInstall(record: LocalInstallRecord): void {
    const libraryRoot = this.getEffectiveLibraryRoot();
    const storedInstallDir =
      toPortablePath(record.installDir, libraryRoot) ?? record.installDir;
    const storedExe = toPortablePath(record.executablePath, libraryRoot);
    const storedDetected = record.detectedExecutables.map(
      (p) => toPortablePath(p, libraryRoot) ?? p
    );
    const storedCachedInstaller = toPortablePath(
      record.cachedInstallerPath,
      libraryRoot
    );

    this.runStmt(
      `INSERT INTO local_installs (
        repo_id, mode, version, asset_name, install_dir, executable_path,
        detected_executables_json, sha256, publisher, signature_status,
        subsystem, uninstall_command, cached_installer_path, installed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET
        mode = excluded.mode,
        version = excluded.version,
        asset_name = excluded.asset_name,
        install_dir = excluded.install_dir,
        executable_path = excluded.executable_path,
        detected_executables_json = excluded.detected_executables_json,
        sha256 = excluded.sha256,
        publisher = excluded.publisher,
        signature_status = excluded.signature_status,
        subsystem = excluded.subsystem,
        uninstall_command = excluded.uninstall_command,
        cached_installer_path = excluded.cached_installer_path,
        installed_at = excluded.installed_at`,
      [
        record.repoId.toLowerCase(),
        record.mode,
        record.version,
        record.assetName,
        storedInstallDir,
        storedExe,
        JSON.stringify(storedDetected),
        record.sha256,
        record.publisher,
        record.signatureStatus,
        record.subsystem ?? 'unknown',
        record.uninstallCommand ?? null,
        storedCachedInstaller,
        record.installedAt,
      ]
    );
  }

  removeInstall(repoId: string): void {
    this.runStmt('DELETE FROM local_installs WHERE repo_id = ?', [
      repoId.toLowerCase(),
    ]);
  }

  upsertClone(record: LocalCloneRecord): void {
    const libraryRoot = this.getEffectiveLibraryRoot();
    const storedClonePath =
      toPortablePath(record.clonePath, libraryRoot) ?? record.clonePath;

    this.runStmt(
      `INSERT INTO local_clones (
        repo_id, clone_path, branch, last_pulled_at, stacks_json
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET
        clone_path = excluded.clone_path,
        branch = excluded.branch,
        last_pulled_at = excluded.last_pulled_at,
        stacks_json = excluded.stacks_json`,
      [
        record.repoId.toLowerCase(),
        storedClonePath,
        record.branch,
        record.lastPulledAt,
        JSON.stringify(record.stacks),
      ]
    );
  }

  removeClone(repoId: string): void {
    this.runStmt('DELETE FROM local_clones WHERE repo_id = ?', [
      repoId.toLowerCase(),
    ]);
  }

  exportCatalog(): CatalogExport {
    const repos = this.listRepos();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      repos: repos.map((r) => ({
        fullName: r.fullName,
        tags: r.tags,
        notes: r.notes,
        isFavorite: r.isFavorite,
        wingetId: r.wingetId,
        preferredAssetPattern: r.preferredAssetPattern,
      })),
    };
  }
}
