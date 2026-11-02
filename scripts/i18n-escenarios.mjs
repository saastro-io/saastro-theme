#!/usr/bin/env node
/**
 * i18n-escenarios.mjs — construye el theme en COPIAS temporales con otra
 * configuración de idiomas y comprueba typecheck, build, rutas, sitemap,
 * hreflang, 404 y `studio:check`. Es MANUAL (cada escenario son ~4 builds):
 * no va en CI. Guía y cómo leer la salida: docs/idiomas.md.
 *
 *   node scripts/i18n-escenarios.mjs                 # control + A + A2 + B + C
 *   node scripts/i18n-escenarios.mjs B C             # solo esos
 *   I18N_PORT=4497 node scripts/i18n-escenarios.mjs  # puerto del preview (por defecto 4497)
 *
 * Escenarios (la copia no toca este checkout):
 *   0   control: la config actual del repo, sin tocar (debe pasar `studio:check` tal cual)
 *   A   enabled:false                  → solo el idioma base
 *   A2  locales ['es'], base es        → un solo idioma
 *   B   base es + en                   → base distinta de en
 *   C   base es + en + fr              → tres idiomas, con un fr.json y legal/fr de PRUEBA
 *
 * En A, A2, B y C se corre `pnpm studio:contract:update` antes de `studio:check`:
 * el manifiesto firmado es de los idiomas del repo y cambiar de idiomas lo regenera
 * (esperado). Los fixtures de C (fr.json, legal/fr) viven solo en la copia.
 * Sale con código 1 si alguna comprobación falla.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.I18N_PORT || 4497);
const SITE = 'https://theme.saastro.io';
const ENV = { ...process.env, SITE_URL: SITE, FORCE_COLOR: '0', NO_COLOR: '1', CI: 'true' };

/** @typedef {{ loc: string, alternates: Record<string,string> }} SitemapUrl */

// ---------------------------------------------------------------- escenarios
const ESCENARIOS = {
  0: {
    nombre: 'control (config actual)',
    config: null,
    contrato: false,
    rutas: ['/', '/about/', '/blog/', '/legal/privacy/', '/es/', '/es/about/', '/es/legal/privacy/'],
    ausentes: ['/fr/'],
    lang: { '/': 'en', '/es/': 'es' },
    sitemap: { '/': { en: '/', es: '/es/' }, '/es/': { en: '/', es: '/es/' } },
    selector: true,
    xDefault: '/',
    preview: { '/': 200, '/es/': 200, '/fr/': 404, '/no-existe': 404, '/es/no-existe': 404 },
    notFoundTexto: { '/no-existe': 'Page not found', '/es/no-existe': 'Página no encontrada' },
  },
  A: {
    nombre: 'enabled:false',
    config: { enabled: false, defaultLocale: 'en', locales: ['en', 'es'] },
    contrato: true,
    rutas: ['/', '/about/', '/blog/', '/legal/privacy/'],
    ausentes: ['/es/', '/es/about/', '/es/legal/privacy/'],
    lang: { '/': 'en' },
    sitemap: { '/': {} },
    selector: false,
    xDefault: null,
    preview: { '/': 200, '/es/': 404, '/no-existe': 404 },
    notFoundTexto: { '/no-existe': 'Page not found' },
  },
  A2: {
    nombre: "locales ['es'], base es",
    config: { enabled: true, defaultLocale: 'es', locales: ['es'] },
    contrato: true,
    rutas: ['/', '/about/', '/blog/', '/legal/privacy/'],
    ausentes: ['/en/', '/es/', '/en/legal/privacy/'],
    lang: { '/': 'es' },
    sitemap: { '/': {} },
    selector: false,
    xDefault: null,
    preview: { '/': 200, '/en/': 404, '/es/': 404, '/no-existe': 404 },
    notFoundTexto: { '/no-existe': 'Página no encontrada' },
  },
  B: {
    nombre: 'base es + en',
    config: { enabled: true, defaultLocale: 'es', locales: ['es', 'en'] },
    contrato: true,
    rutas: ['/', '/about/', '/legal/privacy/', '/en/', '/en/about/', '/en/legal/privacy/'],
    ausentes: ['/es/', '/es/about/'],
    lang: { '/': 'es', '/en/': 'en' },
    sitemap: { '/': { es: '/', en: '/en/' }, '/en/': { es: '/', en: '/en/' } },
    selector: true,
    xDefault: '/',
    preview: { '/': 200, '/en/': 200, '/es/': 404, '/no-existe': 404, '/en/no-existe': 404 },
    notFoundTexto: { '/no-existe': 'Página no encontrada', '/en/no-existe': 'Page not found' },
  },
  C: {
    nombre: 'base es + en + fr (fr.json y legal/fr de prueba)',
    config: { enabled: true, defaultLocale: 'es', locales: ['es', 'en', 'fr'] },
    contrato: true,
    fixtureFr: true,
    rutas: ['/', '/en/', '/fr/', '/fr/about/', '/fr/legal/privacy/', '/en/legal/privacy/'],
    ausentes: ['/es/'],
    lang: { '/': 'es', '/en/': 'en', '/fr/': 'fr' },
    // `<title>` de /fr/ empieza por «FR »: prueba de que fr.json SE USA (no cae al base)
    titulo: { '/fr/': /^FR / },
    sitemap: {
      '/': { es: '/', en: '/en/', fr: '/fr/' },
      '/fr/': { es: '/', en: '/en/', fr: '/fr/' },
    },
    selector: true,
    xDefault: '/',
    preview: { '/': 200, '/fr/': 200, '/fr/legal/privacy/': 200, '/es/': 404, '/fr/no-existe': 404 },
    notFoundTexto: { '/fr/no-existe': 'Page introuvable' },
  },
};

// ------------------------------------------------------------------- utils
const resultados = [];
let fallos = 0;
function check(esc, nombre, ok, detalle = '') {
  resultados.push({ esc, nombre, ok, detalle });
  if (!ok) fallos++;
  console.log(`  ${ok ? 'ok ' : 'FALLA'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function run(cwd, cmd, args, env = ENV) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function copiar(dest) {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const f of r.stdout.split('\0').filter(Boolean)) {
    const src = join(ROOT, f);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    cpSync(src, join(dest, f));
  }
  // Un node_modules enlazado lo rechaza pnpm (quiere reinstalar): instalación real, desde el store.
  const i = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dest, env: ENV, encoding: 'utf8' });
  if (i.status !== 0) throw new Error(`pnpm install falló en la copia: ${i.stdout}${i.stderr}`);
}

function aplicarConfig(dir, c) {
  const p = join(dir, 'src/i18n/config.ts');
  let s = readFileSync(p, 'utf8');
  const bloque = `export const i18nConfig = {
  enabled: ${c.enabled},
  defaultLocale: '${c.defaultLocale}',
  locales: [${c.locales.map((l) => `'${l}'`).join(', ')}],
} as const;`;
  const n = s.replace(/export const i18nConfig = \{[\s\S]*?\} as const;/, bloque);
  if (n === s && !s.includes(bloque)) throw new Error('no pude reescribir i18nConfig');
  s = n;
  // localeLabels: una entrada por idioma declarado
  const labels = `export const localeLabels: Record<Locale, string> = {\n${c.locales
    .map((l) => `  ${l}: '${l.toUpperCase()}',`)
    .join('\n')}\n};`;
  s = s.replace(/export const localeLabels[\s\S]*?\n\};/, labels);
  writeFileSync(p, s);

  // not-found.ts: el tipo Record<Locale,…> pide una entrada por idioma declarado
  const nf = join(dir, 'src/lib/not-found.ts');
  let t = readFileSync(nf, 'utf8');
  const copy = {
    en: ['Page not found', "Sorry, we couldn't find the page you're looking for.", 'Go back home'],
    es: ['Página no encontrada', 'Lo sentimos, no hemos encontrado la página que buscas.', 'Volver al inicio'],
    fr: ['Page introuvable', "Désolé, nous n'avons pas trouvé la page que vous cherchez.", "Retour à l'accueil"],
  };
  const entradas = c.locales
    .map(
      (l) => `  ${l}: {
    title: ${JSON.stringify(copy[l][0])},
    heading: ${JSON.stringify(copy[l][0])},
    body: ${JSON.stringify(copy[l][1])},
    home: ${JSON.stringify(copy[l][2])},
  },`,
    )
    .join('\n');
  t = t.replace(
    /export const notFoundCopy: Record<Locale, NotFoundCopy> = \{[\s\S]*\n\};/,
    `export const notFoundCopy: Record<Locale, NotFoundCopy> = {\n${entradas}\n};`,
  );
  writeFileSync(nf, t);
}

function fixtureFr(dir) {
  const en = JSON.parse(readFileSync(join(dir, 'src/i18n/translations/en.json'), 'utf8'));
  en.meta.title = `FR ${en.meta.title}`;
  writeFileSync(join(dir, 'src/i18n/translations/fr.json'), JSON.stringify(en, null, 2));
  // Solo FIXTURE de la copia: el texto legal real no se redacta aquí.
  cpSync(join(dir, 'src/content/legal/en'), join(dir, 'src/content/legal/fr'), { recursive: true });
}

function rutasHtml(dist) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${rel}/${e.name}`);
      else if (e.name === 'index.html') out.push(rel === '' ? '/' : `${rel}/`);
    }
  };
  walk(dist, '');
  return out.sort();
}

/** @returns {Map<string, Record<string,string>>} */
function leerSitemap(dist) {
  const xml = readFileSync(join(dist, 'sitemap-0.xml'), 'utf8');
  const m = new Map();
  for (const u of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]*)<\/loc>/.exec(u[1])?.[1] ?? '';
    const alts = {};
    for (const a of u[1].matchAll(/<xhtml:link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g))
      alts[a[1]] = a[2].replace(SITE, '');
    m.set(loc.replace(SITE, ''), alts);
  }
  return m;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function escuchando(puerto) {
  const r = spawnSync('lsof', ['-ti', `tcp:${puerto}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean).map(Number);
}

async function preview(dir, esc, e) {
  if (escuchando(PORT).length) {
    check(esc, `puerto ${PORT} libre`, false, 'ya hay algo escuchando; usa I18N_PORT=<otro>');
    return;
  }
  const hijo = spawn(join(dir, 'node_modules/.bin/astro'), ['preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: dir,
    env: ENV,
    stdio: 'ignore',
  });
  try {
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) {
      await esperar(500);
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/`, { redirect: 'manual' });
        listo = r.status > 0;
      } catch {
        /* aún no */
      }
    }
    check(esc, 'preview arranca', listo);
    if (!listo) return;
    for (const [ruta, estado] of Object.entries(e.preview)) {
      const r = await fetch(`http://127.0.0.1:${PORT}${ruta}`, { redirect: 'manual' });
      check(esc, `preview ${ruta} → ${estado}`, r.status === estado, `fue ${r.status}`);
      const texto = e.notFoundTexto?.[ruta];
      if (texto) check(esc, `404 ${ruta} en su idioma («${texto}»)`, (await r.text()).includes(texto));
    }
  } finally {
    // Matar SOLO lo que escucha en NUESTRO puerto (y el hijo que lanzamos). Nunca pkill.
    for (const pid of escuchando(PORT)) {
      try {
        process.kill(pid);
      } catch {
        /* ya no está */
      }
    }
    try {
      hijo.kill();
    } catch {
      /* ya no está */
    }
    await esperar(500);
    check(esc, `puerto ${PORT} liberado`, escuchando(PORT).length === 0);
  }
}

// ------------------------------------------------------------------- main
async function escenario(esc) {
  const e = ESCENARIOS[esc];
  console.log(`\n=== ${esc}: ${e.nombre}`);
  const dir = mkdtempSync(join(tmpdir(), `i18n-${esc}-`));
  copiar(dir);
  if (e.config) aplicarConfig(dir, e.config);
  if (e.fixtureFr) fixtureFr(dir);

  const tc = run(dir, 'pnpm', ['typecheck']);
  check(esc, 'typecheck exit 0', tc.code === 0, tc.code ? tc.out.split('\n').filter((l) => /error/i.test(l)).slice(0, 3).join(' | ') : '');
  const b = run(dir, 'pnpm', ['build']);
  check(esc, 'build exit 0', b.code === 0, b.code ? b.out.split('\n').filter((l) => /error/i.test(l)).slice(0, 3).join(' | ') : '');
  if (b.code !== 0) return dir;

  const dist = join(dir, 'dist/client');
  const rutas = rutasHtml(dist);
  console.log(`  rutas (${rutas.length}): ${rutas.join(' ')}`);
  for (const r of e.rutas) check(esc, `existe ${r}`, rutas.includes(r));
  for (const r of e.ausentes) check(esc, `NO existe ${r}`, !rutas.includes(r));

  const sm = leerSitemap(dist);
  console.log(`  sitemap (${sm.size} URLs)`);
  for (const [loc, alts] of Object.entries(e.sitemap)) {
    const real = sm.get(loc) ?? null;
    check(esc, `sitemap ${loc} hreflang ${JSON.stringify(alts)}`, real !== null && JSON.stringify(sortKeys(real)) === JSON.stringify(sortKeys(alts)), real ? JSON.stringify(real) : 'URL ausente');
  }
  for (const loc of sm.keys()) check(esc, `sitemap ${loc} existe en dist`, rutas.includes(loc));

  for (const [ruta, lang] of Object.entries(e.lang)) {
    const html = readFileSync(join(dist, ruta, 'index.html'), 'utf8');
    check(esc, `${ruta} <html lang=${lang}>`, new RegExp(`<html[^>]*\\blang="${lang}"`).test(html));
    const tit = e.titulo?.[ruta];
    if (tit) check(esc, `${ruta} <title> usa su traducción`, tit.test(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''));
  }
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  const alt = [...home.matchAll(/<link[^>]*rel="alternate"[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)].map((m) => `${m[1]}=${m[2].replace(SITE, '')}`);
  const xd = alt.find((a) => a.startsWith('x-default='));
  if (e.xDefault) check(esc, `home x-default → ${e.xDefault}`, xd === `x-default=${e.xDefault}`, alt.join(' '));
  else check(esc, 'home sin <link rel=alternate hreflang>', alt.length === 0, alt.join(' '));
  check(esc, e.selector ? 'home con selector de idioma' : 'home SIN selector de idioma', /LocaleSelector/.test(home) === e.selector);

  await preview(dir, esc, e);

  if (e.contrato) {
    const u = run(dir, 'pnpm', ['studio:contract:update']);
    check(esc, 'studio:contract:update exit 0', u.code === 0, u.code ? u.out.slice(-300) : '');
  }
  const s = run(dir, 'pnpm', ['studio:check']);
  const cruces = (s.out.match(/✖/g) ?? []).length;
  check(esc, 'studio:check exit 0 y 0 ✖', s.code === 0 && cruces === 0, `exit ${s.code}, ${cruces} ✖`);
  return dir;
}

function sortKeys(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

const pedidos = process.argv.slice(2);
const lista = pedidos.length ? pedidos : Object.keys(ESCENARIOS);
for (const l of lista) if (!ESCENARIOS[l]) { console.error(`escenario desconocido: ${l}`); process.exit(2); }
const dirs = [];
for (const esc of lista) dirs.push(await escenario(esc));
console.log(`\nResumen: ${resultados.length - fallos}/${resultados.length} comprobaciones ok, ${fallos} fallos.`);
console.log(`Copias en: ${dirs.filter(Boolean).join(' ')}  (bórralas a mano cuando no las necesites)`);
process.exit(fallos ? 1 : 0);
