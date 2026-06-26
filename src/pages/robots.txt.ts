// Generated robots.txt — the Sitemap line is derived from the canonical
// SITE_URL (via `Astro.site`) so it always matches the deployed domain. This
// replaces a static public/robots.txt, which hardcoded the template host and
// silently shipped the wrong Sitemap URL to descendant sites.
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = site ? new URL('sitemap-index.xml', site).href : '/sitemap-index.xml';
  const body = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
