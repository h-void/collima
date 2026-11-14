#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(rootDir, 'web');
const distIndex = resolve(webDir, 'dist', 'index.html');
const wasmEntry = resolve(webDir, 'src', 'wasm-pkg', 'collima_core.js');

if (process.env.SKIP_WEB_BUILD === '1' && existsSync(distIndex)) {
  console.log('[collima] SKIP_WEB_BUILD=1 and web/dist/index.html exists — reusing prebuilt frontend.');
  process.exit(0);
}

if (!existsSync(wasmEntry) || process.env.FORCE_WASM_BUILD === '1') {
  console.log('[collima] Building collima-core WebAssembly package...');
  execSync('npm run build:wasm', { cwd: webDir, stdio: 'inherit' });
}

console.log('[collima] Building Vite frontend bundle...');
execSync('npm run build', { cwd: webDir, stdio: 'inherit' });
