import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { firmarPeticion, firmarPreview, mensajeFirmado, rutaDe, timingSafeEqual, verificarFirma, verificarPreview } from './firma';

const S = 'secreto-de-prueba';
const hmac = (m: string) => crypto.createHmac('sha256', S).update(m).digest('hex');
const NOW = 1_800_000_000;

describe('firma x-saastro-sig (Hub #655: atada a site, método y ruta)', () => {
  const P = { siteId: 'site1', metodo: 'POST', ruta: '/__render', cuerpo: '{"v":1}' };
  const msg = (t: number, p = P) => `${t}.${p.siteId}.${p.metodo}.${p.ruta}.${p.cuerpo}`;

  it('mensaje = <t>.<siteId>.<METODO>.<ruta+query>.<cuerpo>, método en mayúsculas', () => {
    expect(mensajeFirmado(NOW, { ...P, metodo: 'post' })).toBe(`${NOW}.site1.POST./__render.{"v":1}`);
  });

  it('es la del contrato: t=<unix>,v1=hex(HMAC(secret, mensaje)) — vector con node:crypto', async () => {
    expect(await firmarPeticion(S, P, NOW)).toBe(`t=${NOW},v1=${hmac(msg(NOW))}`);
  });

  it('válida dentro de ±60 s', async () => {
    const h = `t=${NOW},v1=${hmac(msg(NOW))}`;
    expect(await verificarFirma(S, h, P, NOW + 59)).toEqual({ ok: true });
    expect(await verificarFirma(S, h, P, NOW - 60)).toEqual({ ok: true });
  });

  it('caducada fuera de la ventana', async () => {
    const h = await firmarPeticion(S, P, NOW);
    expect(await verificarFirma(S, h, P, NOW + 61)).toEqual({ ok: false, motivo: 'caducada' });
    expect(await verificarFirma(S, h, P, NOW - 61)).toEqual({ ok: false, motivo: 'caducada' });
  });

  it('el formato viejo (HMAC de t.cuerpo) ya no vale', async () => {
    expect(await verificarFirma(S, `t=${NOW},v1=${hmac(`${NOW}.${P.cuerpo}`)}`, P, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
  });

  it('una firma capturada no vale en otro site, otro método ni otra ruta', async () => {
    const h = await firmarPeticion(S, P, NOW);
    expect(await verificarFirma(S, h, { ...P, siteId: 'site2' }, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarFirma(S, h, { ...P, metodo: 'PUT' }, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarFirma(S, h, { ...P, ruta: '/__purge' }, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarFirma(S, h, { ...P, ruta: '/__render?x=1' }, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
  });

  it('alterada: cuerpo, t, secreto o hex cambiados', async () => {
    const h = await firmarPeticion(S, P, NOW);
    expect(await verificarFirma(S, h, { ...P, cuerpo: '{"v":2}' }, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarFirma(S, h.replace(`t=${NOW}`, `t=${NOW + 1}`), P, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarFirma('otro', h, P, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    const flipped = h.slice(0, -1) + (h.endsWith('0') ? '1' : '0');
    expect(await verificarFirma(S, flipped, P, NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
  });

  it('ausente o malformada', async () => {
    expect(await verificarFirma(S, null, P, NOW)).toEqual({ ok: false, motivo: 'ausente' });
    expect(await verificarFirma(S, 't=abc,v1=zz', P, NOW)).toEqual({ ok: false, motivo: 'malformada' });
    expect(await verificarFirma(S, `v1=${hmac('x')}`, P, NOW)).toEqual({ ok: false, motivo: 'malformada' });
  });

  it('GET de borrador: cuerpo vacío y la query entra en la ruta', async () => {
    const g = { siteId: 'site1', metodo: 'GET', ruta: '/api/_public/pages/site1/es/demo?draft=1', cuerpo: '' };
    expect(await firmarPeticion(S, g, NOW)).toBe(`t=${NOW},v1=${hmac(`${NOW}.site1.GET./api/_public/pages/site1/es/demo?draft=1.`)}`);
    expect(await verificarFirma(S, await firmarPeticion(S, g, NOW), g, NOW)).toEqual({ ok: true });
  });

  it('rutaDe = pathname + search', () => {
    expect(rutaDe('https://hub/api/_public/pages/s/es/demo?draft=1')).toBe('/api/_public/pages/s/es/demo?draft=1');
    expect(rutaDe(new URL('https://site.test/__render'))).toBe('/__render');
  });

  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abd', 'abc')).toBe(false);
    expect(timingSafeEqual('ab', 'abc')).toBe(false);
  });
});

describe('token de vista previa ?__pv=<exp>.<hmac>', () => {
  const key = { siteId: 'site1', locale: 'es', slug: 'demo' };

  it('es el del contrato: hex(HMAC(secret, "siteId:locale:slug:exp"))', async () => {
    expect(await firmarPreview(S, key, NOW + 600)).toBe(`${NOW + 600}.${hmac(`site1:es:demo:${NOW + 600}`)}`);
  });

  it('válido hasta 15 min en el futuro', async () => {
    expect(await verificarPreview(S, key, await firmarPreview(S, key, NOW + 900), NOW)).toBe(true);
  });

  it('caducado, o con exp más allá de 15 min', async () => {
    expect(await verificarPreview(S, key, await firmarPreview(S, key, NOW - 1), NOW)).toBe(false);
    expect(await verificarPreview(S, key, await firmarPreview(S, key, NOW + 901), NOW)).toBe(false);
  });

  it('alterado: otra página, otro locale, otro exp, basura', async () => {
    const tok = await firmarPreview(S, key, NOW + 600);
    expect(await verificarPreview(S, { ...key, slug: 'otra' }, tok, NOW)).toBe(false);
    expect(await verificarPreview(S, { ...key, locale: 'en' }, tok, NOW)).toBe(false);
    expect(await verificarPreview(S, key, tok.replace(`${NOW + 600}.`, `${NOW + 601}.`), NOW)).toBe(false);
    expect(await verificarPreview(S, key, 'nada', NOW)).toBe(false);
    expect(await verificarPreview(S, key, null, NOW)).toBe(false);
  });
});
