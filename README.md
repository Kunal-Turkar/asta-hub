# ASTA Hub

[![CI](https://github.com/Kunal-Turkar/asta-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Kunal-Turkar/asta-hub/actions/workflows/ci.yml)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)
![Electron](https://img.shields.io/badge/Electron-45-47848F?style=flat-square&logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-10B981?style=flat-square)

**Your Personal Open-Source App Store, Direct Windows Setup Runner & Git Repository Launcher.**

ASTA Hub turns a collection of GitHub repositories into a clean, actionable desktop library for Windows. Browse READMEs, automatically detect Windows `.exe` / `.msi` / portable `.zip` releases, verify SHA-256 checksums and Authenticode signatures before execution, run installed GUI and CLI tools directly inside the app, or clone source repositories with automatic stack detection.

---

## Key Features

- **Smart Windows Release Classifier**: Automatically ranks GitHub release assets for your architecture (`x64` / `arm64`) across installers (`.msi`, `.msix`, `*setup*.exe`), portable archives (`.zip`, `.7z`), and standalone `.exe` binaries—filtering out non-Windows builds.
- **Security & Trust Verification**: Streams downloads with live progress, computes SHA-256 digests, checks published `.sha256` / `SHA256SUMS` files, and inspects Windows Authenticode publisher signatures before launching or extracting.
- **Direct In-App Tool Runner**:
  - Auto-discovers installed setups across Windows Registry Uninstall keys, `Program Files`, `%LOCALAPPDATA%`, `WinGet`, and `PATH`.
  - Runs CLI/console and GUI tools directly inside **Use Tool** with live streaming output, argument helpers (insert files/folders), working directory picker, saved command presets, and **Run as Admin** support.
- **Git Clone & Stack Inspector**: Clones and pulls via local `git` (or bundled `PortableGit`), detects project stacks (`Node.js`, `.NET`, `Python`, `Rust`, `Go`, `Docker`, `CMake`, `Makefile`), and launches your editor, terminal, or setup commands.
- **Single-Folder Portable Mode**: Place `portable.flag` (or `data/`) beside the executable to keep `library.db`, portable apps, cloned repos, and cached offline setups self-contained with relative `@LIBRARY/` paths that work across drives and PCs.
- **Modern Library Experience**: Smart views (`Windows Setups`, `Installed Apps`, `Cloned Repos`, `Updates`, `Missing on PC`, `Favorites`), collections/tags, `Ctrl+K` command palette, dark/light themes, JSON catalog export/import, and optional GitHub Star import.

---

## Tech Stack

- **Desktop Shell & Backend**: Electron, TypeScript, Node.js
- **Frontend UI**: React 19, Vite, Tailwind CSS v4, Lucide Icons, `react-markdown`
- **Local Persistence**: SQLite via `sql.js` (zero native build dependencies)
- **Packaging**: `electron-builder` (NSIS Setup `.exe`, standalone portable `.exe`, and unpacked portable folder)

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm
- Git (optional for cloning; PortableGit supported under `data/tools/git/`)

### Development & Run
```bash
npm install
npm run dev       # Vite dev server + Electron hot launch
npm start         # Build main + renderer and launch Electron
npm test          # Run automated unit tests
```

### Build Windows Setups & Portable Bundle
```bash
npm run pack:win              # Builds NSIS Setup .exe + standalone portable .exe in dist-package/
npm run pack:portable-folder  # Builds instant-launch single folder dist-package/ASTA-Hub-Portable/
```

---

## Portable Transfer Workflow

To carry **ASTA Hub + all your installed portable tools + cloned repos + database** onto another Windows PC:
1. Run `npm run pack:portable-folder` (or place a `data/` folder or `portable.flag` next to `ASTA Hub.exe`).
2. Copy the single folder onto a USB drive or another PC.
3. Launch `ASTA Hub.exe` — internal paths use relative `@LIBRARY/` tokens so apps and repositories continue working across drive letters, while any PC-specific system installers appear in **Missing on PC** with 1-click offline re-setup.

---

## License

[MIT](LICENSE)
