// (4) Desglosa el frío de resultados/tiempos-workerd.json: parseo del CSS base
// (solo ocurre en la 1.ª petición del isolate) separado de la resta.
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(new URL('../resultados/tiempos-workerd.json', import.meta.url)));
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const { n, frios, calientes } of j.crudo) {
  console.log(JSON.stringify({ n, friosMarcadosFrio: frios.filter((f) => f.frio).length + '/' + frios.length, calientesMarcadosFrio: calientes.filter((f) => f.frio).length, frioMediana: { parseBaseMs: med(frios.map((f) => f.worker.parseBase)), restaMs: med(frios.map((f) => f.worker.resta)), totalSinParseMs: med(frios.map((f) => f.worker.total)) } }));
}
