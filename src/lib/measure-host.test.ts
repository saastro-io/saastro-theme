/**
 * El host propio del site se mide aunque cuelgue de *.saastro.io; el resto de
 * *.saastro.io, localhost y dev siguen bloqueados. Los scripts inline del navegador
 * replican la condición del helper: aquí se evalúa la copia real extraída del fuente.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isBlockedMeasureHost } from './measure-host';

const raiz = new URL('../../', import.meta.url);
const leer = (r: string) => readFileSync(new URL(r, raiz), 'utf8');

const CASOS: Array<[string, string, boolean]> = [
  ['theme.saastro.io', 'theme.saastro.io', false], // host propio: se mide
  ['preview.saastro.io', 'theme.saastro.io', true], // otro *.saastro.io: bloqueado
  ['theme.saastro.io', '', true], // sin host propio: bloqueado como antes
  ['x.saastro.io', 'theme.saastro.io', true],
  ['localhost', 'localhost', true], // el host propio no abre localhost
  ['127.0.0.1', '127.0.0.1', true],
  ['foo.saastro.test', 'foo.saastro.test', true],
  ['foo.local', 'foo.local', true],
  ['www.cliente.com', 'www.cliente.com', false],
  ['www.cliente.com', '', false],
];

describe('isBlockedMeasureHost', () => {
  it.each(CASOS)('%s (propio %j) -> bloqueado=%s', (host, own, esperado) => {
    expect(isBlockedMeasureHost(host, own)).toBe(esperado);
  });
});

/** La condición `const blocked = …` / `if (…) return;` de un script inline, como función. */
function condicionInline(fuente: string, ancla: RegExp): (h: string, ownHost: string) => boolean {
  const m = fuente.match(ancla);
  if (!m) throw new Error('no se encuentra la condición inline: ' + ancla);
  // eslint-disable-next-line no-new-func
  return new Function('h', 'ownHost', `return (${m[1]});`) as (h: string, o: string) => boolean;
}

describe('copias inline de la condición', () => {
  const base = leer('src/layouts/BaseLayout.astro');
  const gen = leer('src/components/GenTracking.astro');
  const copias: Array<[string, (h: string, o: string) => boolean]> = [
    ['BaseLayout', condicionInline(base, /const blocked =\s*([\s\S]*?)\n\s*if \(!blocked\)/)],
    ['GenTracking', condicionInline(gen, /var h = location\.hostname;\s*if \(([\s\S]*?)\)\s*return;/)],
  ];
  for (const [nombre, fn] of copias) {
    it.each(CASOS)(`${nombre}: %s (propio %j) -> bloqueado=%s`, (host, own, esperado) => {
      expect(fn(host, own)).toBe(esperado);
    });
  }

  it('GenTracking pasa el host propio al script', () => {
    expect(gen).toMatch(/data-gen-own-host=\{ownHost\}/);
    expect(gen).toMatch(/Astro\.site\?\.hostname/);
  });

  it('RenderRatio usa el helper con el host propio (no su propia lista)', () => {
    const rr = leer('src/components/RenderRatio.astro');
    expect(rr).toMatch(/isBlockedMeasureHost\(Astro\.url\.hostname, Astro\.site\?\.hostname/);
    expect(rr).not.toMatch(/endsWith\('\.saastro\.io'\)/);
  });
});
