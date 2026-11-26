import { useCallback, useEffect, useState } from 'react';
import type {
  ActivityTask,
  AppSettings,
  PortableStatus,
  RateLimitInfo,
  RepoRecord,
  ToolExecutionEvent,
} from '../../shared/types';
import type { ToolConsoleState } from '../components/UseToolTab';
import type { ToastMessage } from '../components/ToastContainer';

const DEFAULT_CONSOLE: ToolConsoleState = {
  runId: null,
  status: 'idle',
  output: '',
  exitCode: null,
};

export function useLibrary() {
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [portableStatus, setPortableStatus] = useState<PortableStatus | null>(null);
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({
    remaining: null,
    limit: null,
    resetAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [toolConsoles, setToolConsoles] = useState<
    Record<string, ToolConsoleState>
  >({});

  const clearToolConsole = useCallback((repoId: string) => {
    setToolConsoles((prev) => ({
      ...prev,
      [repoId]: { ...DEFAULT_CONSOLE },
    }));
  }, []);

  const pushToast = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, tone, title, detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshAll = useCallback(async () => {
    const [repoList, currentSettings, pStatus, taskList, rl] = await Promise.all([
      window.asta.listRepos(),
      window.asta.getSettings(),
      window.asta.getPortableStatus(),
      window.asta.listTasks(),
      window.asta.getRateLimit(),
    ]);
    setRepos(repoList);
    setSettings(currentSettings);
    setPortableStatus(pStatus);
    setTasks(taskList);
    setRateLimit(rl);
  }, []);

  useEffect(() => {
    let active = true;
    refreshAll()
      .catch((err) => {
        if (active) {
          pushToast('error', 'Failed to load library', String(err));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const offTask = window.asta.onTaskUpdate((task) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx === -1) return [task, ...prev].slice(0, 80);
        const copy = [...prev];
        copy[idx] = task;
        return copy;
      });
    });

    const offLib = window.asta.onLibraryUpdated(() => {
      window.asta.listRepos().then(setRepos).catch(() => undefined);
      window.asta.getPortableStatus().then(setPortableStatus).catch(() => undefined);
      window.asta.getRateLimit().then(setRateLimit).catch(() => undefined);
    });

    const offTool = window.asta.onToolOutput((ev: ToolExecutionEvent) => {
      setToolConsoles((prev) => {
        const cur = prev[ev.repoId] ?? DEFAULT_CONSOLE;
        const nextOut = ev.chunk ? cur.output + ev.chunk : cur.output;
        return {
          ...prev,
          [ev.repoId]: {
            runId: ev.status === 'running' ? ev.runId : null,
            status: ev.status,
            output: nextOut.slice(-120000),
            exitCode: ev.exitCode ?? (ev.status === 'running' ? null : cur.exitCode),
          },
        };
      });
    });

    return () => {
      active = false;
      offTask();
      offLib();
      offTool();
    };
  }, [refreshAll, pushToast]);

  useEffect(() => {
    if (!settings) return;
    const html = document.documentElement;
    if (settings.theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [settings?.theme]);

  return {
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
    refreshAll,
  };
}
