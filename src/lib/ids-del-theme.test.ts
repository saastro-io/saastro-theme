/**
 * Guarda de HUELLA: los ids de medición y el WhatsApp de theme.saastro.io no pueden volver
 * a colarse en settings.yaml ni en las traducciones de un repo que sale de esta plantilla.
 *
 * No exige que los campos estén vacíos (un descendiente lleva los suyos y su suite no debe
 * romperse): falla solo si un valor COINCIDE con uno de los del theme. Se guardan sus sha256,
 * no los valores, para no repetirlos en el repo.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const HUELLAS: Record<string, string> = {
  '90e6fe7f78e2d60eb0269881e8e591ed65c6b55a6443ddfa3b6c533689f5f37a': 'GA4 del theme',
  'bb882abc7ac780a04a2ace033cadfbbe171503002a07d4a75fb9bc24dbe36eaf': 'Clarity del theme',
  'c77d0cff7eab31c381919ecec8fc3a39a35de6912eb0fdede073fefb91043165': 'token de Cloudflare Web Analytics del theme',
  '6f7c8fd773325124fae3319cc5c4837ee14f5b2039402b8dba68fab949377a03': 'WhatsApp del theme',
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Qué huellas del theme aparecen entre estas cadenas (cada una, y cada id de una lista por comas). */
export function huellasDelTheme(valores: string[]): string[] {
  const out: string[] = [];
  for (const v of valores) {
    for (const parte of new Set([v, ...v.split(',')])) {
      const h = HUELLAS[sha(parte.trim())];
      if (h) out.push(h);
    }
  }
  return out;
}

/** Todas las cadenas hoja de un objeto. */
function hojas(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) hojas(v, out);
  return out;
}

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('la huella detecta', () => {
  it('un valor idéntico al del theme, solo o dentro de una lista', () => {
    // Se fabrica la entrada con un valor cuya huella conocemos: el de prueba se registra al vuelo.
    const falso = 'G-TESTAAAA01';
    HUELLAS[sha(falso)] = 'fixture';
    expect(huellasDelTheme([falso])).toEqual(['fixture']);
    expect(huellasDelTheme([`G-OTRO000001, ${falso}`])).toEqual(['fixture']);
    expect(huellasDelTheme(['G-OTRO000001'])).toEqual([]);
    delete HUELLAS[sha(falso)];
  });
});

describe('ningún id del theme en el repo', () => {
  it('settings.yaml (tracking y analytics, incluido el token de Cloudflare)', () => {
    const s = parse(leer('../data/settings.yaml')) as { tracking?: unknown; analytics?: unknown };
    expect(huellasDelTheme([...hojas(s.tracking), ...hojas(s.analytics)])).toEqual([]);
  });

  it.each(['es', 'en'])('%s.json no lleva el WhatsApp del theme', (loc) => {
    const t = JSON.parse(leer(`../i18n/translations/${loc}.json`)) as { whatsapp?: { number?: string } };
    expect(huellasDelTheme([t.whatsapp?.number ?? ''])).toEqual([]);
  });
});
