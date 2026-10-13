// (3) Desglose del bundle de `wrangler deploy --dry-run --outdir out --metafile out/meta.json`.
import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(new URL('../out/meta.json', import.meta.url)));
const out = m.outputs['out/worker.js'];
const g = {};
for (const [f, v] of Object.entries(out.inputs)) {
  let k = f.replace(/.*experimentos\/tailwind-worker\//, '');
  if (f.includes('node_modules/')) {
    const r = f.split('node_modules/').pop().split('/');
    k = r[0].startsWith('@') ? `${r[0]}/${r[1]}` : r[0];
  }
  g[k] = (g[k] ?? 0) + v.bytesInOutput;
}
for (const [k, v] of Object.entries(g).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(36), (v / 1024).toFixed(1).padStart(7), 'KiB');
console.log('TOTAL worker.js'.padEnd(36), (out.bytes / 1024).toFixed(1).padStart(7), 'KiB');

// Tamaño en texto (UTF-8) de lo empaquetado en src/assets.generated.mjs.
const a = await import('../src/assets.generated.mjs');
const kib = (t) => (Buffer.byteLength(t) / 1024).toFixed(1);
const hojas = Object.entries(a.STYLESHEETS).map(([k, v]) => `${k} ${kib(v)}`).join(' · ');
const totalHojas = kib(Object.values(a.STYLESHEETS).join(''));
console.log(`assets (KiB de texto): hojas ${totalHojas} = ${hojas} · THEME_CSS ${kib(a.THEME_CSS)} · BASE_CSS ${kib(a.BASE_CSS)} · MANIFIESTO (JSON) ${kib(JSON.stringify(a.MANIFIESTO))}`);
