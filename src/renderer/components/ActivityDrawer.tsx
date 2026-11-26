import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import type { ActivityTask } from '../../shared/types';

interface ActivityDrawerProps {
  open: boolean;
  tasks: ActivityTask[];
  onClose: () => void;
}

export function ActivityDrawer({ open, tasks, onClose }: ActivityDrawerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Activity &amp; Transfer Queue
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Live downloads, Git clones, extractions, and sync history
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No tasks executed in this session yet.
          </div>
        ) : (
          tasks.map((task) => {
            const isExpanded = expandedId === task.id;
            return (
              <div
                key={task.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {task.status === 'running' ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
                    ) : task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900 dark:text-white">
                        {task.title}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {task.message}
                      </div>
                    </div>
                  </div>

                  {task.logs.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : task.id)
                      }
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {task.status === 'running' && (
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-indigo-500 transition-all ${
                        task.progress < 0 ? 'w-1/2 animate-pulse' : ''
                      }`}
                      style={
                        task.progress >= 0
                          ? { width: `${Math.max(4, task.progress)}%` }
                          : undefined
                      }
                    />
                  </div>
                )}

                {isExpanded && task.logs.length > 0 && (
                  <pre className="mt-2.5 max-h-40 overflow-y-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[10px] text-slate-300">
                    {task.logs.join('\n')}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
