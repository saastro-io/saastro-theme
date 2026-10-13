// (3) `wrangler deploy --dry-run` (no sube nada) y medida real del bundle.
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const aqui = new URL('..', import.meta.url);
rmSync(new URL('out', aqui), { recursive: true, force: true });
const salida = execSync('npx wrangler deploy --dry-run --outdir out --metafile out/meta.json 2>&1', { cwd: aqui, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }).toString();
const js = readFileSync(new URL('out/worker.js', aqui));
const lineas = [salida.split('\n').find((l) => l.includes('Total Upload')).trim(), `worker.js bytes: ${js.length}`, `gzip -9 bytes: ${gzipSync(js, { level: 9 }).length}`];
console.log(lineas.join('\n'));
writeFileSync(new URL('resultados/dry-run.txt', aqui), lineas.join('\n') + '\n');
writeFileSync(new URL('resultados/bundle-desglose.txt', aqui), execSync('node scripts/desglose-bundle.mjs', { cwd: aqui }).toString());
