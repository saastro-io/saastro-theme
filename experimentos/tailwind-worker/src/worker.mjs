// Worker del experimento. Endpoints:
//   POST /delta            {html} → CSS delta (lo que el CSS base no trae)
//   POST /delta?reuse=1    igual, reutilizando el compilador del isolate
//   GET  /bench?n=10       compila n candidatos sintéticos y devuelve tiempos
//   GET  /reloj            ¿avanza performance.now() con CPU pura?
//   GET  /acumula?k=50     ¿un compilador reutilizado acumula candidatos?
//   POST /crudo            {candidatos} → build() SIN topes (solo para medir (7))
import { BASE_CSS, MANIFIESTO } from './assets.generated.mjs';
import { cargas, compilar } from './compilador.mjs';
import { calcularDelta, extraerCandidatos, filtrarCandidatos, parseCss, restarArbol, serializar, TOPES } from './delta.mjs';
import { candidatosSinteticos } from './sinteticos.mjs';

const manifiesto = new Set(MANIFIESTO);
let arbolBase; // se parsea en la primera petición (frío) y queda en el isolate
let compiladorReutilizado;
let peticiones = 0;

const reloj = () => performance.now();
const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req) {
    const url = new URL(req.url);
    peticiones++;
    // «frío» = el CSS base aún no se ha parseado en este isolate, es decir,
    // ninguna petición ha compilado todavía (las 404 no cuentan).
    const frio = arbolBase === undefined;
    try {
      if (url.pathname === '/delta') return await delta(req, url, frio);
      if (url.pathname === '/bench') return await bench(url, frio);
      if (url.pathname === '/reloj') return relojCpu();
      if (url.pathname === '/acumula') return await acumula(url);
      if (url.pathname === '/crudo') return await crudo(req);
      return json({ error: 'ruta' }, 404);
    } catch (e) {
      // (1) si algo del runtime falla, que se vea el error y el módulo exactos
      return json({ error: String(e?.message ?? e), stack: String(e?.stack ?? '') }, 500);
    }
  },
};

async function delta(req, url, frio) {
  const cuerpo = await req.text();
  const bytes = new TextEncoder().encode(cuerpo).length; // bytes UTF-8, no unidades UTF-16
  if (bytes > TOPES.maxBytesEntrada) return json({ error: 'entrada demasiado grande', bytes }, 413);
  const { html = '' } = JSON.parse(cuerpo);
  const t0 = reloj();
  const brutos = extraerCandidatos(html);
  const { aceptados, rechazados } = filtrarCandidatos(brutos);
  const nuevos = aceptados.filter((c) => !manifiesto.has(c));
  if (nuevos.length > TOPES.maxCandidatos) return json({ error: 'demasiados candidatos', n: nuevos.length }, 413);
  arbolBase ??= parseCss(BASE_CSS);
  const r = await calcularDelta({
    compilar: url.searchParams.has('reuse') ? () => (compiladorReutilizado ??= compilar()) : () => compilar(),
    candidatos: nuevos,
    manifiesto,
    arbolBase,
    reloj,
  });
  return json({
    frio,
    candidatos: brutos.length,
    yaEnBase: aceptados.length - nuevos.length,
    faltan: r.faltan,
    rechazados,
    msDentroDelWorker: { ...r.ms, totalConExtraccion: reloj() - t0 },
    cargas: { hojas: [...new Set(cargas.hojas)], modulos: [...new Set(cargas.modulos)] },
    delta: r.delta,
  });
}

async function bench(url, frio) {
  const n = Number(url.searchParams.get('n') ?? 10);
  const t0 = reloj();
  arbolBase ??= parseCss(BASE_CSS);
  const tParse = reloj() - t0;
  const candidatos = candidatosSinteticos(n);
  const r = await calcularDelta({ compilar: () => compilar(), candidatos, manifiesto, arbolBase, reloj });
  return json({ frio, n, faltan: r.faltan.length, deltaBytes: r.delta.length, ms: { parseBase: tParse, ...r.ms } });
}

// En producción el reloj de un Worker solo avanza con E/S; aquí se comprueba
// qué hace workerd en local con CPU pura (bucle sin E/S).
function relojCpu() {
  const t0 = performance.now();
  const d0 = Date.now();
  let x = 0;
  for (let i = 0; i < 3e8; i++) x = (x + i) % 1000003;
  return json({ performanceNowMs: performance.now() - t0, dateNowMs: Date.now() - d0, x });
}

// ¿build() acumula? Se pasan k lotes distintos al MISMO compilador y se mide
// el tamaño del CSS devuelto por el último build con un único candidato.
async function acumula(url) {
  const k = Number(url.searchParams.get('k') ?? 50);
  const c = await compilar();
  const solo = c.build(['p-[1px]']).length;
  for (let i = 0; i < k; i++) c.build([`p-[${i + 2}px]`, `m-[${i + 2}px]`]);
  const tras = c.build(['p-[1px]']).length;
  return json({ k, bytesBuildUnCandidatoAntes: solo, bytesBuildUnCandidatoDespues: tras });
}

// (7) Sin filtros ni topes: mide qué hace compile/build con entradas hostiles.
async function crudo(req) {
  const { candidatos } = JSON.parse(await req.text());
  const c = await compilar();
  const base = c.build([]); // antes: build() acumula
  const t0 = reloj();
  const css = c.build(candidatos);
  const ms = reloj() - t0;
  // Lo que los candidatos añaden, como árbol restado (la regla nueva va en
  // medio de la salida, no al final).
  const nuevo = serializar(restarArbol(parseCss(css), parseCss(base)));
  return json({ n: candidatos.length, msBuild: ms, bytesSalida: css.length - base.length, muestra: nuevo.slice(0, 300) });
}
