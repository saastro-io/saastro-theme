import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(new URL('./ApplyColorMode.astro', import.meta.url), 'utf8');
const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

function raiz(inicial: string[]) {
  const set = new Set(inicial);
  return {
    set,
    classList: {
      toggle: (c: string, f: boolean) => (f ? set.add(c) : set.delete(c)),
      contains: (c: string) => set.has(c),
    },
  };
}

function montar(tema: 'dark' | 'light', codigo = CODIGO) {
  const listeners: Record<string, (e: any) => void> = {};
  const document = {
    documentElement: raiz(tema === 'dark' ? ['dark'] : []),
    querySelectorAll: () => [],
    addEventListener: (n: string, f: (e: any) => void) => (listeners[n] = f),
  };
  const win: Record<string, any> = { dispatchEvent: () => true, matchMedia: () => ({ matches: false }) };
  runInNewContext(codigo, {
    defaultTheme: 'system',
    window: win,
    document,
    CustomEvent: class {
      constructor(public type: string, public init: unknown) {}
    },
    localStorage: { theme: tema, setItem() {} },
  });
  return listeners;
}

describe('modo oscuro con ClientRouter', () => {
  it('copia `dark` al documento entrante antes del swap (el servidor lo manda sin clase)', () => {
    const listeners = montar('dark');
    const entrante = raiz([]);
    listeners['astro:before-swap']({ newDocument: { documentElement: entrante } });
    expect(entrante.set.has('dark')).toBe(true);
  });

  it('el control puede fallar: con el evento renombrado (mutante) no queda listener', () => {
    const mutante = CODIGO.replace("'astro:before-swap'", "'astro:otro'");
    expect(mutante).not.toBe(CODIGO);
    expect(montar('dark', mutante)['astro:before-swap']).toBeUndefined();
    expect(montar('dark')['astro:before-swap']).toBeTypeOf('function');
  });

  it('en claro no la añade, y la quita si el entrante la traía', () => {
    const listeners = montar('light');
    const entrante = raiz(['dark']);
    listeners['astro:before-swap']({ newDocument: { documentElement: entrante } });
    expect(entrante.set.has('dark')).toBe(false);
  });
});
