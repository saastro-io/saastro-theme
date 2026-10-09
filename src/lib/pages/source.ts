/**
 * De dónde sale el documento de una página `/p/<slug>`.
 *
 * Orden (contrato con el Hub, `GET /api/_public/pages/:siteId/:locale/:slug`):
 *   1. binding `env.HUB` (service binding: `fetch('https://hub/api/…')`);
 *   2. `fetch(PAGES_ORIGIN + …)`;
 *   3. la fixture `fixture.json` — SOLO si no hay ni binding ni origen, que es
 *      el caso del theme y de cualquier descendiente: `/p/demo` se ve sin Hub.
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
import { CABECERA_FIRMA, firmarCabecera } from './firma';
import { pageDocSchema, type PageDoc } from './doc';

export const TIMEOUT_MS = 1500;
export const LAST_GOOD_TTL_S = 7 * 24 * 60 * 60;

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
  | { kind: 'ok'; doc: PageDoc; source: 'hub' | 'origin' | 'fixture'; stale: false }
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

  const upstreams: { name: 'hub' | 'origin'; go: (path: string, init: RequestInit) => Promise<Response> }[] = [];
  if (opts.hub) upstreams.push({ name: 'hub', go: (p, init) => opts.hub!.fetch(`https://hub${p}`, init) });
  if (opts.origin) {
    const base = opts.origin.replace(/\/+$/, '');
    upstreams.push({ name: 'origin', go: (p, init) => fetchImpl(`${base}${p}`, init) });
  }

  if (upstreams.length === 0) {
    // Sin Hub configurado no hay borradores: la fixture es lo publicado.
    const doc = fromFixture(key, opts.fixture ?? fixtureDocs);
    return doc ? { kind: 'ok', doc, source: 'fixture', stale: false } : { kind: 'not-found' };
  }

  if (draft && !opts.secret) return { kind: 'unavailable', reason: 'borrador sin secreto' };

  const path = pagePath(key, draft);
  const reasons: string[] = [];
  for (const up of upstreams) {
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (draft) headers[CABECERA_FIRMA] = await firmarCabecera(opts.secret!, '');
      const res = await up.go(path, { headers, signal: AbortSignal.timeout(timeoutMs) });
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
        const put = opts.cache
          .put(
            lastGoodKey(key),
            new Response(JSON.stringify(parsed.data), {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=${LAST_GOOD_TTL_S}`,
              },
            }),
          )
          .catch(() => undefined);
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
