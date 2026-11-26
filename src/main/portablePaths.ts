import fs from 'node:fs';
import path from 'node:path';

export const LIBRARY_TOKEN = '@LIBRARY';

export interface PortableContext {
  isPortableMode: boolean;
  baseDir: string;
  userDataDir: string | null;
  portableDataDir: string | null;
  defaultLibraryRoot: string | null;
}

export function detectPortableContext(opts: {
  isPackaged: boolean;
  execPath: string;
  cwd: string;
  envPortableDir?: string;
}): PortableContext {
  const baseDir = opts.envPortableDir?.trim()
    ? path.resolve(opts.envPortableDir.trim())
    : opts.isPackaged
      ? path.dirname(opts.execPath)
      : path.resolve(opts.cwd);

  const flagPath = path.join(baseDir, 'portable.flag');
  const dataDir = path.join(baseDir, 'data');
  const isPortableMode =
    Boolean(opts.envPortableDir?.trim()) ||
    fs.existsSync(flagPath) ||
    fs.existsSync(dataDir);

  if (!isPortableMode) {
    return {
      isPortableMode: false,
      baseDir,
      userDataDir: null,
      portableDataDir: null,
      defaultLibraryRoot: null,
    };
  }

  return {
    isPortableMode: true,
    baseDir,
    userDataDir: path.join(dataDir, 'userData'),
    portableDataDir: dataDir,
    defaultLibraryRoot: dataDir,
  };
}

export function resolveConfiguredLibraryRoot(
  rawConfigured: string,
  portableDataDir: string | null
): string {
  const trimmed = rawConfigured.trim();
  if (!trimmed) {
    return portableDataDir ?? '';
  }
  if (trimmed === '.' || trimmed === './data' || trimmed === '.\\data') {
    return portableDataDir ?? path.resolve(trimmed);
  }
  if (trimmed === LIBRARY_TOKEN || trimmed.startsWith(`${LIBRARY_TOKEN}/`) || trimmed.startsWith(`${LIBRARY_TOKEN}\\`)) {
    return fromPortablePath(trimmed, portableDataDir ?? process.cwd()) ?? trimmed;
  }
  if (!path.isAbsolute(trimmed) && portableDataDir) {
    return path.resolve(path.dirname(portableDataDir), trimmed);
  }
  return path.resolve(trimmed);
}

export function toPortablePath(
  absPath: string | null | undefined,
  libraryRoot: string
): string | null {
  if (!absPath) return null;
  const trimmed = absPath.trim();
  if (!trimmed) return null;
  if (
    trimmed === LIBRARY_TOKEN ||
    trimmed.startsWith(`${LIBRARY_TOKEN}/`) ||
    trimmed.startsWith(`${LIBRARY_TOKEN}\\`)
  ) {
    return trimmed.replace(/\\/g, '/');
  }

  const resolvedRoot = path.resolve(libraryRoot);
  const resolvedTarget = path.resolve(trimmed);
  const rootLower = resolvedRoot.toLowerCase();
  const targetLower = resolvedTarget.toLowerCase();

  if (targetLower === rootLower) {
    return LIBRARY_TOKEN;
  }

  const rootWithSep = rootLower.endsWith(path.sep)
    ? rootLower
    : `${rootLower}${path.sep}`;

  if (targetLower.startsWith(rootWithSep)) {
    const rel = path.relative(resolvedRoot, resolvedTarget);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return `${LIBRARY_TOKEN}/${rel.split(path.sep).join('/')}`;
    }
  }

  return absPath;
}

export function fromPortablePath(
  storedPath: string | null | undefined,
  libraryRoot: string
): string | null {
  if (!storedPath) return null;
  const trimmed = storedPath.trim();
  if (!trimmed) return null;

  const resolvedRoot = path.resolve(libraryRoot);
  if (trimmed === LIBRARY_TOKEN) {
    return resolvedRoot;
  }
  if (
    trimmed.startsWith(`${LIBRARY_TOKEN}/`) ||
    trimmed.startsWith(`${LIBRARY_TOKEN}\\`)
  ) {
    const sub = trimmed
      .slice(LIBRARY_TOKEN.length + 1)
      .split(/[/\\]+/)
      .filter(Boolean);
    return path.resolve(resolvedRoot, ...sub);
  }

  return storedPath;
}

export function findPortableGitBinary(
  portableDataDir: string | null
): string | null {
  if (!portableDataDir) return null;
  const candidates = [
    path.join(portableDataDir, 'tools', 'git', 'cmd', 'git.exe'),
    path.join(portableDataDir, 'tools', 'git', 'bin', 'git.exe'),
    path.join(portableDataDir, 'tools', 'PortableGit', 'cmd', 'git.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
