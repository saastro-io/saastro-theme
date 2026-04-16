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
 */

import { cpSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const serverDir = resolve(root, 'dist/server');
const workerDir = resolve(root, 'dist/client/_worker.js');

// Clean any previous worker bundle
rmSync(workerDir, { recursive: true, force: true });
mkdirSync(workerDir, { recursive: true });

// Copy worker files (skip wrangler.json — CF Pages handles bindings via dashboard)
for (const name of ['entry.mjs', 'virtual_astro_middleware.mjs', 'chunks']) {
  cpSync(resolve(serverDir, name), resolve(workerDir, name), { recursive: true });
}

// CF Pages needs _worker.js/index.js as the ESM entry point
writeFileSync(resolve(workerDir, 'index.js'), 'export { default } from "./entry.mjs";\n');

console.log('CF Pages bundle ready → dist/client/_worker.js/');
