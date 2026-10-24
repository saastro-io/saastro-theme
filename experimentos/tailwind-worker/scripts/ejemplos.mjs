// Evidencias sueltas, contra `wrangler dev` en :8799, guardadas en resultados/:
//   ejemplo-delta.json      (§1) respuesta completa de POST /delta
//   reloj.json              (§4) ¿avanza performance.now() con CPU pura?
//   acumula.json            (§4) build() de un compilador reutilizado acumula
//   reutilizar-compilador.json (§4) 4 contenidos seguidos con ?reuse=1
// Hace falta un isolate recién arrancado: el ejemplo va primero (frío) y la
// secuencia ?reuse=1 crea su compilador en la 1.ª de sus peticiones.
import { writeFileSync } from 'node:fs';
const W = process.env.WORKER ?? 'http://localhost:8799';
const guardar = (f, o) => writeFileSync(new URL(`../resultados/${f}`, import.meta.url), JSON.stringify(o, null, 2) + '\n');
const post = async (ruta, html) => (await fetch(`${W}${ruta}`, { method: 'POST', body: JSON.stringify({ html }) })).json();

guardar('ejemplo-delta.json', await post('/delta', '<div class="bg-[#ff6600] md:grid-cols-3 text-[13px] dark:bg-black hover:underline p-4"></div>'));
const reuse = [];
for (const c of ['bg-[#111111]', 'bg-[#222222]', 'bg-[#333333]', 'bg-[#333333]']) {
  const j = await post('/delta?reuse=1', `<p class="${c}"></p>`);
  reuse.push({ clase: c, ms: j.msDentroDelWorker, reglasBgEnDelta: (j.delta.match(/\.bg-/g) ?? []).length });
}
guardar('reutilizar-compilador.json', reuse);
guardar('acumula.json', await (await fetch(`${W}/acumula?k=50`)).json());
guardar('reloj.json', await (await fetch(`${W}/reloj`)).json());
console.log(JSON.stringify(reuse));
