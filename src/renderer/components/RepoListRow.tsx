import {
  Download,
  FolderGit2,
  FolderOpen,
  Link2,
  Play,
  RefreshCw,
  Star,
  Terminal,
} from 'lucide-react';
import type { RepoRecord } from '../../shared/types';
import { formatCount, getRecommendedAsset } from '../utils/format';

interface RepoListRowProps {
  repo: RepoRecord;
  busy: boolean;
  onSelect: (repo: RepoRecord) => void;
  onUseTool: (repo: RepoRecord) => void;
  onToggleFavorite: (repo: RepoRecord) => void;
  onQuickInstall: (repo: RepoRecord) => void;
  onLaunch: (repo: RepoRecord) => void;
  onClone: (repo: RepoRecord) => void;
  onOpenFolder: (path: string) => void;
  onSync: (repo: RepoRecord) => void;
}

export function RepoListRow({
  repo,
  busy,
  onSelect,
  onUseTool,
  onToggleFavorite,
  onQuickInstall,
  onLaunch,
  onClone,
  onOpenFolder,
  onSync,
}: RepoListRowProps) {
  const recommendedAsset = getRecommendedAsset(repo);
  const isConsole = repo.localInstall?.subsystem === 'console';

  return (
    <div
      onClick={() => onSelect(repo)}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-400/60 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:border-indigo-500/50 dark:hover:bg-slate-900"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {repo.avatarUrl ? (
          <img
            src={repo.avatarUrl}
            alt={repo.owner}
            className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-xs font-bold text-indigo-400">
            {repo.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {repo.fullName}
            </span>
            {repo.latestRelease && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {repo.latestRelease.tagName}
              </span>
            )}
            {repo.hasUpdate && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                Update
              </span>
            )}
            {repo.localInstall && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  repo.localInstall.availableOnCurrentPc === false
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-500'
                }`}
              >
                {repo.localInstall.availableOnCurrentPc === false
                  ? 'Reinstall on PC'
                  : 'Installed'}
              </span>
            )}
            {repo.localClone && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  repo.localClone.availableOnCurrentPc === false
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-violet-500/15 text-violet-400'
                }`}
              >
                {repo.localClone.availableOnCurrentPc === false
                  ? 'Clone Missing'
                  : 'Cloned'}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {repo.description || 'Not synced yet'}
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-4 text-xs text-slate-500 md:flex dark:text-slate-400">
        {repo.language && <span className="w-24 truncate text-right">{repo.language}</span>}
        <span className="flex w-16 items-center justify-end gap-1">
          <Star className="h-3.5 w-3.5 text-amber-400" />
          {formatCount(repo.stars)}
        </span>
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onToggleFavorite(repo)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Star
            className={`h-4 w-4 ${repo.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
          />
        </button>

        {repo.localInstall?.executablePath &&
        repo.localInstall.availableOnCurrentPc !== false ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => (isConsole ? onUseTool(repo) : onLaunch(repo))}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              {isConsole ? (
                <Terminal className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              {isConsole ? 'Use CLI' : 'Launch'}
            </button>
            <button
              type="button"
              onClick={() => (isConsole ? onLaunch(repo) : onUseTool(repo))}
              title={isConsole ? 'Open in PowerShell' : 'Use Inside Tool'}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isConsole ? (
                <Play className="h-4 w-4" />
              ) : (
                <Terminal className="h-4 w-4" />
              )}
            </button>
          </>
        ) : repo.localInstall ? (
          <button
            type="button"
            onClick={() => onUseTool(repo)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link App
          </button>
        ) : recommendedAsset || repo.wingetId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onQuickInstall(repo)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <Download className="h-3.5 w-3.5" />
            Setup
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSync(repo)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            Sync
          </button>
        )}

        {repo.localClone ? (
          <button
            type="button"
            onClick={() => onOpenFolder(repo.localClone!.clonePath)}
            title="Open Cloned Folder"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onClone(repo)}
            title="Clone Repo"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FolderGit2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
