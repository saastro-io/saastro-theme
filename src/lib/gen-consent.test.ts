import { afterEach, describe, expect, it, vi } from 'vitest';
import { mirrorGenConsent } from './gen-consent';

function entorno(inicial?: string) {
  const store: Record<string, string> = inicial ? { 'gen-consent': inicial } : {};
  const eventos: string[] = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => { eventos.push(e.type); return true; } });
  return { store, eventos };
}

afterEach(() => vi.unstubAllGlobals());

describe('mirrorGenConsent', () => {
  it('conceder escribe granted y avisa al beacon', () => {
    const { store, eventos } = entorno();
    mirrorGenConsent(true);
    expect(store['gen-consent']).toBe('granted');
    expect(eventos).toEqual(['gen:consent-granted']);
  });

  it('si ya era granted NO vuelve a emitir (evita contar la visita dos veces)', () => {
    const { eventos } = entorno('granted');
    mirrorGenConsent(true);
    mirrorGenConsent(true, { alMontar: true });
    expect(eventos).toEqual([]);
  });

  it('retirar (decisión del visitante) borra el valor', () => {
    const { store } = entorno('granted');
    mirrorGenConsent(false);
    expect('gen-consent' in store).toBe(false);
  });

  it('al montar con analytics:false NO pisa un granted puesto por otra vía', () => {
    const { store } = entorno('granted');
    mirrorGenConsent(false, { alMontar: true });
    expect(store['gen-consent']).toBe('granted');
  });

  it('con el storage bloqueado no lanza', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(() => mirrorGenConsent(true)).not.toThrow();
  });
});
