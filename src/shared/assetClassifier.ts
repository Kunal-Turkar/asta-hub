import type {
  AssetArch,
  ClassifiedAsset,
  RepoIdentifier,
  WindowsAssetKind,
} from './types';

export interface RawGitHubAsset {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
  content_type?: string;
}

const VALID_SEGMENT = /^[A-Za-z0-9_.-]+$/;

export function parseGitHubRepoInput(rawInput: string): RepoIdentifier | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = /^git@github\.com:([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(
    trimmed
  );
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    if (VALID_SEGMENT.test(owner) && VALID_SEGMENT.test(repo)) {
      return { owner, repo };
    }
    return null;
  }

  // Full URL format
  if (/^https?:\/\//i.test(trimmed) || /^github\.com\//i.test(trimmed)) {
    const normalizedUrl = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.toLowerCase();
      if (host !== 'github.com' && host !== 'www.github.com') {
        return null;
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, '');
      if (VALID_SEGMENT.test(owner) && VALID_SEGMENT.test(repo)) {
        return { owner, repo };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Shorthand format: owner/repo
  const shortMatch = /^([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/.exec(trimmed);
  if (shortMatch) {
    const owner = shortMatch[1];
    const repo = shortMatch[2];
    if (VALID_SEGMENT.test(owner) && VALID_SEGMENT.test(repo)) {
      return { owner, repo };
    }
  }

  return null;
}

const CHECKSUM_PATTERN =
  /(\.sha256(sum)?$|\.sha512(sum)?$|checksums?(\.txt)?$|sha256sums?(\.txt)?$|\.md5$)/i;

const NON_WINDOWS_PATTERN =
  /(^|[-_.\s])(linux|darwin|macos|osx|mac|apple|ubuntu|debian|fedora|archlinux|freebsd|openbsd|netbsd|android|ios|musl|gnu|unknown-linux)([-_.\s]|$)|(\.dmg|\.pkg|\.deb|\.rpm|\.appimage|\.flatpak|\.snap|\.apk|\.ipa|\.tar\.gz|\.tar\.xz|\.tar\.bz2|\.tgz)$/i;

const IGNORED_AUX_PATTERN =
  /(\.blockmap$|\.sig$|\.asc$|\.pem$|\.pdb$|\.nupkg$|\.symbols(\.zip)?$|source[-_.\s]?code)/i;

function detectArchitecture(lowerName: string): AssetArch {
  if (/(arm64|aarch64)/i.test(lowerName)) return 'arm64';
  if (/(x86_64|x86-64|amd64|x64|win64)/i.test(lowerName)) return 'x64';
  if (/(^|[-_.])(x86|i386|i686|ia32)([-_.]|$)/i.test(lowerName)) return 'x86';
  if (/win32/i.test(lowerName) && !/x64|amd64|arm64/i.test(lowerName)) return 'x86';
  if (/universal/i.test(lowerName)) return 'universal';
  return 'unknown';
}

function detectKind(lowerName: string): WindowsAssetKind {
  if (/\.(msi|msix|msixbundle|appx|appxbundle)$/i.test(lowerName)) {
    return 'installer';
  }
  if (/\.exe$/i.test(lowerName)) {
    if (/(setup|install|installer|nsis|inno|bootstrap)/i.test(lowerName)) {
      return 'installer';
    }
    if (/portable/i.test(lowerName)) {
      return 'portable';
    }
    return 'executable';
  }
  if (/\.(zip|7z)$/i.test(lowerName)) {
    return 'portable';
  }
  return 'other';
}

function findMatchingChecksumAsset(
  assetName: string,
  checksumAssets: RawGitHubAsset[]
): RawGitHubAsset | null {
  const lower = assetName.toLowerCase();
  const exact = checksumAssets.find(
    (c) =>
      c.name.toLowerCase() === `${lower}.sha256` ||
      c.name.toLowerCase() === `${lower}.sha256sum`
  );
  if (exact) return exact;

  const generic = checksumAssets.find((c) =>
    /^(sha256sums|checksums|hashes)(\.txt)?$/i.test(c.name)
  );
  return generic ?? null;
}

export function classifyReleaseAssets(
  rawAssets: RawGitHubAsset[],
  hostArch: 'x64' | 'arm64' = 'x64',
  preferredPattern?: string | null,
  options?: { preferPortable?: boolean }
): { assets: ClassifiedAsset[]; recommendedAssetId: number | null } {
  const checksumAssets = rawAssets.filter((a) => CHECKSUM_PATTERN.test(a.name));
  const candidateAssets = rawAssets.filter((a) => !CHECKSUM_PATTERN.test(a.name));
  const preferPortable = Boolean(options?.preferPortable);

  let compiledPreferred: RegExp | null = null;
  if (preferredPattern && preferredPattern.trim()) {
    try {
      compiledPreferred = new RegExp(preferredPattern.trim(), 'i');
    } catch {
      compiledPreferred = null;
    }
  }

  const classified: ClassifiedAsset[] = candidateAssets.map((raw) => {
    const lower = raw.name.toLowerCase();
    const reasons: string[] = [];

    if (IGNORED_AUX_PATTERN.test(lower)) {
      return {
        id: raw.id,
        name: raw.name,
        downloadUrl: raw.browser_download_url,
        size: raw.size,
        downloadCount: raw.download_count,
        contentType: raw.content_type ?? 'application/octet-stream',
        kind: 'other',
        arch: 'unknown',
        score: -200,
        isRecommended: false,
        checksumUrl: null,
        checksumAssetName: null,
        reasons: ['Auxiliary metadata or debug file'],
      };
    }

    if (NON_WINDOWS_PATTERN.test(lower)) {
      return {
        id: raw.id,
        name: raw.name,
        downloadUrl: raw.browser_download_url,
        size: raw.size,
        downloadCount: raw.download_count,
        contentType: raw.content_type ?? 'application/octet-stream',
        kind: 'other',
        arch: detectArchitecture(lower),
        score: -180,
        isRecommended: false,
        checksumUrl: null,
        checksumAssetName: null,
        reasons: ['Non-Windows platform artifact'],
      };
    }

    const kind = detectKind(lower);
    const arch = detectArchitecture(lower);
    let score = 0;

    if (kind === 'installer') {
      score += preferPortable ? 50 : 70;
      reasons.push('Windows installer');
    } else if (kind === 'portable') {
      score += preferPortable ? 76 : 48;
      reasons.push(preferPortable ? 'Portable archive (portable-first)' : 'Portable archive');
    } else if (kind === 'executable') {
      score += preferPortable ? 72 : 52;
      reasons.push('Standalone Windows executable');
    } else {
      score -= 100;
      reasons.push('Unsupported file type');
    }

    if (kind !== 'other') {
      if (/\.(msi|msix)$/i.test(lower)) {
        score += 10;
        reasons.push('Native MSI/MSIX package');
      }
      if (/\.zip$/i.test(lower)) {
        score += 10;
        reasons.push('Native Windows ZIP support');
      } else if (/\.7z$/i.test(lower)) {
        score -= 8;
        reasons.push('7z archive (requires 7-Zip)');
      }

      if (/(win|windows|win64|win32|msvc|pc-windows)/i.test(lower)) {
        score += 30;
        reasons.push('Explicit Windows target');
      } else if (/\.exe$|\.msi$|\.msix$/i.test(lower)) {
        score += 22;
        reasons.push('Windows native binary extension');
      } else if (kind === 'portable') {
        // Generic .zip without OS hint could be cross-platform source/docs; keep moderate
        score -= 10;
      }

      if (arch === hostArch) {
        score += 35;
        reasons.push(`Matches ${hostArch} architecture`);
      } else if (arch === 'universal') {
        score += 20;
        reasons.push('Universal architecture');
      } else if (arch === 'unknown') {
        score += 10;
      } else if (hostArch === 'x64' && arch === 'x86') {
        score += 5;
        reasons.push('32-bit x86 (runs on x64)');
      } else {
        score -= 80;
        reasons.push(`Different architecture (${arch})`);
      }

      if (/(debug|symbols|headless|server-only)/i.test(lower)) {
        score -= 25;
      }

      if (compiledPreferred && compiledPreferred.test(raw.name)) {
        score += 120;
        reasons.push('Matches saved preference');
      } else if (
        preferredPattern &&
        !compiledPreferred &&
        lower.includes(preferredPattern.toLowerCase())
      ) {
        score += 120;
        reasons.push('Matches saved preference');
      }
    }

    const checksum = findMatchingChecksumAsset(raw.name, checksumAssets);

    return {
      id: raw.id,
      name: raw.name,
      downloadUrl: raw.browser_download_url,
      size: raw.size,
      downloadCount: raw.download_count,
      contentType: raw.content_type ?? 'application/octet-stream',
      kind,
      arch,
      score,
      isRecommended: false,
      checksumUrl: checksum?.browser_download_url ?? null,
      checksumAssetName: checksum?.name ?? null,
      reasons,
    };
  });

  classified.sort((a, b) => b.score - a.score || b.downloadCount - a.downloadCount);

  const top = classified.find((a) => a.kind !== 'other' && a.score >= 30);
  if (top) {
    top.isRecommended = true;
  }

  return {
    assets: classified,
    recommendedAssetId: top?.id ?? null,
  };
}
