import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sitemapIncludes } from './sitemap-filter';

describe('sitemapIncludes', () => {
  it('excluye las rutas internas', () => {
    for (const p of [
      'https://x.io/__render/',
      'https://x.io/es/__render/',
      'https://x.io/__purge',
      'https://x.io/__blocks.json',
    ]) {
      expect(sitemapIncludes(p), p).toBe(false);
    }
  });

  it('deja las páginas indexables', () => {
    for (const p of [
      'https://x.io/',
      'https://x.io/about/',
      'https://x.io/es/',
      'https://x.io/blog/dark-mode-implementation/',
      'https://x.io/es/legal/privacy/',
    ]) {
      expect(sitemapIncludes(p), p).toBe(true);
    }
  });
});

// Si hay un build en dist, su sitemap real no puede traer rutas internas.
describe('sitemap del build', () => {
  const file = fileURLToPath(new URL('../../dist/client/sitemap-0.xml', import.meta.url));
  it.skipIf(!existsSync(file))('no lista __render ni otras rutas __*', () => {
    const locs = [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.filter((l) => !sitemapIncludes(l))).toEqual([]);
  });
});

// El predicado solo sirve si la integración lo usa. Este test corre en CI (sin
// build previo): falla si alguien quita el `filter` de `sitemap({...})`.
describe('astro.config.mjs', () => {
  it('cablea sitemapIncludes como filter de la integración de sitemap', () => {
    const cfg = readFileSync(fileURLToPath(new URL('../../astro.config.mjs', import.meta.url)), 'utf8');
    const call = cfg.slice(cfg.indexOf('sitemap({'));
    expect(call.slice(0, call.indexOf('icon()'))).toMatch(/filter:\s*sitemapIncludes\b/);
    expect(cfg).toMatch(/import \{ sitemapIncludes \} from '\.\/src\/lib\/sitemap-filter(\.ts)?'/);
  });
});
