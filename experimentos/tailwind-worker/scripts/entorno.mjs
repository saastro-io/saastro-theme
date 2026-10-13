// Versiones del entorno en el que se midió → resultados/entorno.json
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const sh = (c) => execSync(c, { cwd: new URL('..', import.meta.url) }).toString().trim();
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const e = { node: process.version, plataforma: `${process.platform} ${process.arch}`, chromium: nav.version(), wrangler: sh('npx wrangler --version').split('\n').pop(), tailwindcss: sh("node -p \"require('./node_modules/tailwindcss/package.json').version\""), workerd: sh("node -p \"require('./node_modules/workerd/package.json').version\"") };
await nav.close();
console.log(e);
writeFileSync(new URL('../resultados/entorno.json', import.meta.url), JSON.stringify(e, null, 2) + '\n');
