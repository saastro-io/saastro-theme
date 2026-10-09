import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { firmarCabecera, firmarPreview, timingSafeEqual, verificarCabecera, verificarPreview } from './firma';

const S = 'secreto-de-prueba';
const hmac = (m: string) => crypto.createHmac('sha256', S).update(m).digest('hex');
const NOW = 1_800_000_000;

describe('firma x-saastro-sig', () => {
  it('es la del contrato: t=<unix>,v1=hex(HMAC(secret, t.cuerpo))', async () => {
    const body = '{"v":1}';
    expect(await firmarCabecera(S, body, NOW)).toBe(`t=${NOW},v1=${hmac(`${NOW}.${body}`)}`);
  });

  it('válida dentro de ±60 s', async () => {
    const body = '{"a":1}';
    expect(await verificarCabecera(S, `t=${NOW},v1=${hmac(`${NOW}.${body}`)}`, body, NOW + 59)).toEqual({ ok: true });
    expect(await verificarCabecera(S, `t=${NOW},v1=${hmac(`${NOW}.${body}`)}`, body, NOW - 60)).toEqual({ ok: true });
  });

  it('caducada fuera de la ventana', async () => {
    const h = await firmarCabecera(S, 'x', NOW);
    expect(await verificarCabecera(S, h, 'x', NOW + 61)).toEqual({ ok: false, motivo: 'caducada' });
    expect(await verificarCabecera(S, h, 'x', NOW - 61)).toEqual({ ok: false, motivo: 'caducada' });
  });

  it('alterada: cuerpo, t, secreto o hex cambiados', async () => {
    const h = await firmarCabecera(S, '{"a":1}', NOW);
    expect(await verificarCabecera(S, h, '{"a":2}', NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarCabecera(S, h.replace(`t=${NOW}`, `t=${NOW + 1}`), '{"a":1}', NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    expect(await verificarCabecera('otro', h, '{"a":1}', NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
    const flipped = h.slice(0, -1) + (h.endsWith('0') ? '1' : '0');
    expect(await verificarCabecera(S, flipped, '{"a":1}', NOW)).toEqual({ ok: false, motivo: 'no-coincide' });
  });

  it('ausente o malformada', async () => {
    expect(await verificarCabecera(S, null, '', NOW)).toEqual({ ok: false, motivo: 'ausente' });
    expect(await verificarCabecera(S, 't=abc,v1=zz', '', NOW)).toEqual({ ok: false, motivo: 'malformada' });
    expect(await verificarCabecera(S, `v1=${hmac('x')}`, '', NOW)).toEqual({ ok: false, motivo: 'malformada' });
  });

  it('cuerpo vacío (lectura de borrador)', async () => {
    expect(await verificarCabecera(S, await firmarCabecera(S, '', NOW), '', NOW)).toEqual({ ok: true });
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
