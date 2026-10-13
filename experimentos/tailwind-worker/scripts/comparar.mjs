// (5) Correctitud. Para cada contenido de contenidos/:
//   A. Delta del WORKER (POST /delta a wrangler dev) vs build NORMAL con la CLI
//      de Tailwind 4.3.3 en Node (fixtures/global.css + @source del contenido):
//      regla a regla, por ruta de bloques (layer › media › selector), texto
//      serializado con el mismo serializador a ambos lados.
//   B. Delta del Worker vs delta calculado en Node con el mismo código: bytes.
//   C. Comportamiento en Chromium: getComputedStyle de cada elemento con
//      (ref) CSS del build conjunto y (base+delta), en claro, oscuro (.dark),
//      375 y 1280 px de ancho y :hover forzado con el ratón; control: base sola.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright-core';
import { BASE_CSS, MANIFIESTO } from '../src/assets.generated.mjs';
import { compilar } from '../src/compilador.mjs';
import { calcularDelta, extraerCandidatos, filtrarCandidatos, parseCss, serializar } from '../src/delta.mjs';

const aqui = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = process.env.WORKER ?? 'http://localhost:8799';
const leer = (p) => readFileSync(join(aqui, p), 'utf8');

const contenidos = {
  hero: leer('contenidos/hero.html'),
  markdown: `<article class="prose prose-lg dark:prose-invert prose-a:text-[#ff6600] max-w-none">\n${marked.parse(leer('contenidos/articulo.md'))}</article>\n`,
  inventada: leer('contenidos/inventada.html'),
  conflicto: leer('contenidos/conflicto.html'),
};

// Hojas: bloques con declaraciones directas, con su ruta de preludes.
function hojas(nodos, ruta = [], out = []) {
  for (const nd of nodos) {
    if (nd.tipo !== 'bloque') continue;
    const r = [...ruta, nd.prelude];
    const decls = nd.hijos.filter((h) => h.tipo === 'decl');
    if (decls.length) out.push({ ruta: r.join(' › '), texto: serializar([{ ...nd, hijos: decls }]) });
    hojas(nd.hijos, r, out);
  }
  return out;
}

const informe = {};
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [nombre, html] of Object.entries(contenidos)) {
  writeFileSync(join(aqui, `fixtures/render-${nombre}.html`), html);
  // Build normal (referencia): theme + fuentes del site + el contenido nuevo.
  const entrada = join(aqui, `fixtures/ref-${nombre}.input.css`);
  writeFileSync(entrada, readFileSync(join(aqui, 'fixtures/global.css'), 'utf8') + `\n@source "./render-${nombre}.html";\n`);
  const refPath = join(aqui, `fixtures/ref-${nombre}.css`);
  execFileSync(join(aqui, 'node_modules/.bin/tailwindcss'), ['-i', entrada, '-o', refPath, '--cwd', join(aqui, 'fixtures/vacio')], { stdio: 'ignore' });
  const ref = readFileSync(refPath, 'utf8');

  const w = await (await fetch(`${WORKER}/delta`, { method: 'POST', body: JSON.stringify({ html }) })).json();
  if (w.error) throw new Error(`${nombre}: ${w.error}`);
  const { aceptados } = filtrarCandidatos(extraerCandidatos(html));
  const manifiesto = new Set(MANIFIESTO);
  const n = await calcularDelta({ compilar: () => compilar(), candidatos: aceptados.filter((c) => !manifiesto.has(c)), manifiesto, arbolBase: parseCss(BASE_CSS) });

  // A. regla a regla
  const refHojas = new Map();
  for (const h of hojas(parseCss(ref))) refHojas.set(h.ruta, [...(refHojas.get(h.ruta) ?? []), h.texto]);
  const comparacion = hojas(parseCss(w.delta)).map((h) => {
    const enRef = refHojas.get(h.ruta);
    // Un bloque de variables del theme en el delta es, por diseño, un
    // SUBCONJUNTO del de la referencia (solo las variables nuevas): se acepta
    // si cada declaración aparece idéntica en el bloque de la referencia.
    const lineas = (t) => t.split('\n').slice(1, -2);
    const estado = !enRef ? 'AUSENTE_EN_REF' : enRef.includes(h.texto) ? 'IDENTICA'
      : enRef.some((r) => lineas(h.texto).every((l) => lineas(r).includes(l))) ? 'SUBCONJUNTO_IDENTICO' : 'DISTINTA';
    return { ruta: h.ruta, estado, ...(estado === 'DISTINTA' ? { delta: h.texto, ref: enRef[0] } : {}) };
  });

  // C. comportamiento en Chromium
  const estilos = async (css, ancho, oscuro) => {
    const page = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
    await page.setContent(`<!doctype html><html${oscuro ? ' class="dark"' : ''}><head><style>${css}</style></head><body>${html}</body></html>`);
    const leerTodo = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('body *')].map((el) => {
          const cs = getComputedStyle(el);
          const o = {};
          for (const p of cs) o[p] = cs.getPropertyValue(p);
          return o;
        }),
      );
    const normal = await leerTodo();
    const hover = [];
    const els = await page.$$('body *');
    for (let i = 0; i < els.length; i++) {
      if (!(await els[i].evaluate((e) => /hover:/.test(e.className)))) continue;
      await els[i].hover();
      hover.push({ i, estilo: (await leerTodo())[i] });
      await page.mouse.move(0, 0);
    }
    await page.close();
    return { normal, hover };
  };
  const diferencias = (a, b) => {
    const out = [];
    a.normal.forEach((o, i) => { for (const p in o) if (o[p] !== b.normal[i][p]) out.push({ el: i, prop: p, ref: o[p], otro: b.normal[i][p] }); });
    a.hover.forEach((h, k) => { for (const p in h.estilo) if (h.estilo[p] !== b.hover[k].estilo[p]) out.push({ el: h.i, hover: true, prop: p, ref: h.estilo[p], otro: b.hover[k].estilo[p] }); });
    return out;
  };
  const navegadorRes = {};
  for (const ancho of [375, 1280]) for (const oscuro of [false, true]) {
    const clave = `${ancho}px-${oscuro ? 'oscuro' : 'claro'}`;
    const rRef = await estilos(ref, ancho, oscuro);
    const rDelta = await estilos(BASE_CSS + '\n' + w.delta, ancho, oscuro);
    const rBase = await estilos(BASE_CSS, ancho, oscuro);
    const dDelta = diferencias(rRef, rDelta);
    const difsHoverControl = diferencias(rRef, rBase).filter((d) => d.hover).length;
    navegadorRes[clave] = { elementos: rRef.normal.length, elementosConHover: rRef.hover.length, difsHoverSoloBase_control: difsHoverControl, difsBaseMasDelta: dDelta.length, difsSoloBase_control: diferencias(rRef, rBase).length, detalle: dDelta.slice(0, 6) };
  }

  informe[nombre] = {
    candidatos: extraerCandidatos(html).length,
    faltan: w.faltan,
    deltaBytes: w.delta.length,
    workerIgualQueNodeByteAByte: w.delta === n.delta,
    reglas: { total: comparacion.length, identicas: comparacion.filter((c) => c.estado === 'IDENTICA').length, subconjuntoIdentico: comparacion.filter((c) => c.estado === 'SUBCONJUNTO_IDENTICO').map((c) => c.ruta), distintas: comparacion.filter((c) => c.estado === 'DISTINTA'), ausentesEnRef: comparacion.filter((c) => c.estado === 'AUSENTE_EN_REF') },
    navegador: navegadorRes,
  };
  writeFileSync(join(aqui, `resultados/delta-${nombre}.css`), w.delta);
  console.log(nombre, JSON.stringify({ ...informe[nombre], reglas: { ...informe[nombre].reglas, distintas: informe[nombre].reglas.distintas.length, ausentesEnRef: informe[nombre].reglas.ausentesEnRef.length }, navegador: Object.fromEntries(Object.entries(navegadorRes).map(([k, v]) => [k, [v.difsBaseMasDelta, v.difsSoloBase_control]])) }));
}
await navegador.close();
writeFileSync(join(aqui, 'resultados/correctitud.json'), JSON.stringify(informe, null, 2));
