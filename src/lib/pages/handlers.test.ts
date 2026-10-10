import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkPreview, handlePurge, prepareRender, previewFrameAncestors } from './handlers';
import { firmarPeticion, firmarPreview } from './firma';

const S = 'secreto';
const SITE = 's';
const LOCALES = ['en', 'es'];
interface Firma {
  secret?: string;
  siteId?: string;
  metodo?: string;
  ruta?: string;
}
/** POST a `path` firmado como el Hub (`sign: null` = sin cabecera); `sign` cambia lo que se firma. */
const post = async (path: string, body: string, sign: Firma | null = {}) =>
  new Request(`https://site.test${path}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...(sign
        ? {
            'x-saastro-sig': await firmarPeticion(sign.secret ?? S, {
              siteId: sign.siteId ?? SITE,
              metodo: sign.metodo ?? 'POST',
              ruta: sign.ruta ?? path,
              cuerpo: body,
            }),
          }
        : {}),
    },
  });
const raw = (path: string, body: string, header: string) =>
  new Request(`https://site.test${path}`, { method: 'POST', body, headers: { 'x-saastro-sig': header } });
const status = async (r: Promise<Response | unknown>) => ((await r) as Response).status;

const renderBody = (block: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, siteId: 's', locale: 'es', block, ...extra });
const FAQ = { id: 'b1', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } };

describe('sin PAGES_RENDER_SECRET o sin PAGES_SITE_ID todo es 404', () => {
  const sinConfig: [string | undefined | null, string | undefined | null][] = [
    [undefined, SITE], [null, SITE], ['', SITE],
    [S, undefined], [S, null], [S, ''],
  ];

  it('/__render', async () => {
    for (const [secret, siteId] of sinConfig) {
      expect(await status(prepareRender(await post('/__render', renderBody(FAQ)), secret, siteId, LOCALES))).toBe(404);
    }
  });

  it('/__purge', async () => {
    const invalidate = vi.fn();
    for (const [secret, siteId] of sinConfig) {
      expect((await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo"]}'), secret, siteId, invalidate)).status).toBe(404);
    }
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('?__pv', async () => {
    const key = { siteId: SITE, locale: 'es', slug: 'demo' };
    const tok = await firmarPreview(S, key, Math.floor(Date.now() / 1000) + 60);
    for (const [secret, siteId] of sinConfig) {
      const r = await checkPreview(new URL(`https://site.test/es/p/demo?__pv=${tok}`), secret, siteId, key);
      expect(r.mode === 'reject' && r.response.status).toBe(404);
    }
  });
});

describe('POST /__render', () => {
  it('firma válida y bloque válido → trabajo de render con props parseadas', async () => {
    const r = await prepareRender(await post('/__render', renderBody(FAQ, { tema: 'b' })), S, SITE, LOCALES);
    expect(r).toMatchObject({ siteId: 's', locale: 'es', tema: 'b', block: { id: 'b1', type: 'faq' } });
    expect(typeof (r as { firmaMs: number }).firmaMs).toBe('number');
    expect((r as { firmaMs: number }).firmaMs).toBeGreaterThanOrEqual(0);
  });

  it('hero sin variante toma la del tema', async () => {
    const hero = { id: 'h', type: 'hero', props: { title: ['x'], subtitle: 'y' } };
    expect(await prepareRender(await post('/__render', renderBody(hero, { tema: 'b' })), S, SITE, LOCALES)).toMatchObject({ block: { variant: 'b' } });
    expect(await prepareRender(await post('/__render', renderBody(hero)), S, SITE, LOCALES)).toMatchObject({ block: { variant: 'a' } });
  });

  it('401 con firma mala o ausente', async () => {
    expect(((await prepareRender(await post('/__render', renderBody(FAQ), { secret: 'otro' }), S, SITE, LOCALES)) as Response).status).toBe(401);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ), null), S, SITE, LOCALES)) as Response).status).toBe(401);
  });

  it('401: formato viejo, otro siteId, otra ruta u otro método', async () => {
    const body = renderBody(FAQ);
    const t = Math.floor(Date.now() / 1000);
    const viejo = `t=${t},v1=${crypto.createHmac('sha256', S).update(`${t}.${body}`).digest('hex')}`;
    expect(await status(prepareRender(raw('/__render', body, viejo), S, SITE, LOCALES))).toBe(401);
    expect(await status(prepareRender(await post('/__render', body, { siteId: 'otro' }), S, SITE, LOCALES))).toBe(401);
    expect(await status(prepareRender(await post('/__render', body, { ruta: '/__purge' }), S, SITE, LOCALES))).toBe(401);
    expect(await status(prepareRender(await post('/__render', body, { ruta: '/__render?x=1' }), S, SITE, LOCALES))).toBe(401);
    expect(await status(prepareRender(await post('/__render', body, { metodo: 'PUT' }), S, SITE, LOCALES))).toBe(401);
  });

  it('la ruta firmada incluye la query tal cual llega', async () => {
    expect(await prepareRender(await post('/__render?x=1', renderBody(FAQ)), S, SITE, LOCALES)).toMatchObject({ siteId: SITE });
  });

  it('400 si el cuerpo trae otro siteId, aunque la firma sea buena', async () => {
    const r = (await prepareRender(await post('/__render', renderBody(FAQ, { siteId: 'otro' })), S, SITE, LOCALES)) as Response;
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'siteId' });
  });

  it('400 con los errores de Zod en JSON', async () => {
    const r = (await prepareRender(await post('/__render', renderBody({ ...FAQ, props: { title: '' } })), S, SITE, LOCALES)) as Response;
    expect(r.status).toBe(400);
    const body = (await r.json()) as { issues: { path: unknown[] }[] };
    expect(body.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['title', 'items']));
  });

  it('400 por sobre, locale o tema fuera de contrato; 405 si no es POST', async () => {
    expect(((await prepareRender(await post('/__render', '{"v":2}'), S, SITE, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', 'no-json'), S, SITE, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ, { locale: 'fr' })), S, SITE, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ, { tema: 'z' })), S, SITE, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(new Request('https://site.test/__render'), S, SITE, LOCALES)) as Response).status).toBe(405);
  });
});

describe('POST /__purge', () => {
  it('invalida los tags pg:… firmados', async () => {
    const invalidate = vi.fn(async () => {});
    const r = await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo"]}'), S, SITE, invalidate);
    expect(r.status).toBe(200);
    expect(invalidate).toHaveBeenCalledWith(['pg:s:es:demo']);
  });

  it('401 firma mala, de otro site, de otra ruta o de otro método; 400 tags que no son de página o de otro siteId', async () => {
    const invalidate = vi.fn();
    const body = '{"tags":["pg:s:es:demo"]}';
    expect((await handlePurge(await post('/__purge', body, { secret: 'otro' }), S, SITE, invalidate)).status).toBe(401);
    expect((await handlePurge(await post('/__purge', body, { siteId: 'otro' }), S, SITE, invalidate)).status).toBe(401);
    expect((await handlePurge(await post('/__purge', body, { ruta: '/__render' }), S, SITE, invalidate)).status).toBe(401);
    expect((await handlePurge(await post('/__purge', body, { metodo: 'GET' }), S, SITE, invalidate)).status).toBe(401);
    expect((await handlePurge(await post('/__purge', '{"tags":["astro-path:/"]}'), S, SITE, invalidate)).status).toBe(400);
    const ajeno = await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo","pg:otro:es:demo"]}'), S, SITE, invalidate);
    expect(ajeno.status).toBe(400);
    expect(await ajeno.json()).toMatchObject({ error: 'siteId' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('vista previa', () => {
  const key = { siteId: 's', locale: 'es', slug: 'demo' };
  it('sin ?__pv es pública; con token bueno, preview; con token malo, 401', async () => {
    expect((await checkPreview(new URL('https://site.test/es/p/demo'), S, SITE, key)).mode).toBe('public');
    const tok = await firmarPreview(S, key, Math.floor(Date.now() / 1000) + 300);
    const ok = await checkPreview(new URL(`https://site.test/es/p/demo?__pv=${tok}`), S, SITE, key);
    expect(ok.mode).toBe('preview');
    expect(ok.mode === 'preview' && typeof ok.firmaMs).toBe('number');
    const bad = await checkPreview(new URL(`https://site.test/es/p/otra?__pv=${tok}`), S, SITE, { ...key, slug: 'otra' });
    expect(bad.mode === 'reject' && bad.response.status).toBe(401);
  });

  it('frame-ancestors abre SOLO el origen del Hub', () => {
    expect(previewFrameAncestors('https://hub.saastro.io/ruta?x=1')).toBe("frame-ancestors 'self' https://hub.saastro.io");
    expect(previewFrameAncestors(undefined)).toBe("frame-ancestors 'self'");
    expect(previewFrameAncestors('no es una url')).toBe("frame-ancestors 'self'");
  });
});
