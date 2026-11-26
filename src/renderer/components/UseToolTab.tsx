import { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Link2,
  Monitor,
  Play,
  Radar,
  Shield,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import type {
  DiscoveredWindowsApp,
  RepoRecord,
  ToolPreset,
} from '../../shared/types';

export interface ToolConsoleState {
  runId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  output: string;
  exitCode: number | null;
}

interface UseToolTabProps {
  repo: RepoRecord;
  defaultLibraryRoot: string;
  consoleState: ToolConsoleState;
  onLaunchApp: (repo: RepoRecord) => void;
  onLaunchWithArgs: (repo: RepoRecord, args: string, asAdmin: boolean) => void;
  onRunInsideTool: (repo: RepoRecord, args: string, workingDir: string) => void;
  onStopTool: (runId: string) => void;
  onClearOutput: (repoId: string) => void;
  onSetExecutable: (repoId: string, exePath: string) => void;
  onLinkDiscovered: (
    repoId: string,
    payload: { discovered?: DiscoveredWindowsApp; executablePath?: string }
  ) => Promise<void>;
  onCreateShortcut: (repoId: string) => void;
  onSavePresets: (repoId: string, presets: ToolPreset[]) => void;
  onRunCachedSetup: (repo: RepoRecord) => void;
}

export function UseToolTab({
  repo,
  defaultLibraryRoot,
  consoleState,
  onLaunchApp,
  onLaunchWithArgs,
  onRunInsideTool,
  onStopTool,
  onClearOutput,
  onSetExecutable,
  onLinkDiscovered,
  onCreateShortcut,
  onSavePresets,
  onRunCachedSetup,
}: UseToolTabProps) {
  const [argsInput, setArgsInput] = useState('--help');
  const [workingDir, setWorkingDir] = useState(
    repo.localClone?.clonePath || defaultLibraryRoot
  );
  const [presetLabel, setPresetLabel] = useState('');
  const [scanning, setScanning] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredWindowsApp[] | null>(
    null
  );
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    setWorkingDir(repo.localClone?.clonePath || defaultLibraryRoot);
    setDiscoveredList(null);
  }, [repo.id, defaultLibraryRoot]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleState.output]);

  const install = repo.localInstall;
  const isAvailableOnPc = Boolean(
    install?.executablePath && install.availableOnCurrentPc !== false
  );
  const isConsole = install?.subsystem === 'console';
  const isRunning = consoleState.status === 'running';

  const handleScanWindows = async () => {
    setScanning(true);
    try {
      const results = await window.asta.detectInstalledApps(repo.id);
      setDiscoveredList(results);
    } finally {
      setScanning(false);
    }
  };

  const handleBrowseCustomExe = async () => {
    const exe = await window.asta.pickExecutable(install?.installDir);
    if (exe) {
      if (install) {
        onSetExecutable(repo.id, exe);
      } else {
        await onLinkDiscovered(repo.id, { executablePath: exe });
      }
    }
  };

  const handleInsertFile = async () => {
    const picked = await window.asta.pickAnyFile(workingDir);
    if (picked) {
      setArgsInput((prev) => (prev.trim() ? `${prev.trim()} "${picked}"` : `"${picked}"`));
    }
  };

  const handleInsertFolder = async () => {
    const picked = await window.asta.pickDirectory(workingDir);
    if (picked) {
      setArgsInput((prev) => (prev.trim() ? `${prev.trim()} "${picked}"` : `"${picked}"`));
    }
  };

  const handleBrowseWorkingDir = async () => {
    const picked = await window.asta.pickDirectory(workingDir);
    if (picked) {
      setWorkingDir(picked);
    }
  };

  const handleSavePreset = () => {
    const label = presetLabel.trim();
    if (!label) return;
    const next: ToolPreset[] = [
      ...repo.toolPresets,
      {
        id: `${Date.now()}`,
        label,
        args: argsInput,
        workingDir,
      },
    ];
    onSavePresets(repo.id, next);
    setPresetLabel('');
  };

  const handleDeletePreset = (id: string) => {
    onSavePresets(
      repo.id,
      repo.toolPresets.filter((p) => p.id !== id)
    );
  };

  return (
    <div className="space-y-6">
      {/* Linked App Card OR Discovery Panel */}
      {isAvailableOnPc && install?.executablePath ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Monitor className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Ready to Use Directly ({install.mode} · {install.version})
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    isConsole
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-indigo-500/20 text-indigo-400'
                  }`}
                >
                  {isConsole ? 'CLI / Console Tool' : 'GUI Desktop App'}
                </span>
              </div>
              <div className="mt-1.5 break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {install.executablePath}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onLaunchApp(repo)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {isConsole ? 'Open in PowerShell' : 'Launch App'}
              </button>
              <button
                type="button"
                onClick={() => onLaunchWithArgs(repo, '', true)}
                title="Launch as Administrator"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Run as Admin
              </button>
              <button
                type="button"
                onClick={() => window.asta.openPath(install.installDir)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Folder
              </button>
              <button
                type="button"
                onClick={() => onCreateShortcut(repo.id)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Shortcut
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-emerald-500/20 pt-3 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Executable:
            </span>
            {install.detectedExecutables.length > 1 ? (
              <select
                value={install.executablePath}
                onChange={(e) => onSetExecutable(repo.id, e.target.value)}
                className="max-w-lg flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
              >
                {install.detectedExecutables.map((exe) => (
                  <option key={exe} value={exe}>
                    {exe}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 truncate font-mono text-[11px] text-slate-500">
                {install.executablePath}
              </span>
            )}
            <button
              type="button"
              onClick={handleBrowseCustomExe}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Change .exe...
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={handleScanWindows}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Radar className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
              Rescan Windows
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {install?.availableOnCurrentPc === false
                  ? 'Recorded on Another PC — Setup Needed on This System'
                  : install
                    ? 'Installer Launched — Link Installed Executable'
                    : 'Use an Existing or Newly Installed Setup Directly'}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {install?.availableOnCurrentPc === false && install.executablePath
                  ? `Previously linked at ${install.executablePath} (not found on this PC). Run the cached installer offline, scan this PC, or link its executable.`
                  : 'Scan Windows (Registry, Program Files, WinGet Packages, and PATH) to link an installed setup, or browse to its .exe manually.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {install?.cachedInstallerPath && (
                <button
                  type="button"
                  onClick={() => onRunCachedSetup(repo)}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Run Cached Setup (Offline)
                </button>
              )}
              <button
                type="button"
                disabled={scanning}
                onClick={handleScanWindows}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Radar className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? 'Scanning Windows...' : 'Scan Windows for App'}
              </button>
              <button
                type="button"
                onClick={handleBrowseCustomExe}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Link2 className="h-4 w-4" />
                Browse .exe...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discovered Matches List */}
      {discoveredList !== null && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Detected Installations on Windows ({discoveredList.length})
            </h4>
            <button
              type="button"
              onClick={() => setDiscoveredList(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Hide
            </button>
          </div>
          {discoveredList.length === 0 ? (
            <p className="text-xs text-slate-500">
              No automatic match found in Registry or PATH. Use &ldquo;Browse .exe...&rdquo; to select the executable directly, or install from the &ldquo;Windows Setup &amp; Releases&rdquo; tab.
            </p>
          ) : (
            <div className="space-y-2">
              {discoveredList.map((item) => (
                <div
                  key={`${item.installDir}-${item.executablePath}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.displayName}
                      </span>
                      {item.displayVersion && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                          {item.displayVersion}
                        </span>
                      )}
                      <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-400">
                        {item.source}
                      </span>
                      <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-400">
                        {item.subsystem}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.executablePath ?? item.installDir}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!item.executablePath}
                    onClick={async () => {
                      await onLinkDiscovered(repo.id, { discovered: item });
                      setDiscoveredList(null);
                    }}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Link &amp; Use
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Integrated Tool Runner & Argument Launcher */}
      {isAvailableOnPc && install?.executablePath && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Terminal className="h-4 w-4 text-indigo-400" />
                Run &amp; Use Tool Inside ASTA Hub
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pass flags, files, or folders directly to the installed executable and capture live output right here—or launch externally with arguments.
              </p>
            </div>
          </div>

          {/* Working Directory */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="w-28 shrink-0 font-semibold text-slate-600 dark:text-slate-300">
              Working Folder:
            </span>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={handleBrowseWorkingDir}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Browse...
            </button>
          </div>

          {/* Arguments Bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="w-28 shrink-0 font-semibold text-slate-600 dark:text-slate-300">
              Arguments:
            </span>
            <input
              type="text"
              value={argsInput}
              onChange={(e) => setArgsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRunning) {
                  onRunInsideTool(repo, argsInput, workingDir);
                }
              }}
              placeholder='e.g. --help  or  "C:\path\to\file"'
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {/* Quick Helpers + Execution Buttons */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {['--help', '--version', ''].map((quick) => (
                <button
                  key={quick || 'empty'}
                  type="button"
                  onClick={() => setArgsInput(quick)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {quick || '(no args)'}
                </button>
              ))}
              <button
                type="button"
                onClick={handleInsertFile}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <FilePlus className="h-3 w-3" />
                Insert File
              </button>
              <button
                type="button"
                onClick={handleInsertFolder}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <FolderPlus className="h-3 w-3" />
                Insert Folder
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onLaunchWithArgs(repo, argsInput, false)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Monitor className="h-3.5 w-3.5" />
                Launch External With Args
              </button>

              {isRunning && consoleState.runId ? (
                <button
                  type="button"
                  onClick={() => onStopTool(consoleState.runId!)}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop Process
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRunInsideTool(repo, argsInput, workingDir)}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run Inside Tool
                </button>
              )}
            </div>
          </div>

          {/* Saved Presets */}
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Saved Command Presets
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={presetLabel}
                  onChange={(e) => setPresetLabel(e.target.value)}
                  placeholder="Preset name..."
                  className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  disabled={!presetLabel.trim()}
                  onClick={handleSavePreset}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  <BookmarkPlus className="h-3 w-3" />
                  Save Current
                </button>
              </div>
            </div>

            {repo.toolPresets.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                Save your favorite arguments (for example, download flags or file searches) for 1-click reuse.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {repo.toolPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 pl-2.5 pr-1 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setArgsInput(preset.args);
                        if (preset.workingDir) setWorkingDir(preset.workingDir);
                        onRunInsideTool(
                          repo,
                          preset.args,
                          preset.workingDir || workingDir
                        );
                      }}
                      className="flex items-center gap-1.5 font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      {preset.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(preset.id)}
                      title="Delete preset"
                      className="rounded p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Console Output */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-300">Tool Output</span>
                {consoleState.status !== 'idle' && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      consoleState.status === 'running'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : consoleState.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {consoleState.status}
                    {consoleState.exitCode !== null &&
                    consoleState.exitCode !== undefined
                      ? ` (${consoleState.exitCode})`
                      : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {consoleState.output && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(consoleState.output)
                      }
                      className="flex items-center gap-1 hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => onClearOutput(repo.id)}
                      className="hover:text-white"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <pre
              ref={outputRef}
              className="h-64 overflow-y-auto whitespace-pre-wrap p-3.5 font-mono text-[11.5px] leading-relaxed text-slate-200"
            >
              {consoleState.output ||
                'Output from running this installed tool will stream here live.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
