import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowUpCircle,
  Boxes,
  FolderGit2,
  HardDrive,
  Layers,
  Settings,
  Star,
  Tag,
} from 'lucide-react';
import type {
  ActivityTask,
  PortableStatus,
  RateLimitInfo,
  RepoRecord,
} from '../../shared/types';
import { hasWindowsSetupAvailable } from '../utils/format';

export type SmartView =
  | 'all'
  | 'windows'
  | 'installed'
  | 'cloned'
  | 'updates'
  | 'missing'
  | 'favorites';

interface SidebarProps {
  repos: RepoRecord[];
  portableStatus: PortableStatus | null;
  activeView: SmartView;
  activeTag: string | null;
  onSelectView: (view: SmartView) => void;
  onSelectTag: (tag: string | null) => void;
  tasks: ActivityTask[];
  rateLimit: RateLimitInfo;
  onOpenActivity: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  repos,
  portableStatus,
  activeView,
  activeTag,
  onSelectView,
  onSelectTag,
  tasks,
  rateLimit,
  onOpenActivity,
  onOpenSettings,
}: SidebarProps) {
  const counts = {
    all: repos.length,
    windows: repos.filter(hasWindowsSetupAvailable).length,
    installed: repos.filter((r) => Boolean(r.localInstall)).length,
    cloned: repos.filter((r) => Boolean(r.localClone)).length,
    updates: repos.filter((r) => r.hasUpdate).length,
    missing: repos.filter(
      (r) =>
        r.localInstall?.availableOnCurrentPc === false ||
        r.localClone?.availableOnCurrentPc === false
    ).length,
    favorites: repos.filter((r) => r.isFavorite).length,
  };

  const tagCounts = new Map<string, number>();
  for (const r of repos) {
    for (const tag of r.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const sortedTags = [...tagCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const runningCount = tasks.filter((t) => t.status === 'running').length;

  const navItems: {
    id: SmartView;
    label: string;
    icon: typeof Layers;
    count: number;
    accent?: string;
  }[] = [
    { id: 'all', label: 'All Library', icon: Layers, count: counts.all },
    {
      id: 'windows',
      label: 'Windows Setups',
      icon: AppWindow,
      count: counts.windows,
    },
    {
      id: 'installed',
      label: 'Installed Apps',
      icon: Boxes,
      count: counts.installed,
    },
    {
      id: 'cloned',
      label: 'Cloned Repos',
      icon: FolderGit2,
      count: counts.cloned,
    },
    {
      id: 'updates',
      label: 'Updates',
      icon: ArrowUpCircle,
      count: counts.updates,
      accent: counts.updates > 0 ? 'text-amber-400' : undefined,
    },
    ...(counts.missing > 0
      ? [
          {
            id: 'missing' as SmartView,
            label: 'Missing on PC',
            icon: AlertTriangle,
            count: counts.missing,
            accent: 'text-amber-400',
          },
        ]
      : []),
    { id: 'favorites', label: 'Favorites', icon: Star, count: counts.favorites },
  ];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 dark:border-slate-800/80 dark:bg-slate-950/95">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              ASTA Hub
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              GitHub &amp; Windows Store
            </div>
          </div>
        </div>
        {portableStatus?.isPortableMode && (
          <span
            title={`Single-folder portable mode: ${portableStatus.libraryRoot}`}
            className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400"
          >
            <HardDrive className="h-2.5 w-2.5" />
            USB
          </span>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Library
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTag === null && activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTag(null);
                  onSelectView(item.id);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 ${item.accent ?? (isActive ? 'text-indigo-500 dark:text-indigo-400' : '')}`}
                  />
                  {item.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    item.id === 'updates' && item.count > 0
                      ? 'bg-amber-500/20 font-semibold text-amber-500'
                      : isActive
                        ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                        : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Collections / Tags */}
        <div className="mt-6 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Collections
        </div>
        {sortedTags.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600">
            No tags yet
          </div>
        ) : (
          <div className="space-y-1">
            {sortedTags.map(([tag, count]) => {
              const isSelected = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(isSelected ? null : tag)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/15 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Tag className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{tag}</span>
                  </span>
                  <span className="text-[11px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Status & Controls */}
      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800/80">
        {rateLimit.remaining !== null && (
          <div className="flex items-center justify-between rounded-lg bg-slate-200/60 px-3 py-1.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <span>GitHub API Quota</span>
            <span className="font-mono font-semibold">
              {rateLimit.remaining}/{rateLimit.limit ?? '?'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenActivity}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Activity
              className={`h-3.5 w-3.5 ${
                runningCount > 0 ? 'animate-pulse text-cyan-400' : ''
              }`}
            />
            <span>Activity</span>
            {runningCount > 0 && (
              <span className="rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold text-cyan-400">
                {runningCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
