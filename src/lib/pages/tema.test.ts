import { describe, expect, it } from 'vitest';
import { temaForHost } from './tema';

describe('TEMA_BY_HOST', () => {
  const map = '{"prototipo-b.enlolab.com":"b"}';
  it('host del mapa → su tema; cualquier otra cosa → a', () => {
    expect(temaForHost('prototipo-b.enlolab.com', map)).toBe('b');
    expect(temaForHost('PROTOTIPO-B.enlolab.com', map)).toBe('b');
    expect(temaForHost('otro.com', map)).toBe('a');
    expect(temaForHost('prototipo-b.enlolab.com', undefined)).toBe('a');
    expect(temaForHost('prototipo-b.enlolab.com', '{roto')).toBe('a');
    expect(temaForHost('x.com', '{"x.com":"z"}')).toBe('a');
  });
});
