#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectName = process.argv[2];
if (!projectName) {
  console.error('Error: project name is required');
  process.exit(1);
}

const root = path.resolve(projectName);

if (fs.existsSync(root)) {
  console.error(`Error: directory "${projectName}" already exists`);
  process.exit(1);
}

console.log(`Creating ink-cartridge project: ${projectName}`);

fs.mkdirSync(path.join(root, 'src'), { recursive: true });

const pkg = {
  name: projectName,
  version: '0.0.1',
  private: true,
  type: 'module',
  scripts: {
    start: 'tsx src/index.tsx',
    dev: 'tsx watch src/index.tsx',
    build: 'tsc',
    test: 'echo "No tests yet"',
  },
  dependencies: {
    'ink-cartridge': 'latest',
    ink: '^8.0.0',
    react: '^19.3.0',
  },
  devDependencies: {
    '@types/node': '^20.19.39',
    '@types/react': '^19.3.0',
    tsx: '^4',
    typescript: '^5.9.3',
  },
};

fs.writeFileSync(
  path.join(root, 'package.json'),
  JSON.stringify(pkg, null, 2) + '\n',
);

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'Node16',
    lib: ['ES2022'],
    outDir: './dist',
    rootDir: './src',
    strict: true,
    moduleResolution: 'Node16',
    esModuleInterop: true,
    skipLibCheck: true,
    jsx: 'react',
    types: ['node'],
  },
  include: ['src/**/*'],
  exclude: ['node_modules', 'dist'],
};

fs.writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify(tsconfig, null, 2) + '\n',
);

const entry = `import React from 'react';
import { Box, Text, render } from 'ink';
import {
  registerComponent,
  ScenarioManagementProvider,
  CurrentScreen,
  useScreenSystem,
  KeyboardProvider,
  useKeyboard,
} from 'ink-cartridge';

function Menu() {
  const { skip } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  React.useEffect(() => {
    boundKeyboard(['s'], () => skip(Game));
    boundKeyboard(['q'], () => process.exit(0));
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>ink-cartridge Demo</Text>
      <Text>[S] Start  [Q] Quit</Text>
    </Box>
  );
}
registerComponent(Menu, {});

function Game() {
  const { back } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  React.useEffect(() => {
    boundKeyboard(['b'], () => back());
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Game Screen</Text>
      <Text>[B] Back to Menu</Text>
    </Box>
  );
}
registerComponent(Game, {}, { parent: Menu });

function App() {
  return (
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  );
}

render(
  <ScenarioManagementProvider defaultScreen={Menu}>
    <App />
  </ScenarioManagementProvider>,
);
`;

fs.writeFileSync(path.join(root, 'src', 'index.tsx'), entry);

console.log('Installing dependencies...');
const result = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit' });

if (result.status !== 0) {
  console.error('npm install failed. Run npm install manually.');
  process.exit(1);
}

console.log('\nDone! Run:');
console.log(`  cd ${projectName}`);
console.log('  npm start');
