import {
  ArrowUpCircle,
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

interface RepoCardProps {
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

export function RepoCard({
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
}: RepoCardProps) {
  const recommendedAsset = getRecommendedAsset(repo);
  const isConsoleTool = repo.localInstall?.subsystem === 'console';

  return (
    <div
      onClick={() => onSelect(repo)}
      className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-indigo-400/60 hover:shadow-lg hover:shadow-indigo-500/5 dark:border-slate-800/80 dark:bg-slate-900/70 dark:hover:border-indigo-500/50 dark:hover:bg-slate-900"
    >
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {repo.avatarUrl ? (
              <img
                src={repo.avatarUrl}
                alt={repo.owner}
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-700/70"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-sm font-bold text-indigo-400">
                {repo.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900 group-hover:text-indigo-500 dark:text-slate-100 dark:group-hover:text-indigo-400">
                {repo.name}
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                {repo.owner}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(repo);
            }}
            title={repo.isFavorite ? 'Unfavorite' : 'Favorite'}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Star
              className={`h-4 w-4 ${
                repo.isFavorite
                  ? 'fill-amber-400 text-amber-400'
                  : 'hover:text-amber-400'
              }`}
            />
          </button>
        </div>

        <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {repo.description || 'No description provided yet. Click to sync from GitHub.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {repo.hasUpdate && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
              <ArrowUpCircle className="h-3 w-3" />
              Update {repo.latestRelease?.tagName}
            </span>
          )}

          {repo.localInstall && repo.localInstall.availableOnCurrentPc === false ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              Reinstall on This PC
            </span>
          ) : repo.localInstall ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
              {repo.localInstall.mode === 'portable'
                ? `Portable ${repo.localInstall.version}`
                : repo.localInstall.mode === 'winget'
                  ? 'Winget Installed'
                  : `Installed ${repo.localInstall.version}`}
            </span>
          ) : null}

          {!repo.localInstall && recommendedAsset && (
            <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-500">
              Win {recommendedAsset.kind === 'installer' ? 'Installer' : recommendedAsset.kind === 'portable' ? 'Portable' : 'EXE'}
            </span>
          )}

          {repo.localClone && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
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

          {repo.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <div className="mb-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            {repo.stars > 0 && (
              <span className="flex items-center gap-1 font-medium">
                <Star className="h-3 w-3 text-amber-400" />
                {formatCount(repo.stars)}
              </span>
            )}
            {repo.language && <span>{repo.language}</span>}
          </div>
          {repo.latestRelease && (
            <span className="font-mono text-[10px] opacity-80">
              {repo.latestRelease.tagName}
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {repo.localInstall?.executablePath &&
          repo.localInstall.availableOnCurrentPc !== false ? (
            isConsoleTool ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUseTool(repo)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Use CLI</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onLaunch(repo)}
                  title="Open in External PowerShell"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-emerald-500 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <Play className="h-4 w-4 fill-current" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onLaunch(repo)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Launch</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUseTool(repo)}
                  title="Use Inside Tool / Run With Args"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Terminal className="h-4 w-4" />
                </button>
              </>
            )
          ) : repo.localInstall ? (
            <button
              type="button"
              onClick={() => onUseTool(repo)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>
                {repo.localInstall.availableOnCurrentPc === false
                  ? 'Setup on This PC'
                  : 'Link Installed App'}
              </span>
            </button>
          ) : recommendedAsset || repo.wingetId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onQuickInstall(repo)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{recommendedAsset ? 'Direct Setup' : 'Winget Install'}</span>
            </button>
          ) : !repo.lastSyncedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSync(repo)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Sync Releases</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClone(repo)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              <span>{repo.localClone ? 'Pull Repo' : 'Clone Repo'}</span>
            </button>
          )}

          {repo.localClone ? (
            <button
              type="button"
              onClick={() => onOpenFolder(repo.localClone!.clonePath)}
              title="Open Cloned Folder"
              className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClone(repo)}
              title="Clone Repository"
              className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <FolderGit2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
