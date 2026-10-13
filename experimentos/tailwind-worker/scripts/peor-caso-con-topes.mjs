// (7) Peor caso DENTRO de los topes: 500 candidatos distintos de ~120 chars,
// con variantes (4) y calc anidado, por /delta. 6 peticiones seguidas en el mismo isolate.
import { writeFileSync } from 'node:fs';
const W = process.env.WORKER ?? 'http://localhost:8799';
const cand = (i) => {
  let v = `${i}px`;
  while (`sm:md:hover:dark:w-[calc(${v}+1px)]`.length <= 120) v = `calc(${v}+1px)`;
  return `sm:md:hover:dark:w-[${v}]`;
};
const lista = Array.from({ length: 500 }, (_, i) => cand(i));
const html = `<div class="${lista.join(' ')}"></div>`;
const filas = [];
for (let k = 0; k < 6; k++) {
  const t0 = performance.now();
  const j = await (await fetch(`${W}/delta`, { method: 'POST', body: JSON.stringify({ html }) })).json();
  filas.push({ paredMs: Math.round(performance.now() - t0), worker: j.msDentroDelWorker, faltan: j.faltan?.length, rechazados: j.rechazados?.length, deltaKB: Math.round((j.delta?.length ?? 0) / 1024), error: j.error });
}
const r = { longitudMax: Math.max(...lista.map((c) => c.length)), entradaKB: Math.round(html.length / 1024), filas };
console.log(JSON.stringify(r, null, 1));
writeFileSync(new URL('../resultados/seguridad-peor-caso.json', import.meta.url), JSON.stringify(r, null, 2));
