#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauriCli = resolve(rootDir, 'web', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [tauriCli, ...args], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
