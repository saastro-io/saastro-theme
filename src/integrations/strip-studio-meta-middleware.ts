import type { MiddlewareHandler } from 'astro';

/**
 * Remove the `saastro:studio-*` version meta tags from production HTML.
 *
 * The Studio integration's own middleware (`@saastro/studio/middleware`,
 * order 'pre') injects them into every HTML response so the Studio hub can
 * handshake with the page — only needed in dev, where the hub proxies the
 * dev server. It has no option to skip them at build, and it ALSO injects
 * the visibility CSS for `studio.config.json` hidden fields, so the
 * integration itself must stay enabled in prod.
 *
 * This middleware is registered 'pre' BEFORE the Studio integration (see
 * astro.config.mjs), which makes it outermost: on the response path it runs
 * after Studio's injection and can strip just the meta tags, leaving the
 * visibility style intact.
 */
const STUDIO_META_RE = /[ \t]*<meta name="saastro:studio-(?:version|package)"[^>]*>\n?/g;

export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next();
  if (import.meta.env.DEV) return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html/i.test(contentType)) return response;

  const html = await response.text();
  const stripped = html.replace(STUDIO_META_RE, '');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(stripped, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
