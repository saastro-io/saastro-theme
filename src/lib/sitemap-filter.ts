/**
 * Qué URLs NO van al sitemap. Lo usa el `filter` de la integración de sitemap
 * en `astro.config.mjs`.
 *
 * La integración lista todas las rutas prerenderizadas, y las del módulo
 * `pages` de Studio (`/__render`, `/__purge`, `/__blocks.json`) son internas
 * del Worker: responden 404 sin sus secretos y no son contenido. Medido en
 * dist: solo `/__render/` se colaba. Se excluye todo segmento que empiece por
 * `__`, que es la convención de rutas internas de este theme.
 */
export function sitemapIncludes(page: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(page).pathname;
  } catch {
    pathname = page;
  }
  return !pathname.split('/').some((segment) => segment.startsWith('__'));
}
