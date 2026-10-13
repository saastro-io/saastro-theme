// (6) ¿El manifiesto (clases sacadas de los selectores del CSS base) dice la
// verdad? Falso positivo = una clase del manifiesto cuyo build aporta reglas
// que la base no tiene (se la saltaría el Worker y quedaría sin estilo).
// Falso negativo = una clase fuera del manifiesto cuyo build no aporta nada.
import { writeFileSync } from 'node:fs';
import { BASE_CSS, MANIFIESTO } from '../src/assets.generated.mjs';
import { compilar } from '../src/compilador.mjs';
import { parseCss, restarArbol, serializar } from '../src/delta.mjs';
import { candidatosSinteticos } from '../src/sinteticos.mjs';

const arbolBase = parseCss(BASE_CSS);
const deltaDe = async (cands) => serializar(restarArbol(parseCss((await compilar()).build(cands)), arbolBase));

const t0 = performance.now();
const todoElManifiesto = await deltaDe(MANIFIESTO);
const falsosPositivos = [];
if (todoElManifiesto.trim()) for (const c of MANIFIESTO) if ((await deltaDe([c])).trim()) falsosPositivos.push(c);

const manifiesto = new Set(MANIFIESTO);
const fuera = candidatosSinteticos(200).filter((c) => !manifiesto.has(c));
const falsosNegativos = [];
for (const c of fuera) if (!(await deltaDe([c])).trim()) falsosNegativos.push(c);

const r = {
  clasesEnManifiesto: MANIFIESTO.length,
  deltaDeTodoElManifiestoBytes: todoElManifiesto.length,
  deltaDeTodoElManifiesto: todoElManifiesto.slice(0, 400),
  falsosPositivos,
  candidatosFueraProbados: fuera.length,
  falsosNegativos,
  ms: Math.round(performance.now() - t0),
};
console.log(JSON.stringify(r, null, 1));
writeFileSync(new URL('../resultados/manifiesto.json', import.meta.url), JSON.stringify(r, null, 2));
