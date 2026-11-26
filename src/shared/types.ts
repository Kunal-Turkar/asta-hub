export type WindowsAssetKind = 'installer' | 'portable' | 'executable' | 'other';
export type AssetArch = 'x64' | 'arm64' | 'x86' | 'universal' | 'unknown';
export type InstallMode = 'installer' | 'portable' | 'winget';
export type ExecutableSubsystem = 'gui' | 'console' | 'unknown';
export type TaskKind =
  | 'sync'
  | 'download'
  | 'install'
  | 'extract'
  | 'clone'
  | 'pull'
  | 'winget'
  | 'setup';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

export interface ClassifiedAsset {
  id: number;
  name: string;
  downloadUrl: string;
  size: number;
  downloadCount: number;
  contentType: string;
  kind: WindowsAssetKind;
  arch: AssetArch;
  score: number;
  isRecommended: boolean;
  checksumUrl: string | null;
  checksumAssetName: string | null;
  reasons: string[];
}

export interface ReleaseInfo {
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  assets: ClassifiedAsset[];
  recommendedAssetId: number | null;
}

export interface LocalInstallRecord {
  repoId: string;
  mode: InstallMode;
  version: string;
  assetName: string;
  installDir: string;
  executablePath: string | null;
  detectedExecutables: string[];
  sha256: string | null;
  publisher: string | null;
  signatureStatus: string | null;
  subsystem?: ExecutableSubsystem;
  uninstallCommand?: string | null;
  cachedInstallerPath?: string | null;
  availableOnCurrentPc?: boolean;
  installedAt: string;
}

export interface ToolPreset {
  id: string;
  label: string;
  args: string;
  workingDir?: string | null;
}

export interface DiscoveredWindowsApp {
  displayName: string;
  displayVersion: string | null;
  publisher: string | null;
  installDir: string;
  executablePath: string | null;
  detectedExecutables: string[];
  uninstallCommand: string | null;
  subsystem: ExecutableSubsystem;
  source: 'registry' | 'path' | 'winget' | 'filesystem';
}

export interface ToolExecutionEvent {
  runId: string;
  repoId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  chunk?: string;
  exitCode?: number | null;
}

export interface StackCommand {
  label: string;
  command: string;
  kind: 'install' | 'dev' | 'build';
}

export interface DetectedStack {
  id: string;
  label: string;
  indicatorFile: string;
  commands: StackCommand[];
}

export interface LocalCloneRecord {
  repoId: string;
  clonePath: string;
  branch: string | null;
  lastPulledAt: string;
  stacks: DetectedStack[];
  availableOnCurrentPc?: boolean;
}

export interface RepoRecord {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  homepage: string | null;
  avatarUrl: string | null;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  topics: string[];
  defaultBranch: string;
  pushedAt: string | null;
  readmeMarkdown: string | null;
  etag: string | null;
  lastSyncedAt: string | null;
  isFavorite: boolean;
  notes: string;
  tags: string[];
  wingetId: string | null;
  preferredAssetPattern: string | null;
  toolPresets: ToolPreset[];
  latestRelease: ReleaseInfo | null;
  localInstall: LocalInstallRecord | null;
  localClone: LocalCloneRecord | null;
  hasUpdate: boolean;
}

export interface ActivityTask {
  id: string;
  repoId: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  progress: number;
  message: string;
  logs: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface AppSettings {
  libraryRoot: string;
  githubToken: string;
  enableWingetFallback: boolean;
  preferPortableAssets: boolean;
  keepDownloadedInstallers: boolean;
  preferredArch: 'auto' | 'x64' | 'arm64';
  preferredEditor: string;
  theme: 'dark' | 'light';
}

export interface PortableStatus {
  isPortableMode: boolean;
  baseDir: string;
  userDataDir: string;
  libraryRoot: string;
  portableGitPath: string | null;
  stats: {
    totalInstalled: number;
    portableReady: number;
    missingOnThisPc: number;
    cachedInstallers: number;
  };
}

export interface TrustInspectionResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  expectedSha256: string | null;
  checksumVerified: boolean | null;
  signatureStatus: string;
  signerSubject: string | null;
  signerIssuer: string | null;
}

export interface CatalogExportEntry {
  fullName: string;
  tags: string[];
  notes: string;
  isFavorite: boolean;
  wingetId?: string | null;
  preferredAssetPattern?: string | null;
}

export interface CatalogExport {
  version: 1;
  exportedAt: string;
  repos: CatalogExportEntry[];
}

export interface WingetPackageMatch {
  id: string;
  name: string;
  version: string;
}

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export interface AddRepoOptions {
  input: string;
  tags?: string[];
  notes?: string;
  wingetId?: string | null;
}

export interface InstallAssetRequest {
  repoId: string;
  assetId: number;
  trust?: TrustInspectionResult;
}

export interface DownloadForInspectionResult {
  stagedFilePath: string;
  asset: ClassifiedAsset;
  releaseTag: string;
  trust: TrustInspectionResult;
}
