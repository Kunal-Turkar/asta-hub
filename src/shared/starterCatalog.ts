export interface StarterRepoSeed {
  fullName: string;
  description: string;
  tags: string[];
  wingetId?: string;
}

export const STARTER_CATALOG: StarterRepoSeed[] = [
  {
    fullName: 'microsoft/PowerToys',
    description: 'Windows system utilities to maximize productivity (FancyZones, PowerRun, Color Picker, Text Extractor).',
    tags: ['Windows Utilities', 'Productivity', 'GUI'],
    wingetId: 'Microsoft.PowerToys',
  },
  {
    fullName: 'localsend/localsend',
    description: 'Open-source cross-platform alternative to AirDrop for fast local Wi-Fi file sharing.',
    tags: ['Networking', 'File Sharing', 'GUI'],
    wingetId: 'LocalSend.LocalSend',
  },
  {
    fullName: 'Flow-Launcher/Flow.Launcher',
    description: 'Quick file searcher and app launcher for Windows with rich plugin ecosystem.',
    tags: ['Productivity', 'Launcher', 'GUI'],
    wingetId: 'Flow-Launcher.Flow-Launcher',
  },
  {
    fullName: 'ShareX/ShareX',
    description: 'Free and open-source screen capture, file sharing, and productivity tool for Windows.',
    tags: ['Media', 'Productivity', 'GUI'],
    wingetId: 'ShareX.ShareX',
  },
  {
    fullName: 'notepad-plus-plus/notepad-plus-plus',
    description: 'Fast, lightweight source code editor and Notepad replacement for Windows.',
    tags: ['Editor', 'DevTools', 'GUI'],
    wingetId: 'Notepad++.Notepad++',
  },
  {
    fullName: 'yt-dlp/yt-dlp',
    description: 'Feature-rich command-line audio/video downloader supporting thousands of sites.',
    tags: ['Media', 'CLI'],
    wingetId: 'yt-dlp.yt-dlp',
  },
  {
    fullName: 'BurntSushi/ripgrep',
    description: 'Blazingly fast recursive regex search CLI respecting .gitignore rules.',
    tags: ['CLI', 'DevTools', 'Search'],
    wingetId: 'BurntSushi.ripgrep.MSVC',
  },
  {
    fullName: 'jesseduffield/lazygit',
    description: 'Simple terminal UI for git commands, interactive rebasing, and branch management.',
    tags: ['CLI', 'Git', 'DevTools'],
    wingetId: 'JesseDuffield.lazygit',
  },
  {
    fullName: 'sharkdp/bat',
    description: 'A cat clone with syntax highlighting, line numbers, and Git integration.',
    tags: ['CLI', 'DevTools'],
    wingetId: 'sharkdp.bat',
  },
  {
    fullName: 'helix-editor/helix',
    description: 'A post-modern modal terminal text editor written in Rust with tree-sitter support.',
    tags: ['Editor', 'CLI', 'DevTools'],
    wingetId: 'Helix.Helix',
  },
];
