import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Code2,
  Download,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  HardDrive,
  Monitor,
  Package,
  Play,
  Radar,
  RefreshCw,
  Search,
  Star,
  Tag,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ClassifiedAsset,
  DiscoveredWindowsApp,
  RepoRecord,
  ToolPreset,
  WingetPackageMatch,
} from '../../shared/types';
import {
  formatBytes,
  formatCount,
  formatRelativeTime,
  getRecommendedAsset,
} from '../utils/format';
import { UseToolTab, type ToolConsoleState } from './UseToolTab';

export type DetailTab = 'overview' | 'use' | 'windows' | 'clone' | 'notes';

interface RepoDetailModalProps {
  repo: RepoRecord | null;
  initialTab?: DetailTab;
  defaultLibraryRoot: string;
  toolConsole: ToolConsoleState;
  busy: boolean;
  wingetEnabled: boolean;
  onClose: () => void;
  onSync: (repo: RepoRecord) => void;
  onToggleFavorite: (repo: RepoRecord) => void;
  onRemoveRepo: (repoId: string) => void;
  onDownloadAndInspect: (repo: RepoRecord, assetId: number) => void;
  onLaunchApp: (repo: RepoRecord) => void;
  onLaunchWithArgs: (repo: RepoRecord, args: string, asAdmin: boolean) => void;
  onRunInsideTool: (repo: RepoRecord, args: string, workingDir: string) => void;
  onStopTool: (runId: string) => void;
  onClearToolOutput: (repoId: string) => void;
  onLinkDiscovered: (
    repoId: string,
    payload: { discovered?: DiscoveredWindowsApp; executablePath?: string }
  ) => Promise<void>;
  onSetExecutable: (repoId: string, exePath: string) => void;
  onCreateShortcut: (repoId: string) => void;
  onUninstallPortable: (repoId: string, runSystemUninstaller?: boolean) => void;
  onCloneRepo: (repo: RepoRecord, customParentDir?: string) => void;
  onPullRepo: (repo: RepoRecord) => void;
  onRunCommand: (
    repoId: string,
    command: string
  ) => Promise<{ exitCode: number; output: string }>;
  onUpdateMeta: (
    repoId: string,
    patch: Partial<{
      tags: string[];
      notes: string;
      wingetId: string | null;
      preferredAssetPattern: string | null;
      toolPresets: ToolPreset[];
    }>
  ) => void;
  onInstallWinget: (repoId: string, wingetId: string) => void;
  onRunCachedSetup: (repo: RepoRecord) => void;
}

export function RepoDetailModal({
  repo,
  initialTab = 'overview',
  defaultLibraryRoot,
  toolConsole,
  busy,
  wingetEnabled,
  onClose,
  onSync,
  onToggleFavorite,
  onRemoveRepo,
  onDownloadAndInspect,
  onLaunchApp,
  onLaunchWithArgs,
  onRunInsideTool,
  onStopTool,
  onClearToolOutput,
  onLinkDiscovered,
  onSetExecutable,
  onCreateShortcut,
  onUninstallPortable,
  onCloneRepo,
  onPullRepo,
  onRunCommand,
  onUpdateMeta,
  onInstallWinget,
  onRunCachedSetup,
}: RepoDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [notesDraft, setNotesDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [wingetDraft, setWingetDraft] = useState('');
  const [patternDraft, setPatternDraft] = useState('');
  const [wingetQuery, setWingetQuery] = useState('');
  const [wingetResults, setWingetResults] = useState<WingetPackageMatch[]>([]);
  const [searchingWinget, setSearchingWinget] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<{
    command: string;
    exitCode: number | null;
    output: string;
  } | null>(null);
  const [runningCmd, setRunningCmd] = useState(false);
  const [autoSyncedId, setAutoSyncedId] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) return;
    setTab(initialTab);
    setNotesDraft(repo.notes);
    setTagsDraft(repo.tags.join(', '));
    setWingetDraft(repo.wingetId ?? '');
    setPatternDraft(repo.preferredAssetPattern ?? '');
    setWingetQuery(repo.name);
    setWingetResults([]);
    setCmdOutput(null);

    if (!repo.lastSyncedAt && autoSyncedId !== repo.id) {
      setAutoSyncedId(repo.id);
      onSync(repo);
    }
  }, [repo?.id, initialTab]);

  if (!repo) return null;

  const recommendedAsset = getRecommendedAsset(repo);

  const handleSaveMeta = () => {
    const parsedTags = tagsDraft
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onUpdateMeta(repo.id, {
      notes: notesDraft,
      tags: [...new Set(parsedTags)],
      wingetId: wingetDraft.trim() || null,
      preferredAssetPattern: patternDraft.trim() || null,
    });
  };

  const handleSearchWinget = async () => {
    if (!wingetQuery.trim()) return;
    setSearchingWinget(true);
    try {
      const matches = await window.asta.searchWinget(wingetQuery.trim());
      setWingetResults(matches);
    } finally {
      setSearchingWinget(false);
    }
  };

  const handleRunSetupCommand = async (command: string) => {
    setRunningCmd(true);
    setCmdOutput({ command, exitCode: null, output: 'Running...' });
    try {
      const res = await onRunCommand(repo.id, command);
      setCmdOutput({
        command,
        exitCode: res.exitCode,
        output: res.output || `(Exited with code ${res.exitCode})`,
      });
    } catch (err) {
      setCmdOutput({
        command,
        exitCode: 1,
        output: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunningCmd(false);
    }
  };

  const handleChooseCustomCloneFolder = async () => {
    const dir = await window.asta.pickDirectory();
    if (dir) {
      onCloneRepo(repo, dir);
    }
  };

  const handleBrowseExecutable = async () => {
    const file = await window.asta.pickExecutable(repo.localInstall?.installDir);
    if (file) {
      onSetExecutable(repo.id, file);
    }
  };

  const renderAssetBadge = (asset: ClassifiedAsset) => {
    if (asset.kind === 'installer') {
      return (
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400">
          Installer
        </span>
      );
    }
    if (asset.kind === 'portable') {
      return (
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400">
          Portable
        </span>
      );
    }
    if (asset.kind === 'executable') {
      return (
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
          EXE
        </span>
      );
    }
    return (
      <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        Other
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {repo.avatarUrl ? (
                <img
                  src={repo.avatarUrl}
                  alt={repo.owner}
                  className="h-12 w-12 shrink-0 rounded-2xl border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-base font-bold text-indigo-400">
                  {repo.name.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                    {repo.fullName}
                  </h2>
                  {repo.latestRelease && (
                    <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-400">
                      {repo.latestRelease.tagName}
                    </span>
                  )}
                  {repo.hasUpdate && (
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      Update Available
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                  {repo.description || 'No description cached yet.'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleFavorite(repo)}
                title="Toggle Favorite"
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <Star
                  className={`h-4 w-4 ${repo.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSync(repo)}
                title="Refresh from GitHub"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => window.asta.openExternal(repo.htmlUrl)}
                title="Open on GitHub"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveRepo(repo.id);
                  onClose();
                }}
                title="Remove from Library"
                className="rounded-xl border border-slate-200 p-2 text-rose-400 hover:bg-rose-500/10 dark:border-slate-800"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-900">
              {(
                [
                  ['overview', 'Overview & README'],
                  ['use', repo.localInstall?.executablePath ? 'Use Tool ●' : 'Use / Link Tool'],
                  ['windows', 'Windows Setup & Releases'],
                  ['clone', 'Clone & Dev Setup'],
                  ['notes', 'Notes & Tags'],
                ] as [DetailTab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    tab === id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : id === 'use' && repo.localInstall?.executablePath
                        ? 'text-emerald-500 hover:text-emerald-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {repo.localInstall?.executablePath &&
                repo.localInstall.availableOnCurrentPc !== false && (
                <>
                  <button
                    type="button"
                    onClick={() => onLaunchApp(repo)}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Launch
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('use')}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Use Inside Tool
                  </button>
                </>
              )}

              {recommendedAsset && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDownloadAndInspect(repo, recommendedAsset.id)}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {repo.hasUpdate
                    ? `Update (${recommendedAsset.name})`
                    : `Setup (${recommendedAsset.kind})`}
                </button>
              )}

              {repo.localClone ? (
                <button
                  type="button"
                  onClick={() => window.asta.openPath(repo.localClone!.clonePath)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open Clone
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCloneRepo(repo)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <FolderGit2 className="h-3.5 w-3.5" />
                  Clone Repo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              <div className="lg:col-span-3">
                {repo.readmeMarkdown ? (
                  <div className="readme-prose rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => {
                          const targetUrl =
                            href && /^https?:\/\//i.test(href)
                              ? href
                              : href
                                ? `https://github.com/${repo.fullName}/blob/${repo.defaultBranch}/${href.replace(/^\/+/, '')}`
                                : repo.htmlUrl;
                          return (
                            <a
                              href={targetUrl}
                              onClick={(e) => {
                                e.preventDefault();
                                window.asta.openExternal(targetUrl);
                              }}
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {repo.readmeMarkdown}
                    </Markdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      README not loaded yet.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSync(repo)}
                      className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      Fetch README &amp; Releases
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <h3 className="mb-3 font-bold uppercase tracking-wider text-slate-400">
                    Repository Info
                  </h3>
                  <dl className="space-y-2.5">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Stars</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white">
                        {formatCount(repo.stars)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Forks</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white">
                        {formatCount(repo.forks)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Language</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white">
                        {repo.language ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">License</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white">
                        {repo.license ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Last Synced</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white">
                        {formatRelativeTime(repo.lastSyncedAt)}
                      </dd>
                    </div>
                  </dl>

                  {repo.homepage && (
                    <button
                      type="button"
                      onClick={() => window.asta.openExternal(repo.homepage!)}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 font-semibold text-indigo-500 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Visit Homepage
                    </button>
                  )}
                </div>

                {repo.topics.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <h3 className="mb-2 font-bold uppercase tracking-wider text-slate-400">
                      Topics
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {repo.topics.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'use' && (
            <UseToolTab
              repo={repo}
              defaultLibraryRoot={defaultLibraryRoot}
              consoleState={toolConsole}
              onLaunchApp={onLaunchApp}
              onLaunchWithArgs={onLaunchWithArgs}
              onRunInsideTool={onRunInsideTool}
              onStopTool={onStopTool}
              onClearOutput={onClearToolOutput}
              onSetExecutable={onSetExecutable}
              onLinkDiscovered={onLinkDiscovered}
              onCreateShortcut={onCreateShortcut}
              onSavePresets={(id, presets) =>
                onUpdateMeta(id, { toolPresets: presets })
              }
              onRunCachedSetup={onRunCachedSetup}
            />
          )}

          {tab === 'windows' && (
            <div className="space-y-6">
              {repo.localInstall && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                        <Monitor className="h-4 w-4" />
                        Installed Locally ({repo.localInstall.mode}) —{' '}
                        {repo.localInstall.version}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Asset: {repo.localInstall.assetName} &bull; Path:{' '}
                        <span className="font-mono">{repo.localInstall.installDir}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {repo.localInstall.executablePath &&
                      repo.localInstall.availableOnCurrentPc !== false ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setTab('use')}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            <Terminal className="h-3.5 w-3.5" />
                            Use Inside Tool
                          </button>
                          <button
                            type="button"
                            onClick={() => onLaunchApp(repo)}
                            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-white px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-slate-700"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Launch
                          </button>
                          <button
                            type="button"
                            onClick={() => onCreateShortcut(repo.id)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Desktop Shortcut
                          </button>
                        </>
                      ) : (
                        <>
                          {repo.localInstall.cachedInstallerPath && (
                            <button
                              type="button"
                              onClick={() => onRunCachedSetup(repo)}
                              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                              Run Cached Setup
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setTab('use')}
                            className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                          >
                            <Radar className="h-3.5 w-3.5" />
                            Scan &amp; Link Installed .exe
                          </button>
                        </>
                      )}
                      {repo.localInstall.mode !== 'winget' && (
                        <button
                          type="button"
                          onClick={() =>
                            window.asta.openPath(repo.localInstall!.installDir)
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Open Folder
                        </button>
                      )}
                      {(repo.localInstall.uninstallCommand ||
                        repo.localInstall.mode === 'winget') && (
                        <button
                          type="button"
                          onClick={() => onUninstallPortable(repo.id, true)}
                          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                        >
                          Uninstall App
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onUninstallPortable(repo.id, false)}
                        className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10"
                      >
                        {repo.localInstall.mode === 'portable'
                          ? 'Delete Portable App'
                          : 'Untrack'}
                      </button>
                    </div>
                  </div>

                  {repo.localInstall.mode === 'portable' && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-emerald-500/20 pt-3 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Launch Executable:
                      </span>
                      {repo.localInstall.detectedExecutables.length > 0 ? (
                        <select
                          value={repo.localInstall.executablePath ?? ''}
                          onChange={(e) => onSetExecutable(repo.id, e.target.value)}
                          className="max-w-md flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {repo.localInstall.detectedExecutables.map((exe) => (
                            <option key={exe} value={exe}>
                              {exe}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">No .exe detected</span>
                      )}
                      <button
                        type="button"
                        onClick={handleBrowseExecutable}
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Browse .exe...
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      GitHub Release Assets
                      {repo.latestRelease ? ` (${repo.latestRelease.tagName})` : ''}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Windows installers, portable archives, and standalone executables are automatically classified and ranked.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSync(repo)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                    Check Releases
                  </button>
                </div>

                {!repo.latestRelease ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No GitHub release binaries found yet. Use Winget below or switch to Clone &amp; Dev Setup.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {repo.latestRelease.assets
                      .filter((a) => a.score > -150)
                      .map((asset) => (
                        <div
                          key={asset.id}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 ${
                            asset.isRecommended
                              ? 'border-indigo-500/50 bg-indigo-500/5'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {asset.name}
                              </span>
                              {asset.isRecommended && (
                                <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Recommended
                                </span>
                              )}
                              {renderAssetBadge(asset)}
                              <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {asset.arch}
                              </span>
                              {asset.checksumAssetName && (
                                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500">
                                  SHA256 Available
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {formatBytes(asset.size)} &bull; {formatCount(asset.downloadCount)} downloads
                              {asset.reasons.length > 0 && ` • ${asset.reasons.join(' · ')}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateMeta(repo.id, {
                                  preferredAssetPattern: asset.name.replace(
                                    repo.latestRelease?.tagName ?? '',
                                    ''
                                  ),
                                })
                              }
                              title="Prefer similar asset pattern on updates"
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Prefer
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onDownloadAndInspect(repo, asset.id)}
                              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download &amp; Setup
                            </button>
                          </div>
                        </div>
                      ))}

                    {repo.latestRelease.assets.filter((a) => a.score > -150).length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-800">
                        Release {repo.latestRelease.tagName} has no Windows-compatible assets detected.
                      </div>
                    )}
                  </div>
                )}

                {repo.latestRelease?.body && (
                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Release Notes
                    </h4>
                    <div className="readme-prose max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {repo.latestRelease.body}
                      </Markdown>
                    </div>
                  </div>
                )}
              </div>

              {wingetEnabled && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Package className="h-4 w-4 text-cyan-400" />
                        Windows Package Manager (Winget)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Use Microsoft Winget if you prefer system-wide package management or if GitHub Releases lack a Windows installer.
                      </p>
                    </div>
                    {repo.wingetId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onInstallWinget(repo.id, repo.wingetId!)}
                        className="rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                      >
                        Install {repo.wingetId}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      value={wingetQuery}
                      onChange={(e) => setWingetQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchWinget()}
                      placeholder="Search Winget package ID..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      disabled={searchingWinget}
                      onClick={handleSearchWinget}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {searchingWinget ? 'Searching...' : 'Search Winget'}
                    </button>
                  </div>

                  {wingetResults.length > 0 && (
                    <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                      {wingetResults.map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {pkg.name}
                            </span>{' '}
                            <span className="font-mono text-[11px] text-slate-400">
                              ({pkg.id} · {pkg.version})
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onInstallWinget(repo.id, pkg.id)}
                            className="rounded-lg bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
                          >
                            Install
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'clone' && (
            <div className="space-y-6">
              {!repo.localClone || repo.localClone.availableOnCurrentPc === false ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-800">
                  <FolderGit2 className="h-10 w-10 text-indigo-400" />
                  <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                    {repo.localClone
                      ? `Clone Missing on This PC — Re-Clone ${repo.fullName}`
                      : `Clone ${repo.fullName} Locally`}
                  </h3>
                  <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                    {repo.localClone
                      ? `Recorded on another PC at ${repo.localClone.clonePath}. Re-clone it into this PC's library folder or pick a custom directory.`
                      : 'Clone the repository source code with Git, inspect its technology stack automatically, and run setup commands with preview confirmation.'}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCloneRepo(repo)}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      <FolderGit2 className="h-4 w-4" />
                      Clone to Default Library Folder
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleChooseCustomCloneFolder}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Choose Custom Folder...
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-violet-400">
                          <GitBranch className="h-4 w-4" />
                          Cloned ({repo.localClone.branch ?? 'HEAD'})
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-300">
                          {repo.localClone.clonePath}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPullRepo(repo)}
                          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Git Pull
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.asta.openInEditor(repo.localClone!.clonePath)
                          }
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          Open in Editor
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.asta.openTerminal(repo.localClone!.clonePath)
                          }
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          Open Terminal
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.asta.openPath(repo.localClone!.clonePath)
                          }
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Explorer
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/50">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <HardDrive className="h-4 w-4 text-indigo-400" />
                      Detected Project Stacks &amp; Quick Setup Commands
                    </h3>

                    {repo.localClone.stacks.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No standard build files detected at repository root. Open Terminal or Editor to inspect manually.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {repo.localClone.stacks.map((stack) => (
                          <div
                            key={stack.id}
                            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="mb-2.5 flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {stack.label}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {stack.indicatorFile}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {stack.commands.map((cmd) => (
                                <button
                                  key={cmd.command}
                                  type="button"
                                  disabled={runningCmd}
                                  onClick={() => handleRunSetupCommand(cmd.command)}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs transition hover:border-indigo-500/50 hover:bg-indigo-500/10 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                                >
                                  <Play className="h-3 w-3 text-indigo-400" />
                                  <span className="font-semibold">{cmd.label}:</span>
                                  <code className="font-mono text-[11px] text-indigo-400">
                                    {cmd.command}
                                  </code>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {cmdOutput && (
                      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs text-slate-200">
                        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                          <span>$ {cmdOutput.command}</span>
                          {cmdOutput.exitCode !== null && (
                            <span
                              className={
                                cmdOutput.exitCode === 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }
                            >
                              exit {cmdOutput.exitCode}
                            </span>
                          )}
                        </div>
                        <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                          {cmdOutput.output}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="mx-auto max-w-2xl space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Tag className="h-3.5 w-3.5" />
                  Collections / Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  placeholder="DevTools, CLI, Productivity"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Preferred Windows Asset Pattern (optional regex or substring)
                </label>
                <input
                  type="text"
                  value={patternDraft}
                  onChange={(e) => setPatternDraft(e.target.value)}
                  placeholder="e.g. win64.*portable\.zip or Setup-x64"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Winget Package ID (optional fallback)
                </label>
                <input
                  type="text"
                  value={wingetDraft}
                  onChange={(e) => setWingetDraft(e.target.value)}
                  placeholder="e.g. Microsoft.PowerToys"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Personal Notes
                </label>
                <textarea
                  rows={5}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Save setup tips, hotkeys, or custom flags..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveMeta}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <Check className="h-4 w-4" />
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
