/**
 * El reenvío de los contadores a gen: lo que se manda, cómo se firma, y —sobre
 * todo— **cuándo NO se manda**.
 *
 * Se prueba `record` y no la ruta: `/mx/[kind].gif.ts` necesita el runtime de
 * Astro y el de Workers, y falsear los dos para comprobar una firma sería
 * probar el andamio en vez de la decisión. Lo que la ruta aporta y aquí no se
 * ve —que el `waitUntil` cubra la promesa entera— tiene su propio test abajo,
 * contra la promesa que `record` devuelve, que es lo que la ruta le pasa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CABECERA_DE_FIRMA,
  RUTA_DEL_COLECTOR,
  buildEvent,
  record,
  type MeasureEvent,
  type SinkConfig,
} from './render-ratio';

const SECRETO = ['secreto', 'de', 'prueba', 'del', 'ratio'].join('-');

const base: SinkConfig = {
  sink: 'gen',
  genEndpoint: 'https://gen.saastro.test',
  genWorkspaceId: 'ws-1',
  secret: SECRETO,
};

const evento = (extra: Partial<MeasureEvent> = {}): MeasureEvent => ({
  kind: 'r',
  host: 'www.zamesegur.es',
  path: '/lp/vida',
  campaign: 'meta-vida',
  bot: false,
  ts: 1_789_000_000_000,
  ...extra,
});

/** La firma esperada, calculada aquí con la misma primitiva pero por separado:
 *  si se importara la del módulo, el test pasaría aunque las dos estuvieran
 *  mal igual. */
async function hmacHex(secreto: string, cuerpo: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(cuerpo));
  return Array.from(new Uint8Array(s), (b) => b.toString(16).padStart(2, '0')).join('');
}

let llamadas: { url: string; init: RequestInit }[] = [];
let logs: string[] = [];
let avisos: string[] = [];

beforeEach(() => {
  llamadas = [];
  logs = [];
  avisos = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  });
  vi.spyOn(console, 'log').mockImplementation((m: unknown) => void logs.push(String(m)));
  vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void avisos.push(String(m)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sin secreto no se manda, diga lo que diga el sumidero', () => {
  it('`sink: gen` sin secreto NO llama a nadie', async () => {
    // La mitad que importa: el theme se clona en cada site cliente y
    // `settings.yaml` lo edita quien monta el site. Si esto dependiera de que
    // alguien se acuerde de dejar el sumidero en `log`, sería una etiqueta.
    const p = record(evento(), { ...base, secret: undefined });
    expect(p).toBeNull();
    await Promise.resolve();
    expect(llamadas).toEqual([]);
  });

  it('…y lo DICE, porque «no llega nada» y «no se manda» se leen igual desde gen', () => {
    record(evento(), { ...base, secret: '' });
    expect(avisos.join('')).toContain('sin RENDER_RATIO_SECRET');
  });

  it('el sumidero `log` no manda nada aunque haya secreto', async () => {
    expect(record(evento(), { ...base, sink: 'log' })).toBeNull();
    await Promise.resolve();
    expect(llamadas).toEqual([]);
  });

  it('sin workspaceId tampoco: un evento sin dueño no se cuenta en ningún sitio', async () => {
    expect(record(evento(), { ...base, genWorkspaceId: '' })).toBeNull();
    await Promise.resolve();
    expect(llamadas).toEqual([]);
  });
});

describe('lo que viaja', () => {
  it('va a la ruta interna, con la cabecera de firma', async () => {
    await record(evento(), base);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe(`https://gen.saastro.test${RUTA_DEL_COLECTOR}`);
    // Interna a propósito: la llama el Worker del site, nunca un navegador.
    expect(RUTA_DEL_COLECTOR).toContain('_internal');
    const h = llamadas[0]!.init.headers as Record<string, string>;
    expect(h[CABECERA_DE_FIRMA]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la firma es del CUERPO QUE VIAJA, byte a byte', async () => {
    // Si se serializara dos veces, la firma no cuadraría y el 401 parecería un
    // bug del otro lado. Esto ata las dos cosas a la misma cadena.
    await record(evento(), base);
    const { init } = llamadas[0]!;
    const h = init.headers as Record<string, string>;
    expect(h[CABECERA_DE_FIRMA]).toBe(await hmacHex(SECRETO, init.body as string));
  });

  it('sin el prefijo `sha256=`: se eligió una de las dos formas', async () => {
    await record(evento(), base);
    const h = llamadas[0]!.init.headers as Record<string, string>;
    expect(h[CABECERA_DE_FIRMA].startsWith('sha256=')).toBe(false);
  });

  it('lleva el HOST, que es lo que separa dos landings del mismo workspace', async () => {
    await record(evento(), base);
    const cuerpo = JSON.parse(llamadas[0]!.init.body as string);
    expect(cuerpo.host).toBe('www.zamesegur.es');
    expect(cuerpo.workspaceId).toBe('ws-1');
    expect(cuerpo.path).toBe('/lp/vida');
    expect(cuerpo.utm).toEqual({ campaign: 'meta-vida' });
  });

  it('y NO lleva identificador de visitante ni URL: aquí no hay a quién identificar', async () => {
    await record(evento(), base);
    const cuerpo = JSON.parse(llamadas[0]!.init.body as string);
    expect(cuerpo.visitorId).toBeUndefined();
    expect(cuerpo.url).toBeUndefined();
  });

  it('los tres kind dan tres tipos distintos', async () => {
    for (const k of ['r', 'j', 'h'] as const) await record(evento({ kind: k }), base);
    const tipos = llamadas.map((c) => JSON.parse(c.init.body as string).type);
    expect(tipos).toEqual(['render_ratio_r', 'render_ratio_j', 'render_ratio_h']);
    expect(new Set(tipos).size).toBe(3);
  });
});

describe('la promesa que se le pasa a `waitUntil`', () => {
  it('cubre la FIRMA además de la fetch', async () => {
    // Firmar es asíncrono. Si `record` devolviera sólo la fetch, el `await` de
    // la firma quedaría fuera del `waitUntil` y el reenvío se cancelaría al
    // salir la respuesta — en silencio, y justo en el sumidero que cuenta.
    //
    // Se comprueba por el efecto: en el instante en que `record` devuelve,
    // todavía NO se ha llamado a fetch (la firma está en curso). Si la promesa
    // no cubriera esa parte, la llamada ya estaría hecha o no se haría nunca.
    const p = record(evento(), base);
    expect(p).not.toBeNull();
    expect(llamadas).toHaveLength(0);
    await p;
    expect(llamadas).toHaveLength(1);
  });

  it('un fallo del colector no tira la landing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('gen caído');
    });
    await expect(record(evento(), base)).resolves.toBeUndefined();
  });
});

describe('el log, que es el registro que sobrevive al reenvío', () => {
  it('dos eventos iguales producen la MISMA cadena, byte a byte', () => {
    // `scripts/ratio.mjs` agrupa por el texto del mensaje en el servidor de
    // Cloudflare. Un `ts` los haría todos distintos y el lector toparía con su
    // tope de 2.000 — la cuenta saldría baja, en silencio y hacia el lado
    // cómodo.
    record(evento(), { ...base, sink: 'log' });
    record(evento({ ts: 999 }), { ...base, sink: 'log' });
    expect(logs[0]).toBe(logs[1]);
  });

  it('no lleva `ts` ni `host`: su forma no cambia con este PR', () => {
    // El host viaja a gen, pero NO al log: añadirlo cambiaría la cadena y
    // `ratio.mjs` dejaría de agrupar con lo ya registrado, mezclando dos
    // formatos sin decirlo. Si algún día hace falta, se cambia el lector a la vez.
    record(evento(), { ...base, sink: 'log' });
    const l = JSON.parse(logs[0]!);
    expect(l).toEqual({
      m: 'render-ratio',
      kind: 'r',
      path: '/lp/vida',
      campaign: 'meta-vida',
      bot: false,
    });
  });

  it('se escribe SIEMPRE, también cuando el reenvío no sale', () => {
    record(evento(), { ...base, secret: undefined });
    expect(logs).toHaveLength(1);
  });
});

describe('el host sale del ping, en minúsculas y sin puerto', () => {
  it('de la URL del pixel', () => {
    const e = buildEvent('r', new URL('https://WWW.Uno.ES/mx/r.gif?p=/a&c=x'), 'Mozilla/5.0');
    expect(e.host).toBe('www.uno.es');
  });

  it('y en local, sin el puerto', () => {
    const e = buildEvent('j', new URL('http://localhost:4321/mx/j.gif'), 'Mozilla/5.0');
    expect(e.host).toBe('localhost');
  });
});
