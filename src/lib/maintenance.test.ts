/**
 * «Página en construcción»: los cuatro casos del encargo (flag apagado, 503,
 * pase, Hub caído) más el escape de lo que viene del Hub.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_MS,
  _resetMaintenanceCache,
  decideMaintenance,
  esRutaExenta,
  fetchMaintenance,
  parseCookie,
  paseCookie,
  parseMaintenance,
  renderMaintenanceHtml,
  respondMaintenance,
  resolveMaintenance,
  retryAfterSeconds,
} from './maintenance';
import { getSettings } from './settings';

const cfg = { siteId: '2b771188-8ef0-4d5f-be85-341aaece10ab', hubOrigin: 'https://hub.test' };
const ON = { enabled: true, title: 'Vuelvo', message: 'Obras', returnAt: null, contactEmail: '', logoUrl: null, accentColor: null };
const json = (b: unknown, ok = true) => async () => ({ ok, json: async () => b }) as Response;
const conPase = (pase: boolean) => async (u: string) =>
  ({ ok: true, json: async () => (u.includes('pase=') ? { ...ON, pase } : ON) }) as Response;

beforeEach(() => _resetMaintenanceCache());

describe('flag', () => {
  it('la plantilla sale APAGADA', () => {
    expect(resolveMaintenance(getSettings())).toBeNull();
  });
  it.each([[undefined], [{}], [{ enabled: false }], [{ enabled: 'false' }]])('apagado con %j', (m) => {
    expect(resolveMaintenance({ forms: { siteId: cfg.siteId, contactFormSlug: 'c' }, maintenance: m })).toBeNull();
  });
  it('encendido sin siteId válido = apagado', () => {
    expect(resolveMaintenance({ forms: { siteId: '', contactFormSlug: 'c' }, maintenance: { enabled: true } })).toBeNull();
  });
  it('encendido con siteId', () => {
    expect(resolveMaintenance({ forms: { siteId: cfg.siteId, contactFormSlug: 'c' }, maintenance: { enabled: true } })?.siteId).toBe(cfg.siteId);
  });
});

describe('decideMaintenance', () => {
  it('Hub dice enabled:false → pass', async () => {
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: null }, json({ enabled: false }))).action).toBe('pass');
  });
  it('enabled sin pase → block', async () => {
    const d = await decideMaintenance(cfg, { queryPase: null, cookiePase: null }, json(ON));
    expect(d.action).toBe('block');
    expect(d.state?.title).toBe('Vuelvo');
  });
  it('?pase válido → setpase con el token', async () => {
    expect(await decideMaintenance(cfg, { queryPase: 'tokentoken1', cookiePase: null }, conPase(true))).toEqual({ action: 'setpase', token: 'tokentoken1' });
  });
  it('cookie válida → pass (sin re-poner cookie)', async () => {
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: 'tokentoken1' }, conPase(true))).action).toBe('pass');
  });
  it('pase inválido o revocado → block', async () => {
    expect((await decideMaintenance(cfg, { queryPase: 'malmalmal1', cookiePase: null }, conPase(false))).action).toBe('block');
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: 'malmalmal1' }, conPase(false))).action).toBe('block');
  });
  it.each([
    ['red caída', async () => { throw new Error('boom'); }],
    ['5xx', json({}, false)],
    ['JSON basura', json('hola')],
    ['sin enabled', json({ x: 1 })],
  ])('Hub caído (%s) → FALLA ABIERTO', async (_n, f) => {
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: null }, f as never)).action).toBe('pass');
  });
  it('Hub cuelga → el timeout aborta y se sirve el site', async () => {
    const cuelga = (_u: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))));
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: null }, cuelga as never)).action).toBe('pass');
  }, 10_000);
  it('Hub cae al validar el pase (estado ya conocido) → block, no pass', async () => {
    let n = 0;
    const f = async () => {
      if (n++ === 0) return { ok: true, json: async () => ON } as Response;
      throw new Error('x');
    };
    expect((await decideMaintenance(cfg, { queryPase: 'tokentoken1', cookiePase: null }, f as never)).action).toBe('block');
  });
  it('pase basura o gigante → block sin consultar al Hub por él', async () => {
    let urls: string[] = [];
    const f = async (u: string) => {
      urls.push(u);
      return { ok: true, json: async () => ON } as Response;
    };
    expect((await decideMaintenance(cfg, { queryPase: null, cookiePase: 'x'.repeat(17000) }, f as never)).action).toBe('block');
    expect((await decideMaintenance(cfg, { queryPase: '<mal>', cookiePase: null }, f as never)).action).toBe('block');
    expect(urls.every((u) => !u.includes('pase='))).toBe(true);
  });
});

describe('respondMaintenance', () => {
  const ctx = (o: object = {}) => ({ url: new URL('https://x.test/es/?a=1&pase=tok'), method: 'GET', siteName: 'S', lang: 'es', ...o });
  const st = parseMaintenance(ON)! as never;
  it('pass → null (sin Response, sigue el site)', () => {
    expect(respondMaintenance({ action: 'pass' }, ctx())).toBeNull();
  });
  it('block → 503 con Retry-After, noindex y cuerpo', async () => {
    const r = respondMaintenance({ action: 'block', state: st }, ctx())!;
    expect(r.status).toBe(503);
    expect(r.headers.get('Retry-After')).toBe('3600');
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(await r.text()).toContain('Vuelvo');
  });
  it('HEAD → 503 sin cuerpo', async () => {
    const r = respondMaintenance({ action: 'block', state: st }, ctx({ method: 'HEAD' }))!;
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('');
  });
  it('setpase → 302 con cookie, a la misma URL sin el token', () => {
    const r = respondMaintenance({ action: 'setpase', token: 'tok' }, ctx())!;
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toBe('/es/?a=1');
    expect(r.headers.get('Set-Cookie')).toMatch(/saastro_pase=tok.*HttpOnly.*Secure.*SameSite=Lax/);
  });
  it('setpase nunca redirige a otro host (//evil)', () => {
    const r = respondMaintenance({ action: 'setpase', token: 't' }, ctx({ url: new URL('https://x.test//evil.com/?pase=t') }))!;
    expect(r.headers.get('Location')).toBe('/evil.com/');
  });
});

describe('cache', () => {
  it('sin pase cachea CACHE_MS; con pase nunca', async () => {
    let n = 0;
    const f = async () => {
      n++;
      return { ok: true, json: async () => ON } as Response;
    };
    await fetchMaintenance(cfg, { fetchImpl: f, now: 1000 });
    await fetchMaintenance(cfg, { fetchImpl: f, now: 1000 + CACHE_MS - 1 });
    expect(n).toBe(1);
    await fetchMaintenance(cfg, { fetchImpl: f, now: 1000 + CACHE_MS });
    expect(n).toBe(2);
    await fetchMaintenance(cfg, { pase: 'a', fetchImpl: f });
    await fetchMaintenance(cfg, { pase: 'a', fetchImpl: f });
    expect(n).toBe(4);
  });
  it('cachea también el fallo', async () => {
    let n = 0;
    const f = async () => {
      n++;
      throw new Error('x');
    };
    await fetchMaintenance(cfg, { fetchImpl: f as never, now: 5 });
    await fetchMaintenance(cfg, { fetchImpl: f as never, now: 6 });
    expect(n).toBe(1);
  });
  it('pide la URL del contrato y codifica el pase', async () => {
    let url = '';
    await fetchMaintenance(cfg, {
      pase: 'a b&c',
      fetchImpl: async (u) => {
        url = u;
        return { ok: true, json: async () => ({ enabled: false }) } as Response;
      },
    });
    expect(url).toBe(`https://hub.test/api/_public/maintenance/${cfg.siteId}?pase=a%20b%26c`);
  });
});

describe('seguridad de lo que viene del Hub', () => {
  const evil = parseMaintenance({
    enabled: true,
    title: '<script>alert(1)</script>',
    message: '"><img src=x onerror=alert(2)>',
    returnAt: null,
    contactEmail: 'a@b.co"><script>x</script>',
    logoUrl: 'javascript:alert(3)',
    accentColor: 'red;background:url(//evil)',
  });
  it('title y message salen escapados', () => {
    const html = renderMaintenanceHtml(evil as never, 'S', 'en');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
  it('logo no-https, color no-hex y email raro se descartan', () => {
    expect(evil).toMatchObject({ logoUrl: null, accentColor: null });
    const html = renderMaintenanceHtml(evil as never, 'S', 'en');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('mailto:');
  });
  it('logo https y color #rrggbb válidos se usan donde toca', () => {
    const m = parseMaintenance({ ...ON, logoUrl: 'https://cdn.x/l.png', accentColor: '#12abEF', contactEmail: 'hola@x.com' })!;
    const html = renderMaintenanceHtml(m as never, 'S', 'es');
    expect(html).toContain('<img src="https://cdn.x/l.png"');
    expect(html).toContain('color:#12abEF');
    expect(html).toContain('href="mailto:hola@x.com"');
    expect(html).toContain('noindex');
    expect(html).toContain('lang="es"');
  });
  it('nada del Hub acaba en un href salvo el mailto validado', () => {
    const html = renderMaintenanceHtml(evil as never, 'S', 'en');
    expect(html).not.toMatch(/href="(?!mailto:)/);
  });
});

describe('piezas', () => {
  it('Retry-After: hasta returnAt, con tope y suelo', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(retryAfterSeconds('2026-01-01T02:00:00Z', now)).toBe(7200);
    expect(retryAfterSeconds(null, now)).toBe(3600);
    expect(retryAfterSeconds('2025-01-01T00:00:00Z', now)).toBe(3600);
    expect(retryAfterSeconds('2030-01-01T00:00:00Z', now)).toBe(7 * 24 * 3600);
  });
  it('cookie httpOnly/Secure/SameSite=Lax y se lee de vuelta', () => {
    const c = paseCookie('t k');
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(parseCookie('a=1; saastro_pase=t%20k', 'saastro_pase')).toBe('t%20k');
    expect(parseCookie(null, 'x')).toBeNull();
  });
  it('rutas exentas', () => {
    expect(esRutaExenta('/_astro/a.js')).toBe(true);
    expect(esRutaExenta('/logo.png')).toBe(true);
    expect(esRutaExenta('/es/')).toBe(false);
    expect(esRutaExenta('/lp/x')).toBe(false);
  });
});

describe('cableado', () => {
  const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8');
  it('la puerta vive en el Worker de entrada, no en el middleware (no se consulta dos veces)', () => {
    expect(leer('../middleware.ts')).toContain('sequence(securityHeaders, site)');
    expect(leer('../middleware.ts')).not.toContain('maintenance');
    expect(leer('../worker.ts')).toContain('gateMaintenance');
  });
});
