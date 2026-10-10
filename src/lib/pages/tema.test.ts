import { describe, expect, it } from 'vitest';
import { resolverTema, temaForHost } from './tema';

describe('TEMA_BY_HOST', () => {
  const map = '{"prototipo-b.enlolab.com":"b"}';
  it('host del mapa → su tema; cualquier otra cosa → a', () => {
    expect(temaForHost('prototipo-b.enlolab.com', map)).toBe('b');
    expect(temaForHost('PROTOTIPO-B.enlolab.com', map)).toBe('b');
    expect(temaForHost('prototipo.enlolab.com', map)).toBe('a');
    expect(temaForHost('otro.com', map)).toBe('a');
    expect(temaForHost('prototipo-b.enlolab.com', undefined)).toBe('a');
    expect(temaForHost('prototipo-b.enlolab.com', '{roto')).toBe('a');
    expect(temaForHost('x.com', '{"x.com":"z"}')).toBe('a');
  });

  // La causa medida en producción: una var JSON de wrangler/panel llega como
  // OBJETO, no como string, y antes se trataba como «sin mapa» → tema a.
  it('el mapa como OBJETO (var JSON de wrangler) también vale', () => {
    expect(temaForHost('prototipo-b.enlolab.com', { 'prototipo-b.enlolab.com': 'b' })).toBe('b');
    expect(temaForHost('prototipo.enlolab.com', { 'prototipo-b.enlolab.com': 'b' })).toBe('a');
    expect(temaForHost('x.com', ['b'])).toBe('a');
  });

  it('dice de dónde salió el tema', () => {
    expect(resolverTema('prototipo-b.enlolab.com', map)).toEqual({ tema: 'b', fuente: 'mapa' });
    expect(resolverTema('prototipo.enlolab.com', map)).toEqual({ tema: 'a', fuente: 'host-fuera-del-mapa' });
    expect(resolverTema('prototipo-b.enlolab.com', undefined)).toEqual({ tema: 'a', fuente: 'sin-mapa' });
    expect(resolverTema('prototipo-b.enlolab.com', '{roto')).toEqual({ tema: 'a', fuente: 'mapa-invalido' });
    expect(resolverTema('x.com', '{"x.com":"z"}')).toEqual({ tema: 'a', fuente: 'mapa-invalido' });
  });
});
