import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { LibraryDatabase } from './db';
import { DownloadService } from './downloadService';
import { GitHubService } from './githubService';
import { GitService } from './gitService';
import { registerIpcHandlers, seedStarterCatalogIfEmpty } from './ipcHandlers';
import {
  detectPortableContext,
  findPortableGitBinary,
} from './portablePaths';
import { WindowsService } from './windowsService';

let mainWindow: BrowserWindow | null = null;
let db: LibraryDatabase | null = null;

function createWindow(): void {
  const isHeadlessVerify =
    process.argv.includes('--smoke-test') ||
    process.argv.includes('--verify-portable');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 680,
    show: !isHeadlessVerify,
    backgroundColor: '#020617',
    title: 'ASTA Hub — Open-Source Tools & Repo Library',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const isAllowedDev = devUrl && url.startsWith(devUrl);
    const isFile = url.startsWith('file://');
    if (!isAllowedDev && !isFile) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const isSmokeTest = process.argv.includes('--smoke-test');
const isPortableVerify = process.argv.includes('--verify-portable');
const isHeadlessVerify = isSmokeTest || isPortableVerify;
const portableContext = isSmokeTest
  ? {
      isPortableMode: false,
      baseDir: process.cwd(),
      userDataDir: null,
      portableDataDir: null,
      defaultLibraryRoot: null,
    }
  : detectPortableContext({
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      cwd: process.cwd(),
      envPortableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    });

const smokeUserData = isSmokeTest
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'asta-smoke-'))
  : null;
if (smokeUserData) {
  app.setPath('userData', smokeUserData);
} else if (portableContext.isPortableMode && portableContext.userDataDir) {
  fs.mkdirSync(portableContext.userDataDir, { recursive: true });
  fs.mkdirSync(path.join(portableContext.portableDataDir!, 'apps'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(portableContext.portableDataDir!, 'repos'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(portableContext.portableDataDir!, 'downloads'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(portableContext.portableDataDir!, 'tools'), {
    recursive: true,
  });
  app.setPath('userData', portableContext.userDataDir);
}

async function bootstrap(): Promise<void> {
  const defaultLibraryRoot = portableContext.isPortableMode
    ? './data'
    : path.join(app.getPath('documents'), 'ASTA-Library');
  const dbPath = path.join(app.getPath('userData'), 'library.db');

  db = new LibraryDatabase(
    dbPath,
    {
      libraryRoot: defaultLibraryRoot,
      githubToken: '',
      enableWingetFallback: true,
      preferPortableAssets: portableContext.isPortableMode,
      keepDownloadedInstallers: true,
      preferredArch: 'auto',
      preferredEditor: 'code',
      theme: 'dark',
    },
    portableContext.portableDataDir
  );

  await db.init();
  const seeded = seedStarterCatalogIfEmpty(db);

  registerIpcHandlers({
    db,
    github: new GitHubService(),
    downloader: new DownloadService(),
    windows: new WindowsService(),
    git: new GitService(
      () => findPortableGitBinary(portableContext.portableDataDir) ?? 'git'
    ),
    getWindow: () => mainWindow,
    portableInfo: {
      isPortableMode: portableContext.isPortableMode,
      baseDir: portableContext.baseDir,
      userDataDir: app.getPath('userData'),
      portableDataDir: portableContext.portableDataDir,
    },
  });

  createWindow();

  if (isHeadlessVerify && mainWindow) {
    const consoleErrors: string[] = [];
    mainWindow.webContents.on('console-message', (ev) => {
      if (ev.level === 'error') {
        consoleErrors.push(ev.message);
      }
    });

    const cleanupSmoke = () => {
      db?.close();
      if (smokeUserData) {
        try {
          fs.rmSync(smokeUserData, { recursive: true, force: true });
        } catch {
          // ignore locked temp cleanup on Windows exit
        }
      }
    };

    const smokeTimer = setTimeout(() => {
      console.error('[SMOKE_TEST_TIMEOUT]');
      cleanupSmoke();
      app.exit(1);
    }, 15000);

    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const bridgeType = await mainWindow!.webContents.executeJavaScript(
          'typeof window.asta'
        );
        const repoCount = await mainWindow!.webContents.executeJavaScript(
          'window.asta.listRepos().then(r => r.length)'
        );
        const rootHtmlLen = await mainWindow!.webContents.executeJavaScript(
          'document.getElementById("root")?.innerHTML.length ?? 0'
        );
        const pStatus = await mainWindow!.webContents.executeJavaScript(
          'window.asta.getPortableStatus()'
        );
        clearTimeout(smokeTimer);
        if (isPortableVerify) {
          const dbExists = fs.existsSync(dbPath);
          console.log(
            `[PORTABLE_VERIFY_OK] isPortableMode=${pStatus.isPortableMode} dbExists=${dbExists} repos=${repoCount} libRoot=${pStatus.libraryRoot} consoleErrors=${consoleErrors.length}`
          );
          cleanupSmoke();
          app.exit(
            pStatus.isPortableMode &&
              dbExists &&
              repoCount > 0 &&
              consoleErrors.length === 0
              ? 0
              : 1
          );
        } else {
          console.log(
            `[SMOKE_TEST_OK] seeded=${seeded} bridge=${bridgeType} repos=${repoCount} rootHtmlLen=${rootHtmlLen} consoleErrors=${consoleErrors.length}`
          );
          cleanupSmoke();
          app.exit(
            bridgeType === 'object' &&
              repoCount > 0 &&
              rootHtmlLen > 0 &&
              consoleErrors.length === 0
              ? 0
              : 1
          );
        }
      } catch (err) {
        clearTimeout(smokeTimer);
        console.error('[SMOKE_TEST_ERROR]', err);
        cleanupSmoke();
        app.exit(1);
      }
    });
  }
}

const gotLock = isHeadlessVerify ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      db?.close();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
