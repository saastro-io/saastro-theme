import { defineMiddleware } from 'astro:middleware';
import { createProcessor } from 'beasties/runtime';
import { PLAN_SUFFIX, PROCESSOR_OPTIONS } from './critical-css-config.mjs';

/**
 * CSS crítico en las rutas SSR (`/lp/*`, `/p/<slug>`, 404…).
 *
 * Las rutas prerenderizadas las procesa el build (`critical-css.mjs`); estas no
 * pasan por el build, así que el Worker hace el mismo trabajo con el mismo motor
 * (`beasties/runtime`, sin dependencias, ~27 kB): lee los `<link rel=stylesheet>`
 * de la respuesta, carga el plan precompilado de cada hoja
 * (`<hoja>.css.plan.json`, un asset más que el build deja junto a ella), deja
 * inline solo las reglas que esa página usa y mueve el `<link>` al final del
 * `<body>`.
 *
 * Por qué leer los nombres de la respuesta y no del build: la hoja lleva un hash
 * en el nombre que solo existe cuando el build cliente termina, y el bundle del
 * Worker se construye antes. El HTML que se va a entregar ya trae esos nombres.
 *
 * NUNCA rompe una respuesta: sin binding de assets (dev), sin plan, con un
 * plan roto o ante cualquier excepción devuelve el HTML tal como salió de la
 * página, con su `<link>` bloqueante de siempre. El control
 * `scripts/critical-css-check.mjs` es quien falla si una ruta SSR pierde su
 * crítico, para que ese «degradar sin ruido» no se quede en silencio.
 */

type Processor = ReturnType<typeof createProcessor>;
type Plan = Parameters<typeof createProcessor>[0][number];

/** Planes ya leídos y decodificados, por hoja. Viven lo que viva el isolate. */
const planes = new Map<string, Promise<Plan | null>>();
/** Procesadores por conjunto de hojas (2 ó 3 combinaciones en la práctica). */
const procesadores = new Map<string, Processor>();
const MAX_PROCESADORES = 32;

const LINK_CSS = /<link\b[^>]*>/gi;

/** Hojas locales (`href` empieza por `/`) que la respuesta enlaza como estilo. */
function hojasEnlazadas(html: string): string[] {
  const head = html.slice(0, html.search(/<\/head>/i));
  const out: string[] = [];
  for (const tag of head.match(LINK_CSS) ?? []) {
    if (!/\brel=["']?stylesheet\b/i.test(tag)) continue;
    const href = /\bhref=["']?(\/(?!\/)[^"'\s>]+)/i.exec(tag)?.[1];
    if (href && !out.includes(href)) out.push(href);
  }
  return out;
}

async function leerPlan(origin: string, href: string, assets: { fetch: typeof fetch }): Promise<Plan | null> {
  const hit = planes.get(href);
  if (hit) return hit;
  const p = (async () => {
    try {
      const r = await assets.fetch(new Request(new URL(href + PLAN_SUFFIX, origin)));
      if (!r.ok) return null;
      return (await r.json()) as Plan;
    } catch {
      return null;
    }
  })();
  planes.set(href, p);
  // Un fallo no se recuerda: el siguiente intento vuelve a leer.
  void p.then((v) => {
    if (v === null) planes.delete(href);
  });
  return p;
}

async function assetsBinding(): Promise<{ fetch: typeof fetch } | null> {
  try {
    // @ts-ignore — el theme no trae @cloudflare/workers-types; el módulo es del runtime de workerd.
    const { env } = await import('cloudflare:workers');
    const a = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    return a && typeof a.fetch === 'function' ? a : null;
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.request.method !== 'GET') return response;
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  if (!response.body || response.status === 204 || response.status === 304) return response;

  const html = await response.text();
  const devolver = (cuerpo: string) => {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(cuerpo, { status: response.status, statusText: response.statusText, headers });
  };

  try {
    // Solo documentos completos: un fragmento (`/__render`) no se toca.
    if (!/^\s*<!doctype html/i.test(html) || !/<\/head>/i.test(html)) return devolver(html);
    const hojas = hojasEnlazadas(html);
    if (hojas.length === 0) return devolver(html);

    const assets = await assetsBinding();
    if (!assets) return devolver(html);

    const clave = hojas.join('|');
    let procesador = procesadores.get(clave);
    if (!procesador) {
      const leidos = await Promise.all(hojas.map((h) => leerPlan(context.url.origin, h, assets)));
      const conPlan = leidos.filter((p): p is Plan => p !== null);
      // Hoja sin plan → no se toca esa hoja (el procesador deja intacto su `<link>`).
      if (conPlan.length === 0) return devolver(html);
      if (procesadores.size >= MAX_PROCESADORES) procesadores.clear();
      procesador = createProcessor(conPlan, PROCESSOR_OPTIONS);
      // Solo se recuerda un procesador completo: si faltó algún plan se reintenta.
      if (conPlan.length === hojas.length) procesadores.set(clave, procesador);
    }
    return devolver(procesador.process(html));
  } catch {
    return devolver(html);
  }
});
