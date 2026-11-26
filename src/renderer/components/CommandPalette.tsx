import { useEffect, useMemo, useState } from 'react';
import { Download, FolderGit2, Play, Search, Terminal, X } from 'lucide-react';
import type { RepoRecord } from '../../shared/types';
import { getRecommendedAsset } from '../utils/format';

interface CommandPaletteProps {
  open: boolean;
  repos: RepoRecord[];
  onClose: () => void;
  onSelectRepo: (repo: RepoRecord) => void;
  onUseTool: (repo: RepoRecord) => void;
  onLaunch: (repo: RepoRecord) => void;
  onQuickInstall: (repo: RepoRecord) => void;
  onClone: (repo: RepoRecord) => void;
}

export function CommandPalette({
  open,
  repos,
  onClose,
  onSelectRepo,
  onUseTool,
  onLaunch,
  onQuickInstall,
  onClone,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos.slice(0, 10);
    return repos
      .filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [query, repos]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 pt-20 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && matches[0]) {
                onSelectRepo(matches[0]);
                onClose();
              }
            }}
            placeholder="Quick jump, use tool, launch, install, or clone..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No matching repositories found.
            </div>
          ) : (
            matches.map((repo) => {
              const rec = getRecommendedAsset(repo);
              return (
                <div
                  key={repo.id}
                  onClick={() => {
                    onSelectRepo(repo);
                    onClose();
                  }}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {repo.fullName}
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {repo.description}
                    </div>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {repo.localInstall?.executablePath && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onLaunch(repo);
                            onClose();
                          }}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Launch
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUseTool(repo);
                            onClose();
                          }}
                          title="Use Inside Tool"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {!repo.localInstall && (rec || repo.wingetId) && (
                      <button
                        type="button"
                        onClick={() => {
                          onQuickInstall(repo);
                          onClose();
                        }}
                        className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
                      >
                        <Download className="h-3 w-3" />
                        Setup
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onClone(repo);
                        onClose();
                      }}
                      title="Clone"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <FolderGit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
