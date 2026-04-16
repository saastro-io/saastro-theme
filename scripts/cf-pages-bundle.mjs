/**
 * Post-build script for Cloudflare Pages deployment.
 *
 * @astrojs/cloudflare v13 outputs:
 *   dist/client/  — static assets
 *   dist/server/  — worker (entry.mjs, chunks/, etc.)
 *
 * CF Pages expects the worker at _worker.js/ inside the assets directory.
 * This script copies dist/server/ → dist/client/_worker.js/ and creates
 * the index.js entry point that CF Pages requires.
 *
 * Note: wrangler.json is intentionally excluded — CF Pages handles
 * bindings via the dashboard, not via the worker bundle.
 */

import { cpSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const serverDir = resolve(root, 'dist/server');
const workerDir = resolve(root, 'dist/client/_worker.js');

// Clean any previous worker bundle
rmSync(workerDir, { recursive: true, force: true });
mkdirSync(workerDir, { recursive: true });

// Copy only JS worker files — exclude config and dev secrets
const EXCLUDE = new Set(['wrangler.json', '.wrangler', '.dev.vars', '.prerender']);
for (const name of readdirSync(serverDir)) {
  if (EXCLUDE.has(name)) continue;
  cpSync(resolve(serverDir, name), resolve(workerDir, name), { recursive: true });
}

// CF Pages needs _worker.js/index.js as the ESM entry point
writeFileSync(resolve(workerDir, 'index.js'), 'export { default } from "./entry.mjs";\n');

console.log('✓ CF Pages bundle ready → dist/client/_worker.js/');
console.log('  Files:', readdirSync(workerDir).join(', '));
