import { describe, expect, it, vi } from 'vitest';
import { DOC_TTL_S, docKey, keyFromTag, lastGoodKey, loadPage, pagePath, purgeDocs } from './source';
import crypto from 'node:crypto';
import { verificarFirma } from './firma';

const KEY = { siteId: 'site1', locale: 'es', slug: 'demo' };
const DOC = {
  v: 1,
  siteId: 'site1',
  locale: 'es',
  slug: 'demo',
  rev: 7,
  seo: { title: 'T', description: 'D' },
  blocks: [{ id: 'f', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } }],
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** `caches.default` de juguete: un Map con la API de Cache que usa source.ts. */
function memCache() {
  const m = new Map<string, string>();
  return {
    store: m,
    cache: {
      put: async (k: string, r: Response) => void m.set(k, await r.text()),
      match: async (k: string) => (m.has(k) ? new Response(m.get(k)) : undefined),
      delete: async (k: string) => m.delete(k),
    } as unknown as Cache,
  };
}

describe('loadPage', () => {
  it('sin binding ni origen: la fixture `demo` en es y en en', async () => {
    const es = await loadPage(KEY);
    expect(es).toMatchObject({ kind: 'ok', source: 'fixture', stale: false, doc: { slug: 'demo', locale: 'es', siteId: 'site1' } });
    const en = await loadPage({ ...KEY, locale: 'en' });
    expect(en).toMatchObject({ kind: 'ok', source: 'fixture', doc: { locale: 'en' } });
    expect(await loadPage({ ...KEY, slug: 'otra' })).toEqual({ kind: 'not-found' });
  });

  it('el binding HUB va primero, con la ruta del contrato', async () => {
    const hub = { fetch: vi.fn(async () => ok({ doc: DOC })) };
    const fetchImpl = vi.fn();
    const r = await loadPage(KEY, { hub, origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ kind: 'ok', source: 'hub', doc: { rev: 7 } });
    expect(hub.fetch).toHaveBeenCalledWith('https://hub/api/_public/pages/site1/es/demo', expect.anything());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('si el binding falla, PAGES_ORIGIN; y guarda el último bueno', async () => {
    const hub = { fetch: vi.fn(async () => new Response('x', { status: 500 })) };
    const fetchImpl = vi.fn(async () => ok({ doc: DOC }));
    const { cache, store } = memCache();
    const r = await loadPage(KEY, { hub, origin: 'https://hub.x/', fetchImpl: fetchImpl as unknown as typeof fetch, cache });
    expect(r).toMatchObject({ kind: 'ok', source: 'origin' });
    expect(fetchImpl).toHaveBeenCalledWith('https://hub.x/api/_public/pages/site1/es/demo', expect.anything());
    expect(JSON.parse(store.get(lastGoodKey(KEY))!)).toMatchObject({ rev: 7 });
  });

  it('el 404 del Hub es la verdad: no se reintenta ni se sirve copia', async () => {
    const { cache } = memCache();
    await cache.put(lastGoodKey(KEY), new Response(JSON.stringify(DOC)));
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, cache })).toEqual({ kind: 'not-found' });
  });

  it('origen caído: la copia con stale; sin copia, unavailable', async () => {
    const down = vi.fn(async () => {
      throw new DOMException('t', 'TimeoutError');
    });
    const { cache } = memCache();
    expect(await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: down as unknown as typeof fetch, cache })).toMatchObject({ kind: 'unavailable' });
    await cache.put(lastGoodKey(KEY), new Response(JSON.stringify(DOC)));
    expect(await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: down as unknown as typeof fetch, cache })).toMatchObject({
      kind: 'ok',
      source: 'last-good',
      stale: true,
      doc: { rev: 7 },
    });
  });

  it('documento fuera de contrato cuenta como fallo del origen', async () => {
    const fetchImpl = vi.fn(async () => ok({ doc: { ...DOC, v: 2 } }));
    expect(await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ kind: 'unavailable' });
  });

  it('pasa el timeout de 1.500 ms como señal', async () => {
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return ok({ doc: DOC });
    });
    await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('borrador: ?draft=1 firmado con cuerpo vacío, nunca rancio ni guardado', async () => {
    let sig: string | null = null;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`https://hub.x${pagePath(KEY, true)}`);
      expect(url.endsWith('?draft=1')).toBe(true);
      sig = (init?.headers as Record<string, string>)['x-saastro-sig'];
      return ok({ doc: DOC });
    });
    const { cache, store } = memCache();
    const r = await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, cache, draft: true, secret: 'S' });
    expect(r).toMatchObject({ kind: 'ok', source: 'origin' });
    const ruta = '/api/_public/pages/site1/es/demo?draft=1';
    expect(await verificarFirma('S', sig, { siteId: 'site1', metodo: 'GET', ruta, cuerpo: '' })).toEqual({ ok: true });
    // Byte a byte contra un vector calculado a mano con node:crypto.
    const t = /^t=(\d+),/.exec(sig ?? '')![1];
    expect(sig).toBe(`t=${t},v1=${crypto.createHmac('sha256', 'S').update(`${t}.site1.GET.${ruta}.`).digest('hex')}`);
    expect(store.size).toBe(0);
    expect(await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, draft: true })).toMatchObject({ kind: 'unavailable' });
  });

  it('borrador: la ruta firmada es la que ve el Hub (origen con prefijo, binding)', async () => {
    const sigs: Record<string, string> = {};
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      sigs[url] = (init?.headers as Record<string, string>)['x-saastro-sig'];
      return new Response('x', { status: 500 });
    });
    const hub = { fetch: vi.fn(async (url: string, init?: RequestInit) => {
      sigs[url] = (init?.headers as Record<string, string>)['x-saastro-sig'];
      return new Response('x', { status: 500 });
    }) };
    await loadPage(KEY, { hub, origin: 'https://hub.x/base/', fetchImpl: fetchImpl as unknown as typeof fetch, draft: true, secret: 'S' });
    const p = '/api/_public/pages/site1/es/demo?draft=1';
    for (const [url, ruta] of [[`https://hub${p}`, p], [`https://hub.x/base${p}`, `/base${p}`]]) {
      expect(await verificarFirma('S', sigs[url], { siteId: 'site1', metodo: 'GET', ruta, cuerpo: '' })).toEqual({ ok: true });
    }
  });
});

describe('caché del DOCUMENTO publicado (no del HTML)', () => {
  it('la clave no lleva host: es del documento, igual para todos los hosts', () => {
    expect(docKey(KEY)).toBe('https://pages-doc.saastro.internal/api/_public/pages/site1/es/demo');
    expect(docKey(KEY)).not.toMatch(/prototipo|enlolab/);
    expect(DOC_TTL_S).toBe(60);
  });

  it('el primer acceso lee el Hub y guarda el documento; el segundo sale de la caché sin red', async () => {
    const fetchImpl = vi.fn(async () => ok({ doc: DOC }));
    const { cache, store } = memCache();
    const opts = { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, cache };
    expect(await loadPage(KEY, opts)).toMatchObject({ kind: 'ok', source: 'origin' });
    expect(JSON.parse(store.get(docKey(KEY))!)).toMatchObject({ rev: 7 });
    expect(await loadPage(KEY, opts)).toMatchObject({ kind: 'ok', source: 'cache', doc: { rev: 7 } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('un borrador ni lee ni escribe la caché del documento', async () => {
    const { cache, store } = memCache();
    await cache.put(docKey(KEY), new Response(JSON.stringify({ ...DOC, rev: 1 })));
    const fetchImpl = vi.fn(async () => ok({ doc: DOC }));
    const r = await loadPage(KEY, { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, cache, draft: true, secret: 'S' });
    expect(r).toMatchObject({ source: 'origin', doc: { rev: 7 } });
    expect(JSON.parse(store.get(docKey(KEY))!)).toMatchObject({ rev: 1 });
  });

  it('purgeDocs borra el documento del tag pg:… y el siguiente acceso vuelve al Hub', async () => {
    const fetchImpl = vi.fn(async () => ok({ doc: DOC }));
    const { cache, store } = memCache();
    const opts = { origin: 'https://hub.x', fetchImpl: fetchImpl as unknown as typeof fetch, cache };
    await loadPage(KEY, opts);
    expect(await purgeDocs(cache, ['pg:site1:es:demo', 'pg:site1:en:otra'])).toBe(1);
    expect(store.has(docKey(KEY))).toBe(false);
    expect(store.has(lastGoodKey(KEY))).toBe(true);
    expect(await loadPage(KEY, opts)).toMatchObject({ source: 'origin' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(keyFromTag('pg:s:es:demo')).toEqual({ siteId: 's', locale: 'es', slug: 'demo' });
    expect(keyFromTag('astro-path:/p/demo')).toBeNull();
    expect(await purgeDocs(null, ['pg:s:es:demo'])).toBe(0);
  });
});
