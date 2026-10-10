import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MAX_RENDER_BYTES, checkPreview, handlePurge, prepareRender, previewFrameAncestors } from './handlers';
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

describe('render directo del navegador (x-saastro-pv) y CORS', () => {
  const HUB = 'https://hub.saastro.io';
  const key = { siteId: SITE, locale: 'es', slug: 'demo' };
  const ahora = () => Math.floor(Date.now() / 1000);
  const body = (extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, siteId: SITE, locale: 'es', slug: 'demo', block: FAQ, ...extra });
  const directo = (b: string, headers: Record<string, string>) =>
    new Request('https://site.test/__render', { method: 'POST', body: b, headers: { 'content-type': 'application/json', origin: HUB, ...headers } });
  const render = (req: Request, hubOrigin: string | null = HUB, secret: string | null = S, siteId: string | null = SITE) =>
    prepareRender(req, secret, siteId, LOCALES, { hubOrigin });
  const tok = (k = key, exp = ahora() + 300) => firmarPreview(S, k, exp);

  it('token válido + Origin del Hub → trabajo de render con CORS exacto y auth pv', async () => {
    const r = await render(directo(body(), { 'x-saastro-pv': await tok() }));
    expect(r).toMatchObject({ siteId: SITE, locale: 'es', auth: 'pv', block: { id: 'b1', type: 'faq' } });
    expect((r as { cors: Record<string, string> }).cors).toEqual({
      vary: 'Origin',
      'access-control-allow-origin': HUB,
      'access-control-expose-headers': 'server-timing',
      'timing-allow-origin': HUB,
    });
  });

  it('sin token, token caducado, de otro site, de otro locale o de otro slug → 401/403 sin render', async () => {
    // Sin ninguna cabecera de auth: 401 de firma ausente, como siempre.
    expect(await status(render(directo(body(), {})))).toBe(401);
    expect(await status(render(directo(body(), { 'x-saastro-pv': '' })))).toBe(401);
    expect(await status(render(directo(body(), { 'x-saastro-pv': await tok(key, ahora() - 1) })))).toBe(401);
    expect(await status(render(directo(body(), { 'x-saastro-pv': await tok({ ...key, siteId: 'otro' }) })))).toBe(401);
    expect(await status(render(directo(body(), { 'x-saastro-pv': await tok({ ...key, locale: 'en' }) })))).toBe(401);
    expect(await status(render(directo(body(), { 'x-saastro-pv': await tok({ ...key, slug: 'otra' }) })))).toBe(401);
    // Token de otro site y cuerpo que dice ser ese site: 401 (el token se
    // comprueba contra PAGES_SITE_ID, no contra lo que diga el cuerpo).
    const ajeno = { ...key, siteId: 'otro' };
    expect(await status(render(directo(body({ siteId: 'otro' }), { 'x-saastro-pv': await tok(ajeno) })))).toBe(401);
    // Token bueno de ESTE site y cuerpo que pide ser otro: 403.
    expect(await status(render(directo(body({ siteId: 'otro' }), { 'x-saastro-pv': await tok() })))).toBe(403);
    // Sin slug no hay a qué atar el token.
    expect(await status(render(directo(body({ slug: undefined }), { 'x-saastro-pv': await tok() })))).toBe(401);
  });

  it('sin token válido no hay oráculo: siteId acertado o no, sobre roto o no → el mismo 401', async () => {
    for (const b of [body(), body({ siteId: 'otro' }), body({ block: { id: '!' } }), body({ v: 2 })]) {
      const r = (await render(directo(b, { 'x-saastro-pv': 'basura' }))) as Response;
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: 'pv', motivo: 'token ausente, caducado, malformado o de otro site, locale o slug' });
    }
  });

  it('PAGES_HUB_ORIGIN se normaliza (barra final, mayúsculas, puerto por defecto)', async () => {
    for (const cfg of ['https://HUB.saastro.io/', 'https://hub.saastro.io:443', 'https://hub.saastro.io/ruta?x=1']) {
      const r = await render(directo(body(), { 'x-saastro-pv': await tok() }), cfg);
      expect((r as { cors: Record<string, string> }).cors['access-control-allow-origin']).toBe(HUB);
    }
  });

  it('el error del render directo lleva CORS para que el editor lo lea', async () => {
    const r = (await render(directo(body(), { 'x-saastro-pv': 'nada' }))) as Response;
    expect(r.status).toBe(401);
    expect(r.headers.get('access-control-allow-origin')).toBe(HUB);
  });

  it('Origin distinto (o ausente, o reflejado con otra forma) → sin cabeceras CORS y 403', async () => {
    for (const origin of ['https://evil.test', 'https://hub.saastro.io.evil.test', 'http://hub.saastro.io', 'null']) {
      const r = (await render(directo(body(), { origin, 'x-saastro-pv': await tok() }))) as Response;
      expect(r.status).toBe(403);
      expect(r.headers.get('access-control-allow-origin')).toBeNull();
      expect(r.headers.get('vary')).toBe('Origin');
    }
    const sinOrigin = new Request('https://site.test/__render', { method: 'POST', body: body(), headers: { 'x-saastro-pv': await tok() } });
    expect(await status(render(sinOrigin))).toBe(403);
  });

  it('OPTIONS con el Origin del Hub → 204 con las cabeceras exactas; con otro, 403 sin CORS', async () => {
    const pre = (origin: string) =>
      new Request('https://site.test/__render', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-saastro-pv' } });
    const ok = (await render(pre(HUB))) as Response;
    expect(ok.status).toBe(204);
    expect(Object.fromEntries(ok.headers)).toEqual({
      vary: 'Origin',
      'access-control-allow-origin': HUB,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-saastro-pv',
      'access-control-max-age': '600',
      'access-control-expose-headers': 'server-timing',
      'timing-allow-origin': HUB,
    });
    const no = (await render(pre('https://evil.test'))) as Response;
    expect(no.status).toBe(403);
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
    expect(no.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('la firma HMAC Hub→site sigue funcionando (sin Origin, sin CORS)', async () => {
    const r = await render(await post('/__render', renderBody(FAQ)));
    expect(r).toMatchObject({ auth: 'hmac', cors: { vary: 'Origin' } });
    expect((r as { cors: Record<string, string> }).cors['access-control-allow-origin']).toBeUndefined();
    // Con las dos cabeceras manda la firma: un token válido no salva una firma mala.
    const malaFirma = await post('/__render', renderBody(FAQ), { secret: 'otro' });
    malaFirma.headers.set('x-saastro-pv', await tok());
    expect(await status(render(malaFirma))).toBe(401);
  });

  it('cuerpo mayor que el tope → 413, en los dos modos', async () => {
    const grande = body({ block: { ...FAQ, props: { title: 'x'.repeat(MAX_RENDER_BYTES), items: [{ q: 'q', a: 'a' }] } } });
    expect(await status(render(directo(grande, { 'x-saastro-pv': await tok() })))).toBe(413);
    expect(await status(render(await post('/__render', grande)))).toBe(413);
    // Sin content-length (cuerpo en stream): también.
    const stream = new Request('https://site.test/__render', {
      method: 'POST',
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(grande)); c.close(); } }),
      headers: { origin: HUB, 'x-saastro-pv': await tok() },
      duplex: 'half',
    } as RequestInit);
    expect(await status(render(stream))).toBe(413);
  });

  it('sin secreto, sin PAGES_SITE_ID → 404; sin PAGES_HUB_ORIGIN el directo y el preflight → 404', async () => {
    const t = await tok();
    expect(await status(render(directo(body(), { 'x-saastro-pv': t }), HUB, null))).toBe(404);
    expect(await status(render(directo(body(), { 'x-saastro-pv': t }), HUB, S, null))).toBe(404);
    expect(await status(render(directo(body(), { 'x-saastro-pv': t }), null))).toBe(404);
    expect(await status(render(directo(body(), { 'x-saastro-pv': t }), 'no es una url'))).toBe(404);
    expect(await status(render(new Request('https://site.test/__render', { method: 'OPTIONS', headers: { origin: HUB } }), null))).toBe(404);
    expect(await status(render(new Request('https://site.test/__render', { method: 'OPTIONS', headers: { origin: HUB } }), HUB, null))).toBe(404);
  });
});
