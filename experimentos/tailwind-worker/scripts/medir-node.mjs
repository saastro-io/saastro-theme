// (4) Referencia en Node 22: el MISMO compilar()/calcularDelta() que el Worker,
// con CPU de proceso (process.cpuUsage) además del reloj.
import { writeFileSync } from 'node:fs';
import { BASE_CSS, MANIFIESTO } from '../src/assets.generated.mjs';
import { compilar } from '../src/compilador.mjs';
import { calcularDelta, parseCss } from '../src/delta.mjs';
import { candidatosSinteticos } from '../src/sinteticos.mjs';

const manifiesto = new Set(MANIFIESTO);
const arbolBase = parseCss(BASE_CSS);
const filas = [];
for (const n of [10, 100, 500]) {
  for (let k = 0; k < 11; k++) {
    const c0 = process.cpuUsage();
    const r = await calcularDelta({ compilar: () => compilar(), candidatos: candidatosSinteticos(n), manifiesto, arbolBase, reloj: () => performance.now() });
    const cpu = process.cpuUsage(c0);
    filas.push({ n, iter: k, ...r.ms, cpuMs: (cpu.user + cpu.system) / 1000 });
  }
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const res = [10, 100, 500].map((n) => {
  const f = filas.filter((x) => x.n === n);
  const cal = f.slice(1);
  return { n, primeraDelProceso: { totalMs: +f[0].total.toFixed(1), cpuMs: +f[0].cpuMs.toFixed(1) }, calienteMediana: { compileMs: +med(cal.map((x) => x.compile)).toFixed(1), buildMs: +med(cal.map((x) => x.build)).toFixed(1), totalMs: +med(cal.map((x) => x.total)).toFixed(1), cpuMs: +med(cal.map((x) => x.cpuMs)).toFixed(1) } };
});
console.log(JSON.stringify(res, null, 1));
writeFileSync(new URL('../resultados/tiempos-node.json', import.meta.url), JSON.stringify(res, null, 2));
