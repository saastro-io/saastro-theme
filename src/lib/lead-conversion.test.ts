import { describe, expect, it, vi } from 'vitest';
import { isInternalPath, leadEventId, onLeadSuccess, REDIRECT_DELAY_MS, type TrackWindow } from './lead-conversion';

function ventana(over: Partial<TrackWindow> = {}) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const asignado: string[] = [];
  const w: TrackWindow = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return 0; },
    location: { assign: (h) => { asignado.push(h); } },
    crypto: { randomUUID: () => 'uuid-generado' },
    ...over,
  };
  return { w, timers, asignado };
}

describe('leadEventId', () => {
  it('usa el _event_id del formulario (el mismo que viajó al Hub)', () => {
    expect(leadEventId({ _event_id: 'abc-123' })).toBe('abc-123');
  });
  it('sin campo, vacío o no-cadena, genera uno nuevo', () => {
    const w = { crypto: { randomUUID: () => 'nuevo' } };
    expect(leadEventId({}, w)).toBe('nuevo');
    expect(leadEventId({ _event_id: '   ' }, w)).toBe('nuevo');
    expect(leadEventId({ _event_id: 42 }, w)).toBe('nuevo');
  });
  it('un id absurdamente largo no viaja a los proveedores', () => {
    expect(leadEventId({ _event_id: 'x'.repeat(500) }, { crypto: { randomUUID: () => 'nuevo' } })).toBe('nuevo');
  });
});

describe('isInternalPath', () => {
  it('acepta rutas internas', () => {
    expect(isInternalPath('/lp/gracias')).toBe(true);
    expect(isInternalPath('/es/lp/gracias?x=1')).toBe(true);
  });
  it('rechaza todo lo que pueda sacar al visitante del site', () => {
    for (const h of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/ /evil.com', '/a\\b', '/\u0000x', '', undefined, null, 5]) {
      expect(isInternalPath(h)).toBe(false);
    }
  });
});

describe('onLeadSuccess', () => {
  it('emite generate_lead con el event_id del formulario y redirige tras el retardo', () => {
    const llamadas: unknown[][] = [];
    const { w, timers, asignado } = ventana({ saastroTrack: (...a) => { llamadas.push(a); return ['meta']; } });
    const r = onLeadSuccess({ _event_id: 'E-1' }, { thanksHref: '/lp/gracias' }, w);
    expect(r).toEqual({ eventId: 'E-1', sent: ['meta'] });
    expect(llamadas).toEqual([['generate_lead', { event_id: 'E-1' }]]);
    expect(asignado).toEqual([]); // aún no: los píxeles tienen que terminar de enviar
    expect(timers[0].ms).toBe(REDIRECT_DELAY_MS);
    timers[0].fn();
    expect(asignado).toEqual(['/lp/gracias']);
  });

  it('sin consentimiento (saastroTrack no existe o devuelve []) igual redirige', () => {
    const { w, timers, asignado } = ventana();
    const r = onLeadSuccess({}, { thanksHref: '/lp/gracias' }, w);
    expect(r.sent).toEqual([]);
    timers[0].fn();
    expect(asignado).toEqual(['/lp/gracias']);
  });

  it('un píxel que lanza NO impide la redirección', () => {
    const { w, timers, asignado } = ventana({ saastroTrack: () => { throw new Error('boom'); } });
    expect(() => onLeadSuccess({}, { thanksHref: '/lp/gracias' }, w)).not.toThrow();
    timers[0].fn();
    expect(asignado).toEqual(['/lp/gracias']);
  });

  it('un thanksHref externo se ignora: no hay redirección', () => {
    const { w, timers } = ventana();
    onLeadSuccess({}, { thanksHref: 'https://evil.com' }, w);
    onLeadSuccess({}, { thanksHref: '//evil.com' }, w);
    expect(timers).toEqual([]);
  });

  it('sin thanksHref solo emite (el panel de éxito del formulario sigue visible)', () => {
    const t = vi.fn(() => ['ga4']);
    const { w, timers } = ventana({ saastroTrack: t });
    onLeadSuccess({ _event_id: 'E' }, {}, w);
    expect(t).toHaveBeenCalledOnce();
    expect(timers).toEqual([]);
  });
});
