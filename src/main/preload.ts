import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AstaBridgeApi } from '../shared/ipc';
import type { ActivityTask, ToolExecutionEvent } from '../shared/types';

const api: AstaBridgeApi = {
  listRepos: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_LIST),
  addRepo: (opts) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_ADD, opts),
  removeRepo: (repoId) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_REMOVE, repoId),
  syncRepo: (repoId) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SYNC_ONE, repoId),
  checkAllUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_CHECK_UPDATES),
  updateRepoMeta: (repoId, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_UPDATE_META, repoId, patch),
  loadStarterCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_LOAD_STARTER),
  importGitHubStars: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_IMPORT_STARS),
  exportCatalogJson: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_EXPORT_JSON),
  importCatalogJson: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_IMPORT_JSON, payload),

  downloadAndInspectAsset: (req) =>
    ipcRenderer.invoke(IPC_CHANNELS.RELEASE_DOWNLOAD_INSPECT, req),
  inspectCachedInstaller: (repoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.RELEASE_INSPECT_CACHED, repoId),
  installStagedAsset: (params) =>
    ipcRenderer.invoke(IPC_CHANNELS.RELEASE_INSTALL_STAGED, params),
  launchInstalledApp: (repoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_LAUNCH, repoId),
  launchAppWithArgs: (repoId, argsString, asAdmin) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_LAUNCH_WITH_ARGS, repoId, argsString, asAdmin),
  setInstalledExecutable: (repoId, executablePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SET_EXECUTABLE, repoId, executablePath),
  detectInstalledApps: (repoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_DETECT_INSTALLED, repoId),
  linkInstalledApp: (repoId, payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_LINK_INSTALLED, repoId, payload),
  runInstalledTool: (repoId, argsString, workingDir) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_RUN_TOOL_START, repoId, argsString, workingDir),
  stopInstalledTool: (runId) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_RUN_TOOL_STOP, runId),
  uninstallPortableApp: (repoId, runSystemUninstaller) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.APP_UNINSTALL_PORTABLE,
      repoId,
      runSystemUninstaller
    ),
  createDesktopShortcut: (repoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_CREATE_SHORTCUT, repoId),

  cloneRepo: (repoId, customParentDir) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_CLONE, repoId, customParentDir),
  pullRepo: (repoId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, repoId),
  runRepoCommand: (repoId, command) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_RUN_COMMAND, repoId, command),
  removeCloneRecord: (repoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOVE_CLONE_RECORD, repoId),

  searchWinget: (query) => ipcRenderer.invoke(IPC_CHANNELS.WINGET_SEARCH, query),
  installViaWinget: (repoId, wingetId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINGET_INSTALL, repoId, wingetId),

  openPath: (targetPath) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_PATH, targetPath),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
  openTerminal: (cwd) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_TERMINAL, cwd),
  openInEditor: (cwd) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EDITOR, cwd),
  pickDirectory: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PICK_DIRECTORY, defaultPath),
  pickExecutable: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PICK_EXECUTABLE, defaultPath),
  pickAnyFile: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PICK_ANY_FILE, defaultPath),
  getRateLimit: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_RATE_LIMIT),

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  getPortableStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PORTABLE_GET_STATUS),
  clearDownloadsCache: () => ipcRenderer.invoke(IPC_CHANNELS.CACHE_CLEAR_DOWNLOADS),

  listTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASKS_LIST),
  onTaskUpdate: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, task: ActivityTask) => {
      cb(task);
    };
    ipcRenderer.on(IPC_CHANNELS.EVENT_TASK_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TASK_UPDATE, listener);
  },
  onLibraryUpdated: (cb) => {
    const listener = () => cb();
    ipcRenderer.on(IPC_CHANNELS.EVENT_LIBRARY_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_LIBRARY_UPDATED, listener);
  },
  onToolOutput: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, ev: ToolExecutionEvent) => {
      cb(ev);
    };
    ipcRenderer.on(IPC_CHANNELS.EVENT_TOOL_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TOOL_OUTPUT, listener);
  },
};

contextBridge.exposeInMainWorld('asta', api);
