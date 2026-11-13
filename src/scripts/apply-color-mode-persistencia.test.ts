/**
 * ApplyColorMode: el modo claro/oscuro solo se GUARDA cuando el visitante lo elige.
 *
 * Se ejecuta el script REAL de `ApplyColorMode.astro` (extraído del fichero) en un `vm`
 * con un navegador mínimo. Hasta el 13-nov-2026 el arranque llamaba a `applyTheme()`,
 * que siempre hacía `localStorage.setItem('theme', …)`: el sitio escribía en el
 * dispositivo de TODO visitante, antes de que tocara nada. Esa clave solo es una
 * preferencia suya (y no un dato nuestro) si la guarda su elección.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const FUENTE = readFileSync(new URL('./ApplyColorMode.astro', import.meta.url), 'utf8');
const SCRIPT = /<script[^>]*>([\s\S]*?)<\/script>/.exec(FUENTE)![1]!;

function navegador(opts: { guardado?: 'dark' | 'light'; sistemaOscuro?: boolean; defaultTheme?: string } = {}) {
  const escrituras: Array<[string, string]> = [];
  const datos: Record<string, string> = opts.guardado ? { theme: opts.guardado } : {};
  // `'theme' in localStorage` y `localStorage.theme` del script: un objeto plano con métodos no enumerables
  const localStorage = new Proxy(datos, {
    get: (t, k: string) =>
      k === 'setItem' ? (key: string, v: string) => { escrituras.push([key, v]); t[key] = v; }
      : k === 'getItem' ? (key: string) => t[key] ?? null
      : t[k],
    has: (t, k: string) => k in t,
  });
  const clases = new Set<string>();
  const ctx: Record<string, unknown> = {
    defaultTheme: opts.defaultTheme ?? 'system',
    localStorage,
    CustomEvent: class { constructor(public type: string, public init?: unknown) {} },
    document: {
      documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? clases.add(c) : clases.delete(c)), contains: (c: string) => clases.has(c) } },
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
  };
  ctx.window = ctx;
  ctx.matchMedia = () => ({ matches: opts.sistemaOscuro ?? false });
  ctx.dispatchEvent = () => true;
  runInNewContext(SCRIPT, ctx);
  return { escrituras, datos, clases, applyTheme: ctx.applyTheme as (t: string, persist?: boolean) => void };
}

describe('ApplyColorMode · no escribe nada antes de que el visitante elija', () => {
  it('arranque con el sistema en claro: aplica claro y NO guarda', () => {
    const n = navegador({ sistemaOscuro: false });
    expect(n.escrituras).toEqual([]);
    expect(n.clases.has('dark')).toBe(false);
  });
  it('arranque con el sistema en oscuro: aplica oscuro y NO guarda', () => {
    const n = navegador({ sistemaOscuro: true });
    expect(n.escrituras).toEqual([]);
    expect(n.clases.has('dark')).toBe(true);
  });
  it('defaultTheme fijo (distinto de system) tampoco guarda al cargar', () => {
    const n = navegador({ defaultTheme: 'dark' });
    expect(n.escrituras).toEqual([]);
    expect(n.clases.has('dark')).toBe(true);
  });
  it('una elección anterior sigue mandando y tampoco se reescribe', () => {
    const n = navegador({ guardado: 'dark', sistemaOscuro: false });
    expect(n.clases.has('dark')).toBe(true);
    expect(n.escrituras).toEqual([]);
  });
});

describe('ApplyColorMode · sí guarda cuando el visitante elige', () => {
  it('pulsar el interruptor (applyTheme sin persist) guarda la elección', () => {
    const n = navegador();
    n.applyTheme('dark');
    expect(n.escrituras).toEqual([['theme', 'dark']]);
    expect(n.clases.has('dark')).toBe(true);
  });
  it('applyTheme(…, false) aplica sin guardar', () => {
    const n = navegador();
    n.applyTheme('dark', false);
    expect(n.escrituras).toEqual([]);
  });
});
