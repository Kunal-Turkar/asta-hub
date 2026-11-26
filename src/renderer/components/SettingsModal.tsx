import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  FolderOpen,
  HardDrive,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { AppSettings, PortableStatus } from '../../shared/types';
import { formatBytes } from '../utils/format';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings | null;
  portableStatus: PortableStatus | null;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  onClearCache: () => Promise<{ removedBytes: number; filesRemoved: number }>;
}

export function SettingsModal({
  open,
  settings,
  portableStatus,
  onClose,
  onSave,
  onClearCache,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cacheNote, setCacheNote] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings) {
      setDraft({ ...settings });
      setCacheNote(null);
    }
  }, [open, settings]);

  if (!open || !draft) return null;

  const handleBrowseRoot = async () => {
    const picked = await window.asta.pickDirectory(draft.libraryRoot);
    if (picked) {
      setDraft({ ...draft, libraryRoot: picked });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    const res = await onClearCache();
    setCacheNote(
      `Cleared ${res.filesRemoved} cached file(s) (${formatBytes(res.removedBytes)})`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            ASTA Hub Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[78vh] space-y-4 overflow-y-auto p-5 text-xs">
          {/* Portable Mode Status */}
          {portableStatus && (
            <div
              className={`rounded-xl border p-3.5 ${
                portableStatus.isPortableMode
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <HardDrive
                    className={`h-4 w-4 ${
                      portableStatus.isPortableMode ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  {portableStatus.isPortableMode
                    ? 'Single-Folder Portable Mode Active'
                    : 'Standard Windows Mode'}
                </div>
                <button
                  type="button"
                  onClick={() => window.asta.openPath(portableStatus.libraryRoot)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Open Data Folder
                </button>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {portableStatus.stats.portableReady} portable app(s) ready on any PC &bull;{' '}
                {portableStatus.stats.cachedInstallers} cached installer(s) &bull;{' '}
                {portableStatus.stats.missingOnThisPc} missing on this PC
                {portableStatus.portableGitPath && ' • PortableGit detected'}
              </div>
            </div>
          )}

          {/* Library Root */}
          <div>
            <label className="mb-1.5 block font-semibold text-slate-700 dark:text-slate-300">
              Library Root Directory (stores <code className="font-mono">repos/</code>,{' '}
              <code className="font-mono">apps/</code>, and{' '}
              <code className="font-mono">downloads/</code>)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.libraryRoot}
                onChange={(e) => setDraft({ ...draft, libraryRoot: e.target.value })}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleBrowseRoot}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Browse
              </button>
            </div>
          </div>

          {/* GitHub PAT */}
          <div>
            <label className="mb-1.5 block font-semibold text-slate-700 dark:text-slate-300">
              GitHub Personal Access Token (optional — boosts rate limit to 5,000/hr &amp; unlocks Star import)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={draft.githubToken}
                onChange={(e) => setDraft({ ...draft, githubToken: e.target.value })}
                placeholder="ghp_... or github_pat_..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-10 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block font-semibold text-slate-700 dark:text-slate-300">
                Target Windows Architecture
              </label>
              <select
                value={draft.preferredArch}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    preferredArch: e.target.value as AppSettings['preferredArch'],
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="auto">Auto-detect</option>
                <option value="x64">x64 (AMD64)</option>
                <option value="arm64">ARM64</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-semibold text-slate-700 dark:text-slate-300">
                Theme
              </label>
              <select
                value={draft.theme}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    theme: e.target.value as AppSettings['theme'],
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-semibold text-slate-700 dark:text-slate-300">
              Preferred Code Editor CLI Command
            </label>
            <input
              type="text"
              value={draft.preferredEditor}
              onChange={(e) => setDraft({ ...draft, preferredEditor: e.target.value })}
              placeholder="code"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input
              type="checkbox"
              checked={draft.preferPortableAssets}
              onChange={(e) =>
                setDraft({ ...draft, preferPortableAssets: e.target.checked })
              }
              className="h-4 w-4 rounded accent-indigo-600"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Prefer portable <code className="font-mono">.zip</code> / standalone{' '}
              <code className="font-mono">.exe</code> releases over system installers
            </span>
          </label>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input
              type="checkbox"
              checked={draft.keepDownloadedInstallers}
              onChange={(e) =>
                setDraft({ ...draft, keepDownloadedInstallers: e.target.checked })
              }
              className="h-4 w-4 rounded accent-indigo-600"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Keep downloaded installers in <code className="font-mono">downloads/</code> for offline setup on another PC
            </span>
          </label>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input
              type="checkbox"
              checked={draft.enableWingetFallback}
              onChange={(e) =>
                setDraft({ ...draft, enableWingetFallback: e.target.checked })
              }
              className="h-4 w-4 rounded accent-indigo-600"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Enable Winget fallback integration in Windows Setup tab
            </span>
          </label>

          {/* Cache cleanup */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div>
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                Downloaded Installer Cache
              </div>
              {cacheNote && (
                <div className="text-[11px] text-emerald-500">{cacheNote}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleClearCache}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Cache
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
