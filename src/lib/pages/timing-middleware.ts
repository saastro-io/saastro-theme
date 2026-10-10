import { defineMiddleware } from 'astro:middleware';
import { CABECERA_FASES_MS, serverTiming } from './handlers';

/**
 * `Server-Timing` en `/p/*` y `/__render`: la ruta pone sus fases (`firma`,
 * `doc`) y esto añade `render;dur`, `total;dur` e `isolate;desc=frio|caliente`.
 *
 * - `render` = total − fases medidas por la ruta: el render más cualquier E/S
 *   que no sea `doc` ni `firma` (p. ej. el esquema del formulario del Hub). Solo se puede medir desde
 *   fuera consumiendo el cuerpo entero (con streaming las cabeceras salen antes
 *   de que la página termine), así que esto bufferiza — solo en estas rutas,
 *   que son HTML pequeño.
 * - `total` = de la entrada al middleware al último byte del HTML. Lo que el
 *   navegador mida de TTFB por encima de `total` pasó FUERA del Worker (red,
 *   TLS, arranque del isolate, caché del borde).
 * - En workerd el reloj (`performance.now()`) NO avanza mientras se ejecuta
 *   CPU, solo tras una E/S (mitigación de Spectre). Por eso un render sin E/S
 *   sale `0` en producción: no es un error de medida, es todo lo que el
 *   runtime deja ver. Lo que sí avanza es lo que espera a la red (`doc`).
 * - `isolate;desc="frio"` en la primera petición de cada isolate (a cualquier
 *   ruta): el arranque en frío no lo ve ningún reloj del Worker y suele
 *   explicar el TTFB extra.
 * - Ojo con un HIT de la caché del borde: trae el `Server-Timing` de la copia
 *   original (el Worker no corrió); mírese junto a `cf-cache-status`.
 */
const PAGE_RE = /^\/(?:[a-z]{2}\/)?p\/[^/]+\/?$/;

let primera = true;

export const onRequest = defineMiddleware(async (context, next) => {
  const frio = primera;
  primera = false;
  const { pathname } = context.url;
  if (pathname !== '/__render' && !PAGE_RE.test(pathname)) return next();

  const t0 = performance.now();
  const response = await next();
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html') || !response.body) return response;

  const html = await response.text();
  const total = performance.now() - t0;
  const headers = new Headers(response.headers);
  const fasesMs = Number(headers.get(CABECERA_FASES_MS) ?? 0) || 0;
  headers.delete(CABECERA_FASES_MS);
  headers.delete('content-length');
  const extra = serverTiming([
    { name: 'render', dur: Math.max(0, total - fasesMs) },
    { name: 'total', dur: total },
    { name: 'isolate', desc: frio ? 'frio' : 'caliente' },
  ]);
  const prev = headers.get('server-timing');
  headers.set('server-timing', prev ? `${prev}, ${extra}` : extra);
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
});
