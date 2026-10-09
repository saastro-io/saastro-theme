import { describe, expect, it, vi } from 'vitest';
import { checkPreview, handlePurge, prepareRender, previewFrameAncestors } from './handlers';
import { firmarCabecera, firmarPreview } from './firma';

const S = 'secreto';
const LOCALES = ['en', 'es'];
const post = async (path: string, body: string, sign: string | null = S) =>
  new Request(`https://site.test${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...(sign ? { 'x-saastro-sig': await firmarCabecera(sign, body) } : {}) },
  });

const renderBody = (block: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, siteId: 's', locale: 'es', block, ...extra });
const FAQ = { id: 'b1', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } };

describe('sin PAGES_RENDER_SECRET todo es 404', () => {
  it('/__render', async () => {
    for (const secret of [undefined, null, '']) {
      const r = await prepareRender(await post('/__render', renderBody(FAQ)), secret, LOCALES);
      expect((r as Response).status).toBe(404);
    }
  });

  it('/__purge', async () => {
    const invalidate = vi.fn();
    const r = await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo"]}'), undefined, invalidate);
    expect(r.status).toBe(404);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('?__pv', async () => {
    const tok = await firmarPreview(S, { siteId: 's', locale: 'es', slug: 'demo' }, Math.floor(Date.now() / 1000) + 60);
    const r = await checkPreview(new URL(`https://site.test/es/p/demo?__pv=${tok}`), undefined, { siteId: 's', locale: 'es', slug: 'demo' });
    expect(r.mode).toBe('reject');
    expect(r.mode === 'reject' && r.response.status).toBe(404);
  });
});

describe('POST /__render', () => {
  it('firma válida y bloque válido → trabajo de render con props parseadas', async () => {
    const r = await prepareRender(await post('/__render', renderBody(FAQ, { tema: 'b' })), S, LOCALES);
    expect(r).toMatchObject({ siteId: 's', locale: 'es', tema: 'b', block: { id: 'b1', type: 'faq' } });
  });

  it('hero sin variante toma la del tema', async () => {
    const hero = { id: 'h', type: 'hero', props: { title: ['x'], subtitle: 'y' } };
    expect(await prepareRender(await post('/__render', renderBody(hero, { tema: 'b' })), S, LOCALES)).toMatchObject({ block: { variant: 'b' } });
    expect(await prepareRender(await post('/__render', renderBody(hero)), S, LOCALES)).toMatchObject({ block: { variant: 'a' } });
  });

  it('401 con firma mala o ausente', async () => {
    expect(((await prepareRender(await post('/__render', renderBody(FAQ), 'otro'), S, LOCALES)) as Response).status).toBe(401);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ), null), S, LOCALES)) as Response).status).toBe(401);
  });

  it('400 con los errores de Zod en JSON', async () => {
    const r = (await prepareRender(await post('/__render', renderBody({ ...FAQ, props: { title: '' } })), S, LOCALES)) as Response;
    expect(r.status).toBe(400);
    const body = (await r.json()) as { issues: { path: unknown[] }[] };
    expect(body.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['title', 'items']));
  });

  it('400 por sobre, locale o tema fuera de contrato; 405 si no es POST', async () => {
    expect(((await prepareRender(await post('/__render', '{"v":2}'), S, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', 'no-json'), S, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ, { locale: 'fr' })), S, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(await post('/__render', renderBody(FAQ, { tema: 'z' })), S, LOCALES)) as Response).status).toBe(400);
    expect(((await prepareRender(new Request('https://site.test/__render'), S, LOCALES)) as Response).status).toBe(405);
  });
});

describe('POST /__purge', () => {
  it('invalida los tags pg:… firmados', async () => {
    const invalidate = vi.fn(async () => {});
    const r = await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo"]}'), S, invalidate);
    expect(r.status).toBe(200);
    expect(invalidate).toHaveBeenCalledWith(['pg:s:es:demo']);
  });

  it('401 firma mala, 400 tags que no son de página', async () => {
    const invalidate = vi.fn();
    expect((await handlePurge(await post('/__purge', '{"tags":["pg:s:es:demo"]}', 'otro'), S, invalidate)).status).toBe(401);
    expect((await handlePurge(await post('/__purge', '{"tags":["astro-path:/"]}'), S, invalidate)).status).toBe(400);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('vista previa', () => {
  const key = { siteId: 's', locale: 'es', slug: 'demo' };
  it('sin ?__pv es pública; con token bueno, preview; con token malo, 401', async () => {
    expect((await checkPreview(new URL('https://site.test/es/p/demo'), S, key)).mode).toBe('public');
    const tok = await firmarPreview(S, key, Math.floor(Date.now() / 1000) + 300);
    expect((await checkPreview(new URL(`https://site.test/es/p/demo?__pv=${tok}`), S, key)).mode).toBe('preview');
    const bad = await checkPreview(new URL(`https://site.test/es/p/otra?__pv=${tok}`), S, { ...key, slug: 'otra' });
    expect(bad.mode === 'reject' && bad.response.status).toBe(401);
  });

  it('frame-ancestors abre SOLO el origen del Hub', () => {
    expect(previewFrameAncestors('https://hub.saastro.io/ruta?x=1')).toBe("frame-ancestors 'self' https://hub.saastro.io");
    expect(previewFrameAncestors(undefined)).toBe("frame-ancestors 'self'");
    expect(previewFrameAncestors('no es una url')).toBe("frame-ancestors 'self'");
  });
});
