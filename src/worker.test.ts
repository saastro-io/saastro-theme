import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba el comportamiento del Worker de entrada (no cadenas): con el Hub en obras,
// una página prerenderizada (`/`, `/es/`) da 503 SIN llegar a `handle()`; con pase
// válido o Hub caído se delega; `/_astro/*` nunca consulta al Hub.
const handle = vi.fn(async () => new Response('site', { status: 200 }));
vi.mock('@astrojs/cloudflare/handler', () => ({ handle }));
vi.mock('./lib/settings', () => ({
  getSettings: () => ({
    site: { name: 'Test' },
    forms: { siteId: '2b771188-8ef0-4d5f-be85-341aaece10ab' },
    maintenance: { enabled: true },
  }),
}));

const { default: worker } = await import('./worker');
const { _resetMaintenanceCache } = await import('./lib/maintenance');

const ctx = { waitUntil() {}, passThroughOnException() {} } as never;
let hub: (url: string) => Response | Promise<Response>;
let hubCalls: string[];

beforeEach(() => {
  _resetMaintenanceCache();
  handle.mockClear();
  hubCalls = [];
  hub = (url) => {
    const pase = new URL(url).searchParams.get('pase');
    return Response.json({ enabled: true, title: 'Obras', ...(pase ? { pase: pase === 'bueno1234' } : {}) });
  };
  vi.stubGlobal('fetch', async (u: string) => {
    hubCalls.push(u);
    return hub(u);
  });
});

const get = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://site.test${path}`, { headers }), {}, ctx);

describe('worker de entrada: la puerta de obras llega a lo prerenderizado', () => {
  it.each(['/', '/es/', '/legal/privacy/'])('%s da 503 con la página y no llega a handle()', async (p) => {
    const res = await get(p);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Obras');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(handle).not.toHaveBeenCalled();
  });

  it('?pase= válido: 302 con cookie; con la cookie, se delega', async () => {
    const r1 = await get('/?pase=bueno1234');
    expect(r1.status).toBe(302);
    expect(r1.headers.get('set-cookie')).toContain('saastro_pase=bueno1234');
    const r2 = await get('/', { cookie: 'saastro_pase=bueno1234' });
    expect(r2.status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('pase inválido: sigue en obras', async () => {
    expect((await get('/?pase=malo123456')).status).toBe(503);
  });

  it('Hub caído (red o 500): se sirve el site', async () => {
    hub = () => {
      throw new Error('red');
    };
    expect((await get('/')).status).toBe(200);
    _resetMaintenanceCache();
    hub = () => new Response('x', { status: 500 });
    expect((await get('/')).status).toBe(200);
  });

  it('/_astro/* y rutas con extensión: delega sin preguntar al Hub', async () => {
    expect((await get('/_astro/app.abc123.css')).status).toBe(200);
    expect((await get('/favicon.svg')).status).toBe(200);
    expect(hubCalls).toEqual([]);
  });

  it('POST no pasa por la puerta', async () => {
    const res = await worker.fetch(new Request('https://site.test/', { method: 'POST' }), {}, ctx);
    expect(res.status).toBe(200);
    expect(hubCalls).toEqual([]);
  });
});
