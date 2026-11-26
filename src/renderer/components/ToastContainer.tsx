import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md transition-all ${
            t.tone === 'error'
              ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
              : t.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                : 'border-slate-700 bg-slate-900/95 text-slate-100'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {t.tone === 'error' ? (
              <AlertCircle className="h-4 w-4 text-rose-400" />
            ) : t.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Info className="h-4 w-4 text-indigo-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.detail && (
              <div className="mt-0.5 break-words text-xs opacity-80">{t.detail}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
