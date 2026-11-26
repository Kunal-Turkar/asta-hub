import type { ClassifiedAsset, RepoRecord } from '../../shared/types';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export function formatCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never synced';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function getRecommendedAsset(repo: RepoRecord): ClassifiedAsset | null {
  if (!repo.latestRelease) return null;
  if (repo.latestRelease.recommendedAssetId !== null) {
    return (
      repo.latestRelease.assets.find(
        (a) => a.id === repo.latestRelease?.recommendedAssetId
      ) ?? null
    );
  }
  return null;
}

export function hasWindowsSetupAvailable(repo: RepoRecord): boolean {
  return Boolean(getRecommendedAsset(repo) || repo.wingetId);
}
