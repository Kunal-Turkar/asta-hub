import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { DownloadForInspectionResult } from '../../shared/types';
import { formatBytes } from '../utils/format';

interface TrustConfirmModalProps {
  pending: {
    repoId: string;
    repoName: string;
    inspection: DownloadForInspectionResult;
  } | null;
  installing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenContainingFolder: (filePath: string) => void;
}

export function TrustConfirmModal({
  pending,
  installing,
  onCancel,
  onConfirm,
  onOpenContainingFolder,
}: TrustConfirmModalProps) {
  if (!pending) return null;
  const { inspection, repoName } = pending;
  const { trust, asset, releaseTag } = inspection;

  const checksumMismatch = trust.checksumVerified === false;
  const isSignedValid = trust.signatureStatus === 'Valid';
  const isArchive = trust.signatureStatus === 'Archive';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {checksumMismatch ? (
              <ShieldAlert className="h-5 w-5 text-rose-500" />
            ) : isSignedValid ? (
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            )}
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Verify Windows Setup Before Running
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {repoName} ({releaseTag})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {trust.fileName}
              </span>
              <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-semibold uppercase text-indigo-400">
                {asset.kind}
              </span>
            </div>
            <div className="mt-1 text-slate-500 dark:text-slate-400">
              Size: {formatBytes(trust.fileSize)} &bull; Action:{' '}
              {asset.kind === 'installer'
                ? 'Launch Windows Installer'
                : asset.name.toLowerCase().endsWith('.zip')
                  ? 'Extract to Managed Portable Apps Folder'
                  : 'Register Standalone Portable Executable'}
            </div>
          </div>

          {/* Checksum */}
          <div className="space-y-1.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                SHA-256 Integrity
              </span>
              {trust.checksumVerified === true && (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Matches Published Checksum
                </span>
              )}
              {trust.checksumVerified === false && (
                <span className="inline-flex items-center gap-1 font-semibold text-rose-500">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  CHECKSUM MISMATCH!
                </span>
              )}
              {trust.checksumVerified === null && (
                <span className="text-slate-400">No release checksum published</span>
              )}
            </div>
            <div className="break-all rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {trust.sha256}
            </div>
          </div>

          {/* Authenticode */}
          <div className="space-y-1 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Windows Authenticode Signature
              </span>
              <span
                className={`font-semibold ${
                  isSignedValid
                    ? 'text-emerald-500'
                    : isArchive
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                }`}
              >
                {trust.signatureStatus}
              </span>
            </div>
            {trust.signerSubject ? (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Publisher: <span className="text-slate-700 dark:text-slate-200">{trust.signerSubject}</span>
              </div>
            ) : !isArchive ? (
              <div className="text-[11px] text-amber-500/90">
                This open-source binary is unsigned (common for community builds). Verify you trust {repoName} before continuing.
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Portable archive will be extracted safely into your managed apps directory.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onOpenContainingFolder(inspection.stagedFilePath)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Show File
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={installing}
              onClick={onCancel}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={installing}
              onClick={onConfirm}
              className={`rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition disabled:opacity-50 ${
                checksumMismatch
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {installing
                ? 'Setting Up...'
                : checksumMismatch
                  ? 'Run Anyway (Mismatch!)'
                  : asset.kind === 'installer'
                    ? 'Launch Installer'
                    : 'Extract & Ready App'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
