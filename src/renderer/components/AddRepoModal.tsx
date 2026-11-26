import { useMemo, useState } from 'react';
import {
  Download,
  FileJson,
  GitBranch,
  PackagePlus,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { parseGitHubRepoInput } from '../../shared/assetClassifier';

interface AddRepoModalProps {
  open: boolean;
  hasGithubToken: boolean;
  onClose: () => void;
  onAddRepo: (input: string, tags: string[], notes: string) => Promise<void>;
  onImportStars: () => Promise<void>;
  onLoadStarter: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onImportJson: () => Promise<void>;
}

export function AddRepoModal({
  open,
  hasGithubToken,
  onClose,
  onAddRepo,
  onImportStars,
  onLoadStarter,
  onExportJson,
  onImportJson,
}: AddRepoModalProps) {
  const [input, setInput] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseGitHubRepoInput(input), [input]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) {
      setError('Enter a valid GitHub URL (https://github.com/owner/repo) or owner/repo.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onAddRepo(input, tagList, notes);
      setInput('');
      setTags('');
      setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <PackagePlus className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Add Repository or Import Library
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              GitHub Repository URL or <code className="font-mono">owner/repo</code>
            </label>
            <input
              type="text"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. https://github.com/sharkdp/fd or sharkdp/fd"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
            {parsed && (
              <div className="mt-1.5 text-xs text-emerald-500">
                Ready to fetch <span className="font-mono font-semibold">{parsed.owner}/{parsed.repo}</span> + Windows release assets
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tags (optional)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="CLI, AI, Utilities"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quick Note (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why I saved this tool"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !parsed}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50"
          >
            <GitBranch className="h-4 w-4" />
            {submitting ? 'Fetching Repo & Releases...' : 'Add & Sync Repository'}
          </button>
        </form>

        {/* Bulk & Catalog Options */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Bulk Import &amp; Backup
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <button
              type="button"
              disabled={!hasGithubToken}
              onClick={onImportStars}
              title={
                hasGithubToken
                  ? 'Import your GitHub starred repositories'
                  : 'Add a GitHub Token in Settings first'
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-45 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Import GitHub Stars
            </button>

            <button
              type="button"
              onClick={onLoadStarter}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              Load Starter Tools
            </button>

            <button
              type="button"
              onClick={onImportJson}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-3.5 w-3.5 text-indigo-400" />
              Import JSON Pack
            </button>

            <button
              type="button"
              onClick={onExportJson}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileJson className="h-3.5 w-3.5 text-emerald-400" />
              Export Catalog JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
