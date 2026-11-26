import type { DetectedStack, StackCommand } from './types';

export interface RepoInspectionInput {
  fileNames: string[];
  packageJsonScripts?: Record<string, string>;
}

export function inspectRepoFiles(input: RepoInspectionInput): DetectedStack[] {
  const names = new Set(input.fileNames.map((f) => f.trim()));
  const lowerNames = input.fileNames.map((f) => f.trim().toLowerCase());
  const stacks: DetectedStack[] = [];

  if (names.has('package.json')) {
    let pm = 'npm';
    if (names.has('pnpm-lock.yaml')) pm = 'pnpm';
    else if (names.has('yarn.lock')) pm = 'yarn';
    else if (names.has('bun.lockb') || names.has('bun.lock')) pm = 'bun';

    const commands: StackCommand[] = [
      {
        label: 'Install dependencies',
        command: pm === 'yarn' ? 'yarn install' : `${pm} install`,
        kind: 'install',
      },
    ];

    const scripts = input.packageJsonScripts ?? {};
    const runPrefix = pm === 'npm' ? 'npm run' : pm;

    if (scripts.dev) {
      commands.push({ label: 'Start dev server', command: `${runPrefix} dev`, kind: 'dev' });
    }
    if (scripts.start) {
      commands.push({ label: 'Start app', command: `${runPrefix} start`, kind: 'dev' });
    }
    if (scripts.build) {
      commands.push({ label: 'Build project', command: `${runPrefix} build`, kind: 'build' });
    }

    stacks.push({
      id: 'node',
      label: `Node.js (${pm})`,
      indicatorFile: 'package.json',
      commands,
    });
  }

  const dotnetFile = input.fileNames.find((f) => /\.(sln|csproj|fsproj)$/i.test(f));
  if (dotnetFile) {
    stacks.push({
      id: 'dotnet',
      label: '.NET / C#',
      indicatorFile: dotnetFile,
      commands: [
        { label: 'Restore packages', command: 'dotnet restore', kind: 'install' },
        { label: 'Build solution', command: 'dotnet build', kind: 'build' },
        { label: 'Run project', command: 'dotnet run', kind: 'dev' },
      ],
    });
  }

  if (names.has('pyproject.toml') || names.has('requirements.txt') || names.has('setup.py')) {
    const indicator = names.has('pyproject.toml')
      ? 'pyproject.toml'
      : names.has('requirements.txt')
        ? 'requirements.txt'
        : 'setup.py';

    const commands: StackCommand[] = [
      {
        label: 'Create virtual env',
        command: 'python -m venv .venv',
        kind: 'install',
      },
    ];

    if (names.has('requirements.txt')) {
      commands.push({
        label: 'Install requirements',
        command: '.\\.venv\\Scripts\\pip install -r requirements.txt',
        kind: 'install',
      });
    } else {
      commands.push({
        label: 'Install editable package',
        command: '.\\.venv\\Scripts\\pip install -e .',
        kind: 'install',
      });
    }

    stacks.push({
      id: 'python',
      label: 'Python',
      indicatorFile: indicator,
      commands,
    });
  }

  if (names.has('Cargo.toml')) {
    stacks.push({
      id: 'rust',
      label: 'Rust (Cargo)',
      indicatorFile: 'Cargo.toml',
      commands: [
        { label: 'Build release', command: 'cargo build --release', kind: 'build' },
        { label: 'Run app', command: 'cargo run', kind: 'dev' },
      ],
    });
  }

  if (names.has('go.mod')) {
    stacks.push({
      id: 'go',
      label: 'Go',
      indicatorFile: 'go.mod',
      commands: [
        { label: 'Download modules', command: 'go mod download', kind: 'install' },
        { label: 'Build binaries', command: 'go build ./...', kind: 'build' },
        { label: 'Run module', command: 'go run .', kind: 'dev' },
      ],
    });
  }

  const composeFile = input.fileNames.find((f) =>
    /^(docker-)?compose\.ya?ml$/i.test(f)
  );
  if (composeFile || lowerNames.includes('dockerfile')) {
    const commands: StackCommand[] = [];
    if (composeFile) {
      commands.push({
        label: 'Start containers',
        command: 'docker compose up --build',
        kind: 'dev',
      });
    } else {
      commands.push({
        label: 'Build Docker image',
        command: 'docker build -t app-local .',
        kind: 'build',
      });
    }
    stacks.push({
      id: 'docker',
      label: 'Docker',
      indicatorFile: composeFile ?? 'Dockerfile',
      commands,
    });
  }

  if (names.has('CMakeLists.txt')) {
    stacks.push({
      id: 'cmake',
      label: 'C / C++ (CMake)',
      indicatorFile: 'CMakeLists.txt',
      commands: [
        { label: 'Configure CMake', command: 'cmake -B build', kind: 'install' },
        {
          label: 'Build Release',
          command: 'cmake --build build --config Release',
          kind: 'build',
        },
      ],
    });
  }

  if (names.has('Makefile')) {
    stacks.push({
      id: 'make',
      label: 'Makefile',
      indicatorFile: 'Makefile',
      commands: [{ label: 'Run make', command: 'make', kind: 'build' }],
    });
  }

  return stacks;
}
