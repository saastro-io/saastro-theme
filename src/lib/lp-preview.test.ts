import { describe, expect, it } from 'vitest';
import { MAX_VIGENCIA_S, signPreview, verifyPreview } from './lp-preview';

const SECRET = 'secreto-de-prueba';
const NOW = 1_800_000_000_000; // ms
const nowS = NOW / 1000;

describe('verifyPreview', () => {
  it('acepta un token vigente de ese slug', async () => {
    const t = await signPreview(SECRET, 'mi-landing', nowS + 600);
    expect(await verifyPreview(SECRET, t, 'mi-landing', NOW)).toBe(true);
  });

  it('rechaza sin secreto, sin token o sin slug', async () => {
    const t = await signPreview(SECRET, 'a', nowS + 600);
    expect(await verifyPreview(undefined, t, 'a', NOW)).toBe(false);
    expect(await verifyPreview('', t, 'a', NOW)).toBe(false);
    expect(await verifyPreview(SECRET, null, 'a', NOW)).toBe(false);
    expect(await verifyPreview(SECRET, t, undefined, NOW)).toBe(false);
  });

  it('rechaza un token caducado', async () => {
    const t = await signPreview(SECRET, 'a', nowS - 1);
    expect(await verifyPreview(SECRET, t, 'a', NOW)).toBe(false);
  });

  it('rechaza un token de otro slug', async () => {
    const t = await signPreview(SECRET, 'a', nowS + 600);
    expect(await verifyPreview(SECRET, t, 'b', NOW)).toBe(false);
  });

  it('rechaza otro secreto', async () => {
    const t = await signPreview('otro', 'a', nowS + 600);
    expect(await verifyPreview(SECRET, t, 'a', NOW)).toBe(false);
  });

  it('rechaza si se alarga el exp sin refirmar', async () => {
    const t = await signPreview(SECRET, 'a', nowS + 600);
    const firma = t.split('.')[1];
    expect(await verifyPreview(SECRET, `${nowS + 3000}.${firma}`, 'a', NOW)).toBe(false);
  });

  it('rechaza una vigencia por encima del techo aunque la firma sea buena', async () => {
    const t = await signPreview(SECRET, 'a', nowS + MAX_VIGENCIA_S + 60);
    expect(await verifyPreview(SECRET, t, 'a', NOW)).toBe(false);
  });

  it('no lanza con basura', async () => {
    for (const basura of ['x', '.', '12.', '.abc', 'abc.def', `${nowS + 60}.@@@`, '99999999999999.aa']) {
      expect(await verifyPreview(SECRET, basura, 'a', NOW)).toBe(false);
    }
  });
});
