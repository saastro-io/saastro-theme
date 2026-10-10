/**
 * De dónde sale el documento de una página `/p/<slug>`.
 *
 * Orden (contrato con el Hub, `GET /api/_public/pages/:siteId/:locale/:slug`):
 *   1. binding `env.HUB` (service binding: `fetch('https://hub/api/…')`);
 *   2. `fetch(PAGES_ORIGIN + …)`;
 *   3. la fixture `fixture.json` — SOLO si no hay ni binding ni origen, que es
 *      el caso del theme y de cualquier descendiente: `/p/demo` se ve sin Hub.
 *
 * Lo publicado se cachea como DOCUMENTO en `caches.default` (`docKey`, 60 s):
 * el documento no depende del host, el HTML sí (tema por host), así que la
 * caché vive en el documento y el HTML se pinta en cada petición. NO se usa la
 * caché de rutas de Cloudflare para `/p/*`: medido el 10-oct, su clave ignora
 * host y query y servía la página de un host en el otro. `POST /__purge` borra
 * el documento (`purgeDocs`); `caches.default` es por centro de datos, así que
 * en los demás el TTL corto acota lo rancio a 60 s.
 *
 * Un 404 del Hub es la verdad (la página no existe o no está publicada) y no
 * se reintenta. Cualquier otro fallo —timeout de 1.500 ms, 5xx, JSON que no
 * cumple el contrato— pasa al siguiente origen; si se acaban, se sirve el
 * «último bueno» de `caches.default` (7 días) marcado como rancio, y sin
 * copia, `unavailable` (la ruta responde 503 + Retry-After).
 *
 * Puro a propósito: el runtime (binding, secreto, caché, waitUntil) entra por
 * `SourceOptions`, así que esto se prueba en node sin workerd.
 */
import fixtureDocs from './fixture.json';
import { CABECERA_FIRMA, firmarPeticion, rutaDe } from './firma';
import { pageDocSchema, type PageDoc } from './doc';

export const TIMEOUT_MS = 1500;
export const LAST_GOOD_TTL_S = 7 * 24 * 60 * 60;
/** Vida del documento publicado en `caches.default` (por centro de datos). */
export const DOC_TTL_S = 60;

export interface PageKey {
  siteId: string;
  locale: string;
  slug: string;
}

interface Fetcher {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface SourceOptions {
  /** Service binding al Worker del Hub (`env.HUB`). */
  hub?: Fetcher | null;
  /** `PAGES_ORIGIN`, p. ej. `https://hub.saastro.io`. */
  origin?: string | null;
  /** Leer el BORRADOR (`?draft=1` firmado). Necesita `secret`. */
  draft?: boolean;
  secret?: string | null;
  /** `caches.default` en workerd. Ausente en dev/tests. */
  cache?: Cache | null;
  waitUntil?: ((p: Promise<unknown>) => void) | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  fixture?: unknown;
}

export type LoadResult =
  | { kind: 'ok'; doc: PageDoc; source: 'hub' | 'origin' | 'fixture' | 'cache'; stale: false }
  | { kind: 'ok'; doc: PageDoc; source: 'last-good'; stale: true }
  | { kind: 'not-found' }
  | { kind: 'unavailable'; reason: string };

export function pagePath(key: PageKey, draft = false): string {
  const p = `/api/_public/pages/${encodeURIComponent(key.siteId)}/${encodeURIComponent(key.locale)}/${encodeURIComponent(key.slug)}`;
  return draft ? `${p}?draft=1` : p;
}

/** Clave sintética del «último bueno» en `caches.default` (nunca sale a la red). */
export function lastGoodKey(key: PageKey): string {
  return `https://pages-last-good.saastro.internal${pagePath(key)}`;
}

/**
 * Clave del documento publicado en `caches.default`. Sin host A PROPÓSITO: es
 * el documento (igual para todos los hosts), no el HTML. Nunca sale a la red.
 */
export function docKey(key: PageKey): string {
  return `https://pages-doc.saastro.internal${pagePath(key)}`;
}

/** `pg:<siteId>:<locale>:<slug>` → su `PageKey` (null si no es un tag de página). */
export function keyFromTag(tag: string): PageKey | null {
  const m = /^pg:([^:\s]+):([^:\s]+):([a-z0-9][a-z0-9-]*)$/.exec(tag);
  return m ? { siteId: m[1], locale: m[2], slug: m[3] } : null;
}

/** Borra de `caches.default` el documento de cada tag `pg:…` (vale para todos los hosts). */
export async function purgeDocs(cache: Cache | null | undefined, tags: string[]): Promise<number> {
  if (!cache) return 0;
  let n = 0;
  for (const t of tags) {
    const k = keyFromTag(t);
    if (k && (await cache.delete(docKey(k)))) n++;
  }
  return n;
}

function fromFixture(key: PageKey, fixture: unknown): PageDoc | null {
  const list = Array.isArray(fixture) ? fixture : [];
  for (const raw of list) {
    const parsed = pageDocSchema.safeParse(raw);
    if (parsed.success && parsed.data.locale === key.locale && parsed.data.slug === key.slug) {
      // La fixture es del theme, no de un site: se presenta con el siteId pedido.
      return { ...parsed.data, siteId: key.siteId };
    }
  }
  return null;
}

export async function loadPage(key: PageKey, opts: SourceOptions = {}): Promise<LoadResult> {
  const draft = opts.draft === true;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  const upstreams: { name: 'hub' | 'origin'; url: (path: string) => string; go: (url: string, init: RequestInit) => Promise<Response> }[] = [];
  if (opts.hub) upstreams.push({ name: 'hub', url: (p) => `https://hub${p}`, go: (u, init) => opts.hub!.fetch(u, init) });
  if (opts.origin) {
    const base = opts.origin.replace(/\/+$/, '');
    upstreams.push({ name: 'origin', url: (p) => `${base}${p}`, go: (u, init) => fetchImpl(u, init) });
  }

  if (upstreams.length === 0) {
    // Sin Hub configurado no hay borradores: la fixture es lo publicado.
    const doc = fromFixture(key, opts.fixture ?? fixtureDocs);
    return doc ? { kind: 'ok', doc, source: 'fixture', stale: false } : { kind: 'not-found' };
  }

  if (draft && !opts.secret) return { kind: 'unavailable', reason: 'borrador sin secreto' };

  // Lo publicado, del documento en caché si está (un borrador, nunca).
  if (!draft && opts.cache) {
    try {
      const hit = await opts.cache.match(docKey(key));
      if (hit) {
        const parsed = pageDocSchema.safeParse(await hit.json());
        if (parsed.success && parsed.data.locale === key.locale && parsed.data.slug === key.slug) {
          return { kind: 'ok', doc: parsed.data, source: 'cache', stale: false };
        }
      }
    } catch {
      // Caché ilegible = ir al origen.
    }
  }

  const path = pagePath(key, draft);
  const reasons: string[] = [];
  for (const up of upstreams) {
    try {
      const url = up.url(path);
      const headers: Record<string, string> = { accept: 'application/json' };
      // La ruta firmada es la que VE el Hub (pathname+search de la URL final:
      // un `PAGES_ORIGIN` con prefijo de ruta la cambia), atada al siteId.
      if (draft) {
        headers[CABECERA_FIRMA] = await firmarPeticion(opts.secret!, { siteId: key.siteId, metodo: 'GET', ruta: rutaDe(url), cuerpo: '' });
      }
      const res = await up.go(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) {
        await res.body?.cancel();
        return { kind: 'not-found' };
      }
      if (!res.ok) {
        await res.body?.cancel();
        reasons.push(`${up.name}: ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { doc?: unknown };
      const parsed = pageDocSchema.safeParse(json?.doc);
      if (!parsed.success || parsed.data.locale !== key.locale || parsed.data.slug !== key.slug) {
        reasons.push(`${up.name}: documento fuera de contrato`);
        continue;
      }
      if (!draft && opts.cache) {
        const guardar = (k: string, ttl: number) =>
          opts.cache!.put(
            k,
            new Response(JSON.stringify(parsed.data), {
              headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
            }),
          );
        const put = Promise.all([guardar(docKey(key), DOC_TTL_S), guardar(lastGoodKey(key), LAST_GOOD_TTL_S)]).catch(() => undefined);
        if (opts.waitUntil) opts.waitUntil(put);
        else await put;
      }
      return { kind: 'ok', doc: parsed.data, source: up.name, stale: false };
    } catch (err) {
      reasons.push(`${up.name}: ${(err as Error)?.name ?? 'error'}`);
    }
  }

  // Un borrador nunca se sirve rancio: la vista previa enseña lo que hay o nada.
  if (!draft && opts.cache) {
    try {
      const hit = await opts.cache.match(lastGoodKey(key));
      if (hit) {
        const parsed = pageDocSchema.safeParse(await hit.json());
        if (parsed.success) return { kind: 'ok', doc: parsed.data, source: 'last-good', stale: true };
      }
    } catch {
      // Caché ilegible = sin copia.
    }
  }
  return { kind: 'unavailable', reason: reasons.join('; ') };
}
