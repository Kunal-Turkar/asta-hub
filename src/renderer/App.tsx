import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus } from 'lucide-react';
import type {
  AppSettings,
  DownloadForInspectionResult,
  RepoRecord,
} from '../shared/types';
import { ActivityDrawer } from './components/ActivityDrawer';
import { AddRepoModal } from './components/AddRepoModal';
import { CommandPalette } from './components/CommandPalette';
import { RepoCard } from './components/RepoCard';
import { type DetailTab, RepoDetailModal } from './components/RepoDetailModal';
import { RepoListRow } from './components/RepoListRow';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar, type SmartView } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { TopBar, type SortMode, type ViewMode } from './components/TopBar';
import { TrustConfirmModal } from './components/TrustConfirmModal';
import { useLibrary } from './hooks/useLibrary';
import { getRecommendedAsset, hasWindowsSetupAvailable } from './utils/format';

const VIEW_TITLES: Record<SmartView, string> = {
  all: 'All Open-Source Tools',
  windows: 'Windows Direct Setups',
  installed: 'Installed Apps',
  cloned: 'Cloned Repositories',
  updates: 'Updates Available',
  missing: 'Missing on This PC',
  favorites: 'Favorites',
};

export function App() {
  const {
    repos,
    settings,
    setSettings,
    portableStatus,
    tasks,
    rateLimit,
    loading,
    toasts,
    toolConsoles,
    clearToolConsole,
    pushToast,
    dismissToast,
  } = useLibrary();

  const [activeView, setActiveView] = useState<SmartView>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('stars');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [addOpen, setAddOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [busyRepoIds, setBusyRepoIds] = useState<Set<string>>(new Set());

  const [pendingTrust, setPendingTrust] = useState<{
    repoId: string;
    repoName: string;
    inspection: DownloadForInspectionResult;
  } | null>(null);
  const [confirmingInstall, setConfirmingInstall] = useState(false);

  const selectedRepo = useMemo(
    () => repos.find((r) => r.id === selectedRepoId) ?? null,
    [repos, selectedRepoId]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setRepoBusy = (repoId: string, busy: boolean) => {
    setBusyRepoIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(repoId);
      else next.delete(repoId);
      return next;
    });
  };

  const openRepoDetail = (repo: RepoRecord, tab: DetailTab = 'overview') => {
    setDetailTab(tab);
    setSelectedRepoId(repo.id);
  };

  const filteredRepos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = repos.filter((r) => {
      if (activeTag) {
        if (!r.tags.includes(activeTag)) return false;
      } else {
        if (activeView === 'windows' && !hasWindowsSetupAvailable(r)) return false;
        if (activeView === 'installed' && !r.localInstall) return false;
        if (activeView === 'cloned' && !r.localClone) return false;
        if (activeView === 'updates' && !r.hasUpdate) return false;
        if (
          activeView === 'missing' &&
          r.localInstall?.availableOnCurrentPc !== false &&
          r.localClone?.availableOnCurrentPc !== false
        ) {
          return false;
        }
        if (activeView === 'favorites' && !r.isFavorite) return false;
      }

      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.language ?? '').toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.topics.some((t) => t.toLowerCase().includes(q))
      );
    });

    list.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'updated') {
        return (b.lastSyncedAt ?? '').localeCompare(a.lastSyncedAt ?? '');
      }
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.stars - a.stars || a.name.localeCompare(b.name);
    });

    return list;
  }, [repos, activeView, activeTag, search, sortMode]);

  const handleSyncRepo = async (repo: RepoRecord) => {
    setRepoBusy(repo.id, true);
    try {
      await window.asta.syncRepo(repo.id);
      pushToast('success', `Synced ${repo.fullName}`);
    } catch (err) {
      pushToast(
        'error',
        `Failed to sync ${repo.fullName}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repo.id, false);
    }
  };

  const handleCheckAllUpdates = async () => {
    setSyncingAll(true);
    try {
      const res = await window.asta.checkAllUpdates();
      pushToast(
        'success',
        `Synced ${res.checked} repositories`,
        res.updatesFound > 0
          ? `${res.updatesFound} app update(s) available!`
          : 'All tracked apps are up to date.'
      );
    } catch (err) {
      pushToast(
        'error',
        'Sync interrupted',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSyncingAll(false);
    }
  };

  const handleToggleFavorite = async (repo: RepoRecord) => {
    try {
      await window.asta.updateRepoMeta(repo.id, {
        isFavorite: !repo.isFavorite,
      });
    } catch (err) {
      pushToast('error', 'Failed to update favorite', String(err));
    }
  };

  const handleDownloadAndInspect = async (repo: RepoRecord, assetId: number) => {
    setRepoBusy(repo.id, true);
    pushToast('info', `Downloading ${repo.name}...`, 'Check Activity drawer for progress.');
    try {
      const inspection = await window.asta.downloadAndInspectAsset({
        repoId: repo.id,
        assetId,
      });
      setPendingTrust({
        repoId: repo.id,
        repoName: repo.fullName,
        inspection,
      });
    } catch (err) {
      pushToast(
        'error',
        `Download failed for ${repo.name}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repo.id, false);
    }
  };

  const handleRunCachedSetup = async (repo: RepoRecord) => {
    setRepoBusy(repo.id, true);
    try {
      const inspection = await window.asta.inspectCachedInstaller(repo.id);
      setPendingTrust({
        repoId: repo.id,
        repoName: repo.fullName,
        inspection,
      });
    } catch (err) {
      pushToast(
        'error',
        `Cached installer unavailable for ${repo.name}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repo.id, false);
    }
  };

  const handleQuickInstall = async (repo: RepoRecord) => {
    const rec = getRecommendedAsset(repo);
    if (rec) {
      await handleDownloadAndInspect(repo, rec.id);
      return;
    }
    if (repo.wingetId) {
      await handleInstallWinget(repo.id, repo.wingetId);
      return;
    }
    openRepoDetail(repo);
  };

  const handleConfirmStagedInstall = async () => {
    if (!pendingTrust) return;
    setConfirmingInstall(true);
    try {
      const updated = await window.asta.installStagedAsset({
        repoId: pendingTrust.repoId,
        stagedFilePath: pendingTrust.inspection.stagedFilePath,
        assetId: pendingTrust.inspection.asset.id,
        releaseTag: pendingTrust.inspection.releaseTag,
        trust: pendingTrust.inspection.trust,
      });
      setPendingTrust(null);
      pushToast(
        'success',
        `${updated.name} ready`,
        updated.localInstall?.mode === 'portable'
          ? 'Extracted and ready to launch or run directly inside ASTA Hub.'
          : 'Installer launched — ASTA Hub will automatically scan for the installed app.'
      );
    } catch (err) {
      pushToast(
        'error',
        'Setup failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setConfirmingInstall(false);
    }
  };

  const handleLaunchApp = async (repo: RepoRecord) => {
    try {
      await window.asta.launchInstalledApp(repo.id);
      pushToast('info', `Launched ${repo.name}`);
    } catch (err) {
      pushToast(
        'error',
        `Could not launch ${repo.name}`,
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleLaunchWithArgs = async (
    repo: RepoRecord,
    args: string,
    asAdmin: boolean
  ) => {
    try {
      await window.asta.launchAppWithArgs(repo.id, args, asAdmin);
      pushToast(
        'info',
        asAdmin ? `Launched ${repo.name} as Administrator` : `Launched ${repo.name}`
      );
    } catch (err) {
      pushToast(
        'error',
        `Could not launch ${repo.name}`,
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleRunInsideTool = async (
    repo: RepoRecord,
    args: string,
    workingDir: string
  ) => {
    try {
      await window.asta.runInstalledTool(repo.id, args, workingDir);
    } catch (err) {
      pushToast(
        'error',
        `Failed to run ${repo.name}`,
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleCloneRepo = async (repo: RepoRecord, customParentDir?: string) => {
    setRepoBusy(repo.id, true);
    try {
      const updated = await window.asta.cloneRepo(repo.id, customParentDir);
      pushToast(
        'success',
        `Cloned ${repo.fullName}`,
        updated.localClone?.clonePath
      );
    } catch (err) {
      pushToast(
        'error',
        `Clone failed for ${repo.fullName}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repo.id, false);
    }
  };

  const handlePullRepo = async (repo: RepoRecord) => {
    setRepoBusy(repo.id, true);
    try {
      await window.asta.pullRepo(repo.id);
      pushToast('success', `Pulled latest changes for ${repo.fullName}`);
    } catch (err) {
      pushToast(
        'error',
        `Git pull failed`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repo.id, false);
    }
  };

  const handleInstallWinget = async (repoId: string, wingetId: string) => {
    setRepoBusy(repoId, true);
    pushToast('info', `Installing ${wingetId} via Winget...`);
    try {
      await window.asta.installViaWinget(repoId, wingetId);
      pushToast('success', `Installed ${wingetId} via Winget`);
    } catch (err) {
      pushToast(
        'error',
        'Winget install failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRepoBusy(repoId, false);
    }
  };

  const handleSaveSettings = async (patch: Partial<AppSettings>) => {
    const next = await window.asta.updateSettings(patch);
    setSettings(next);
    pushToast('success', 'Settings saved');
  };

  const currentTitle = activeTag
    ? `Collection: ${activeTag}`
    : VIEW_TITLES[activeView];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        repos={repos}
        portableStatus={portableStatus}
        activeView={activeView}
        activeTag={activeTag}
        onSelectView={setActiveView}
        onSelectTag={setActiveTag}
        tasks={tasks}
        rateLimit={rateLimit}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={currentTitle}
          totalVisible={filteredRepos.length}
          search={search}
          onSearchChange={setSearch}
          sortMode={sortMode}
          onSortChange={setSortMode}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          syncingAll={syncingAll}
          onCheckUpdates={handleCheckAllUpdates}
          onOpenAddRepo={() => setAddOpen(true)}
          onOpenCommandPalette={() => setPaletteOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
              <PackagePlus className="h-12 w-12 text-slate-400" />
              <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                No repositories match this view
              </h2>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Add any GitHub repository URL to inspect its README, install Windows .exe/.zip releases directly, or clone it for development.
              </p>
              <div className="mt-5 flex gap-2.5">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold hover:bg-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Clear Search
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  + Add Repository
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredRepos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  busy={busyRepoIds.has(repo.id)}
                  onSelect={(r) => openRepoDetail(r, 'overview')}
                  onUseTool={(r) => openRepoDetail(r, 'use')}
                  onToggleFavorite={handleToggleFavorite}
                  onQuickInstall={handleQuickInstall}
                  onLaunch={handleLaunchApp}
                  onClone={(r) => handleCloneRepo(r)}
                  onOpenFolder={(p) => window.asta.openPath(p)}
                  onSync={handleSyncRepo}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRepos.map((repo) => (
                <RepoListRow
                  key={repo.id}
                  repo={repo}
                  busy={busyRepoIds.has(repo.id)}
                  onSelect={(r) => openRepoDetail(r, 'overview')}
                  onUseTool={(r) => openRepoDetail(r, 'use')}
                  onToggleFavorite={handleToggleFavorite}
                  onQuickInstall={handleQuickInstall}
                  onLaunch={handleLaunchApp}
                  onClone={(r) => handleCloneRepo(r)}
                  onOpenFolder={(p) => window.asta.openPath(p)}
                  onSync={handleSyncRepo}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <RepoDetailModal
        repo={selectedRepo}
        initialTab={detailTab}
        defaultLibraryRoot={settings?.libraryRoot ?? ''}
        toolConsole={
          (selectedRepo ? toolConsoles[selectedRepo.id] : undefined) ?? {
            runId: null,
            status: 'idle',
            output: '',
            exitCode: null,
          }
        }
        busy={selectedRepo ? busyRepoIds.has(selectedRepo.id) : false}
        wingetEnabled={settings?.enableWingetFallback ?? true}
        onClose={() => setSelectedRepoId(null)}
        onSync={handleSyncRepo}
        onToggleFavorite={handleToggleFavorite}
        onRemoveRepo={async (id) => {
          await window.asta.removeRepo(id);
          pushToast('info', 'Removed repository from library');
        }}
        onDownloadAndInspect={handleDownloadAndInspect}
        onLaunchApp={handleLaunchApp}
        onLaunchWithArgs={handleLaunchWithArgs}
        onRunInsideTool={handleRunInsideTool}
        onStopTool={(runId) => window.asta.stopInstalledTool(runId)}
        onClearToolOutput={clearToolConsole}
        onLinkDiscovered={async (repoId, payload) => {
          await window.asta.linkInstalledApp(repoId, payload);
          pushToast('success', 'Linked installed application');
        }}
        onSetExecutable={async (id, exe) => {
          await window.asta.setInstalledExecutable(id, exe);
          pushToast('success', 'Updated launch executable');
        }}
        onCreateShortcut={async (id) => {
          try {
            const shortcut = await window.asta.createDesktopShortcut(id);
            pushToast('success', 'Desktop shortcut created', shortcut);
          } catch (err) {
            pushToast('error', 'Shortcut failed', String(err));
          }
        }}
        onUninstallPortable={async (id, runSystemUninstaller) => {
          try {
            await window.asta.uninstallPortableApp(id, runSystemUninstaller);
            pushToast(
              'info',
              runSystemUninstaller
                ? 'Uninstalled & removed local app entry'
                : 'Removed local app entry'
            );
          } catch (err) {
            pushToast(
              'error',
              'Uninstall failed',
              err instanceof Error ? err.message : String(err)
            );
          }
        }}
        onCloneRepo={handleCloneRepo}
        onPullRepo={handlePullRepo}
        onRunCommand={(id, cmd) => window.asta.runRepoCommand(id, cmd)}
        onUpdateMeta={async (id, patch) => {
          await window.asta.updateRepoMeta(id, patch);
          pushToast('success', 'Saved repository metadata');
        }}
        onInstallWinget={handleInstallWinget}
        onRunCachedSetup={handleRunCachedSetup}
      />

      <TrustConfirmModal
        pending={pendingTrust}
        installing={confirmingInstall}
        onCancel={() => setPendingTrust(null)}
        onConfirm={handleConfirmStagedInstall}
        onOpenContainingFolder={(fp) => {
          const idx = fp.lastIndexOf('\\');
          const dir = idx > 0 ? fp.slice(0, idx) : fp;
          window.asta.openPath(dir);
        }}
      />

      <AddRepoModal
        open={addOpen}
        hasGithubToken={Boolean(settings?.githubToken.trim())}
        onClose={() => setAddOpen(false)}
        onAddRepo={async (input, tags, notes) => {
          const added = await window.asta.addRepo({ input, tags, notes });
          pushToast('success', `Added ${added.fullName}`);
          openRepoDetail(added, 'overview');
        }}
        onImportStars={async () => {
          try {
            const res = await window.asta.importGitHubStars();
            pushToast(
              'success',
              `Imported ${res.imported} starred repos`,
              `${res.skipped} already in library`
            );
            setAddOpen(false);
          } catch (err) {
            pushToast(
              'error',
              'Failed to import stars',
              err instanceof Error ? err.message : String(err)
            );
          }
        }}
        onLoadStarter={async () => {
          const res = await window.asta.loadStarterCatalog();
          pushToast('success', `Loaded ${res.added} starter tool(s)`);
          setAddOpen(false);
        }}
        onExportJson={async () => {
          await window.asta.exportCatalogJson();
          pushToast('success', 'Catalog exported');
        }}
        onImportJson={async () => {
          try {
            const res = await window.asta.importCatalogJson();
            if (res.added > 0) {
              pushToast('success', `Imported ${res.added} catalog entries`);
              setAddOpen(false);
            }
          } catch (err) {
            pushToast('error', 'Import failed', String(err));
          }
        }}
      />

      <CommandPalette
        open={paletteOpen}
        repos={repos}
        onClose={() => setPaletteOpen(false)}
        onSelectRepo={(r) => openRepoDetail(r, 'overview')}
        onUseTool={(r) => openRepoDetail(r, 'use')}
        onLaunch={handleLaunchApp}
        onQuickInstall={handleQuickInstall}
        onClone={(r) => handleCloneRepo(r)}
      />

      <ActivityDrawer
        open={activityOpen}
        tasks={tasks}
        onClose={() => setActivityOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        portableStatus={portableStatus}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onClearCache={() => window.asta.clearDownloadsCache()}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
