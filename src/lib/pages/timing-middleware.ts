import { defineMiddleware } from 'astro:middleware';

/**
 * `Server-Timing: …, render;dur=<ms>` en `/p/*` y `/__render`.
 *
 * La página fija `doc;dur` (y los bloques omitidos) antes de pintar; el render
 * solo se puede medir desde fuera, consumiendo el cuerpo entero: con streaming
 * las cabeceras salen antes de que la página termine. Por eso esto bufferiza
 * — solo en estas rutas, que son HTML pequeño — y resta el tiempo del
 * documento que la página dejó en `x-saastro-doc-ms`.
 */
const PAGE_RE = /^\/(?:[a-z]{2}\/)?p\/[^/]+\/?$/;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== '/__render' && !PAGE_RE.test(pathname)) return next();

  const t0 = performance.now();
  const response = await next();
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html') || !response.body) return response;

  const html = await response.text();
  const total = performance.now() - t0;
  const headers = new Headers(response.headers);
  const docMs = Number(headers.get('x-saastro-doc-ms') ?? 0) || 0;
  headers.delete('x-saastro-doc-ms');
  headers.delete('content-length');
  const render = `render;dur=${Math.max(0, Math.round((total - docMs) * 10) / 10)}`;
  const prev = headers.get('server-timing');
  headers.set('server-timing', prev ? `${prev}, ${render}` : render);
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
});
