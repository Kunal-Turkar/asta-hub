import {
  Command,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

export type SortMode = 'stars' | 'name' | 'updated';
export type ViewMode = 'grid' | 'list';

interface TopBarProps {
  title: string;
  totalVisible: number;
  search: string;
  onSearchChange: (val: string) => void;
  sortMode: SortMode;
  onSortChange: (val: SortMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (val: ViewMode) => void;
  syncingAll: boolean;
  onCheckUpdates: () => void;
  onOpenAddRepo: () => void;
  onOpenCommandPalette: () => void;
}

export function TopBar({
  title,
  totalVisible,
  search,
  onSearchChange,
  sortMode,
  onSortChange,
  viewMode,
  onViewModeChange,
  syncingAll,
  onCheckUpdates,
  onOpenAddRepo,
  onOpenCommandPalette,
}: TopBarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {totalVisible}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2.5">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search repos, tools, tags, languages..."
            className="w-full rounded-xl border border-slate-200 bg-slate-100/70 py-2 pl-9 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100 dark:focus:bg-slate-900"
          />
          <button
            type="button"
            onClick={onOpenCommandPalette}
            title="Command Palette (Ctrl+K)"
            className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Command className="h-2.5 w-2.5" />K
          </button>
        </div>

        {/* Sort */}
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="stars">Sort: Stars</option>
          <option value="name">Sort: Name</option>
          <option value="updated">Sort: Recently Synced</option>
        </select>

        {/* View Toggle */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            className={`rounded-lg p-1.5 transition ${
              viewMode === 'grid'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            title="List View"
            className={`rounded-lg p-1.5 transition ${
              viewMode === 'list'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Check Updates */}
        <button
          type="button"
          onClick={onCheckUpdates}
          disabled={syncingAll}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${syncingAll ? 'animate-spin text-indigo-400' : ''}`}
          />
          <span>{syncingAll ? 'Syncing...' : 'Sync All'}</span>
        </button>

        {/* Add Repo */}
        <button
          type="button"
          onClick={onOpenAddRepo}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Repo</span>
        </button>
      </div>
    </header>
  );
}
