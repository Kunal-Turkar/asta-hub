import type {
  ActivityTask,
  AddRepoOptions,
  AppSettings,
  CatalogExport,
  DiscoveredWindowsApp,
  DownloadForInspectionResult,
  InstallAssetRequest,
  PortableStatus,
  RateLimitInfo,
  RepoRecord,
  ToolExecutionEvent,
  ToolPreset,
  TrustInspectionResult,
  WingetPackageMatch,
} from './types';

export const IPC_CHANNELS = {
  LIBRARY_LIST: 'library:list',
  LIBRARY_ADD: 'library:add',
  LIBRARY_REMOVE: 'library:remove',
  LIBRARY_SYNC_ONE: 'library:syncOne',
  LIBRARY_CHECK_UPDATES: 'library:checkUpdates',
  LIBRARY_UPDATE_META: 'library:updateMeta',
  LIBRARY_LOAD_STARTER: 'library:loadStarter',
  LIBRARY_IMPORT_STARS: 'library:importStars',
  LIBRARY_EXPORT_JSON: 'library:exportJson',
  LIBRARY_IMPORT_JSON: 'library:importJson',

  RELEASE_DOWNLOAD_INSPECT: 'release:downloadAndInspect',
  RELEASE_INSPECT_CACHED: 'release:inspectCachedInstaller',
  RELEASE_INSTALL_STAGED: 'release:installStaged',
  APP_LAUNCH: 'app:launch',
  APP_LAUNCH_WITH_ARGS: 'app:launchWithArgs',
  APP_SET_EXECUTABLE: 'app:setExecutable',
  APP_DETECT_INSTALLED: 'app:detectInstalled',
  APP_LINK_INSTALLED: 'app:linkInstalled',
  APP_RUN_TOOL_START: 'app:runToolStart',
  APP_RUN_TOOL_STOP: 'app:runToolStop',
  APP_UNINSTALL_PORTABLE: 'app:uninstallPortable',
  APP_CREATE_SHORTCUT: 'app:createShortcut',

  GIT_CLONE: 'git:clone',
  GIT_PULL: 'git:pull',
  GIT_RUN_COMMAND: 'git:runCommand',
  GIT_REMOVE_CLONE_RECORD: 'git:removeCloneRecord',

  WINGET_SEARCH: 'winget:search',
  WINGET_INSTALL: 'winget:install',

  SYSTEM_OPEN_PATH: 'system:openPath',
  SYSTEM_OPEN_EXTERNAL: 'system:openExternal',
  SYSTEM_OPEN_TERMINAL: 'system:openTerminal',
  SYSTEM_OPEN_EDITOR: 'system:openEditor',
  SYSTEM_PICK_DIRECTORY: 'system:pickDirectory',
  SYSTEM_PICK_EXECUTABLE: 'system:pickExecutable',
  SYSTEM_PICK_ANY_FILE: 'system:pickAnyFile',
  SYSTEM_GET_RATE_LIMIT: 'system:getRateLimit',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  PORTABLE_GET_STATUS: 'portable:getStatus',
  CACHE_CLEAR_DOWNLOADS: 'cache:clearDownloads',

  TASKS_LIST: 'tasks:list',
  EVENT_TASK_UPDATE: 'event:taskUpdate',
  EVENT_LIBRARY_UPDATED: 'event:libraryUpdated',
  EVENT_TOOL_OUTPUT: 'event:toolOutput',
} as const;

export interface AstaBridgeApi {
  listRepos: () => Promise<RepoRecord[]>;
  addRepo: (opts: AddRepoOptions) => Promise<RepoRecord>;
  removeRepo: (repoId: string) => Promise<void>;
  syncRepo: (repoId: string) => Promise<RepoRecord>;
  checkAllUpdates: () => Promise<{ checked: number; updatesFound: number }>;
  updateRepoMeta: (
    repoId: string,
    patch: Partial<{
      tags: string[];
      notes: string;
      isFavorite: boolean;
      wingetId: string | null;
      preferredAssetPattern: string | null;
      toolPresets: ToolPreset[];
    }>
  ) => Promise<RepoRecord>;
  loadStarterCatalog: () => Promise<{ added: number }>;
  importGitHubStars: () => Promise<{ imported: number; skipped: number }>;
  exportCatalogJson: () => Promise<CatalogExport>;
  importCatalogJson: (payload?: CatalogExport) => Promise<{ added: number }>;

  downloadAndInspectAsset: (
    req: InstallAssetRequest
  ) => Promise<DownloadForInspectionResult>;
  inspectCachedInstaller: (repoId: string) => Promise<DownloadForInspectionResult>;
  installStagedAsset: (params: {
    repoId: string;
    stagedFilePath: string;
    assetId: number;
    releaseTag: string;
    trust: TrustInspectionResult;
  }) => Promise<RepoRecord>;
  launchInstalledApp: (repoId: string) => Promise<void>;
  launchAppWithArgs: (
    repoId: string,
    argsString: string,
    asAdmin?: boolean
  ) => Promise<void>;
  setInstalledExecutable: (repoId: string, executablePath: string) => Promise<RepoRecord>;
  detectInstalledApps: (repoId: string) => Promise<DiscoveredWindowsApp[]>;
  linkInstalledApp: (
    repoId: string,
    payload: { discovered?: DiscoveredWindowsApp; executablePath?: string }
  ) => Promise<RepoRecord>;
  runInstalledTool: (
    repoId: string,
    argsString: string,
    workingDir?: string
  ) => Promise<{ runId: string }>;
  stopInstalledTool: (runId: string) => Promise<void>;
  uninstallPortableApp: (
    repoId: string,
    runSystemUninstaller?: boolean
  ) => Promise<RepoRecord>;
  createDesktopShortcut: (repoId: string) => Promise<string>;

  cloneRepo: (repoId: string, customParentDir?: string) => Promise<RepoRecord>;
  pullRepo: (repoId: string) => Promise<RepoRecord>;
  runRepoCommand: (repoId: string, command: string) => Promise<{ exitCode: number; output: string }>;
  removeCloneRecord: (repoId: string) => Promise<RepoRecord>;

  searchWinget: (query: string) => Promise<WingetPackageMatch[]>;
  installViaWinget: (repoId: string, wingetId: string) => Promise<RepoRecord>;

  openPath: (targetPath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openTerminal: (cwd: string) => Promise<void>;
  openInEditor: (cwd: string) => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  pickExecutable: (defaultPath?: string) => Promise<string | null>;
  pickAnyFile: (defaultPath?: string) => Promise<string | null>;
  getRateLimit: () => Promise<RateLimitInfo>;

  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  getPortableStatus: () => Promise<PortableStatus>;
  clearDownloadsCache: () => Promise<{ removedBytes: number; filesRemoved: number }>;

  listTasks: () => Promise<ActivityTask[]>;
  onTaskUpdate: (cb: (task: ActivityTask) => void) => () => void;
  onLibraryUpdated: (cb: () => void) => () => void;
  onToolOutput: (cb: (event: ToolExecutionEvent) => void) => () => void;
}
