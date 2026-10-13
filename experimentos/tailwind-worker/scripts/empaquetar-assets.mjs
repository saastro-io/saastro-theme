// Prepara lo que el Worker no puede leer de disco y el CSS base del site.
//
// 1. fixtures/global.css   = src/styles/global.css del theme, con los @source
//                            reapuntados a ../../../src (para la CLI en Node).
// 2. fixtures/base.css     = CSS base del site: build NORMAL con la CLI de
//                            Tailwind 4.3.3 escaneando los fuentes reales del theme.
// 3. src/assets.generated.mjs = hojas de estilo empaquetadas como texto
//                            (loadStylesheet), el CSS del theme sin @source, el
//                            CSS base y su manifiesto de clases.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifiestoDeClases } from '../src/delta.mjs';

const aqui = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(p, 'utf8');

const original = leer(join(aqui, '../../src/styles/global.css'));
mkdirSync(join(aqui, 'fixtures/vacio'), { recursive: true });
writeFileSync(join(aqui, 'fixtures/global.css'), original.replaceAll('@source "../', '@source "../../../src/'));

// --cwd a un directorio vacío: sin autodetección de fuentes, solo los @source.
execFileSync(
  join(aqui, 'node_modules/.bin/tailwindcss'),
  ['-i', join(aqui, 'fixtures/global.css'), '-o', join(aqui, 'fixtures/base.css'), '--cwd', join(aqui, 'fixtures/vacio')],
  { stdio: 'inherit' },
);
const base = leer(join(aqui, 'fixtures/base.css'));

// Mismo mapa id → fichero que resolvería Node; el Worker no resuelve nada.
const hojas = {
  tailwindcss: 'tailwindcss/index.css',
  'tw-animate-css': 'tw-animate-css/dist/tw-animate.css',
  'shadcn/tailwind.css': 'shadcn/dist/tailwind.css',
  '@fontsource-variable/geist': '@fontsource-variable/geist/index.css',
};
const STYLESHEETS = Object.fromEntries(
  Object.entries(hojas).map(([id, rel]) => [id, leer(join(aqui, 'node_modules', rel))]),
);
const THEME_CSS = original.replace(/^@source .*$/gm, '');
const manifiesto = [...manifiestoDeClases(base)].sort();

writeFileSync(
  join(aqui, 'src/assets.generated.mjs'),
  `// GENERADO por scripts/empaquetar-assets.mjs — no editar.\n` +
    `export const STYLESHEETS = ${JSON.stringify(STYLESHEETS)};\n` +
    `export const THEME_CSS = ${JSON.stringify(THEME_CSS)};\n` +
    `export const BASE_CSS = ${JSON.stringify(base)};\n` +
    `export const MANIFIESTO = ${JSON.stringify(manifiesto)};\n`,
);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
console.log(
  JSON.stringify(
    {
      hojasKB: Object.fromEntries(Object.entries(STYLESHEETS).map(([k, v]) => [k, kb(v)])),
      themeKB: kb(THEME_CSS),
      baseKB: kb(base),
      clasesEnManifiesto: manifiesto.length,
      manifiestoKB: kb(JSON.stringify(manifiesto)),
    },
    null,
    2,
  ),
);
