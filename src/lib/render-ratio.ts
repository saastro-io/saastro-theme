/**
 * render-ratio — cuántas visitas se quedan SIN formulario utilizable.
 *
 * Tres contadores, no dos, y el tercero es el que contesta la pregunta:
 *
 *   r  render    — el `<img>` de 1×1 del HTML. Lo pide todo navegador que
 *                  pinta la página, ejecute JS o no.
 *   j  script    — un `new Image()` desde un `<script>` INLINE. Solo llega si
 *                  el navegador ejecuta scripting.
 *   h  hydrate   — el mismo ping, disparado desde el `useEffect` de la isla
 *                  React del formulario. Solo llega si el bundle se descargó,
 *                  se parseó y montó.
 *
 * De ahí salen dos restas distintas y la segunda es la grande:
 *   r − j  = scripting apagado (el caso raro, el 1,1% de GOV.UK).
 *   j − h  = scripting encendido y el formulario NO montó igualmente: red
 *            caída, bloqueador, CDN, CSP, o cualquier script que reventó
 *            antes. En el estudio de GOV.UK esto era 8 de cada 9.
 *   r − h  = la población que necesita el envío nativo. ESA es la cifra que
 *            decide cuánto se invierte en el envío sin JS.
 *
 * Medir con dos contadores (HTML contra el beacon de Gen) mediría otra cosa: el
 * beacon de Gen va a un TERCER dominio (gen.saastro.io) y cualquier bloqueador
 * por listas lo mata mientras el formulario funciona perfectamente. Ese
 * visitante contaría como «sin JS» y el número saldría inflado justo hacia el
 * lado que nos conviene. Por eso los tres pings son de PRIMERA parte, al Worker
 * del propio site, y comparten prefijo de ruta: lo que un bloqueador mate, lo
 * mata en los tres por igual.
 *
 * Qué NO se recoge, a propósito: ni cookies, ni almacenamiento en el
 * dispositivo, ni identificador de visitante, ni IP, ni user-agent en claro.
 * Se guarda un agregado por ruta y campaña. El `n=` de la URL es un nonce
 * ANTICACHÉ (la respuesta es `no-store`, pero un proxy intermedio colapsaría
 * tres visitas en una si la URL fuera idéntica) — se descarta al recibirlo y
 * no viaja al sumidero.
 */

/** Los tres momentos que se cuentan. La clave es la ruta: `/mx/r.gif`. */
export const KINDS = ['r', 'j', 'h'] as const;
export type Kind = (typeof KINDS)[number];

export function isKind(value: string | undefined): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

/**
 * Bots que se declaran. Un crawler pide el HTML (y a veces las imágenes) y NO
 * ejecuta JS: es indistinguible de un humano sin JS, así que sin este filtro
 * el ratio es basura.
 *
 * LÍMITE CONOCIDO, y no se disimula: esto solo caza al que se identifica. Un
 * scraper con user-agent de Chrome pasa. Por eso los bots NO se descartan en
 * silencio — se cuentan aparte (`bot: true`) y quien lea la cifra ve las dos.
 * El bot score de Cloudflare cerraría el hueco, pero las zonas de la flota van
 * en plan Free y ahí no existe.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|scrape|curl|wget|python-requests|python-urllib|go-http|java\/|okhttp|axios|node-fetch|libwww|httpclient|headless|phantomjs|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot|discordbot|embedly|redditbot|applebot|petalbot|bytespider|ahrefs|semrush|mj12|dotbot|feedfetcher|google-read-aloud/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // sin user-agent no hay navegador normal detrás
  return BOT_UA.test(userAgent);
}

/** Un evento ya normalizado, listo para el sumidero. Sin IP, sin UA, sin id. */
export interface MeasureEvent {
  kind: Kind;
  /**
   * Host de la página medida, en minúsculas y sin puerto.
   *
   * Es parte de la CLAVE en el colector, no un adorno: sin él, dos landings
   * del mismo workspace suman sus dos rutas `/` en la misma fila y la cifra
   * sale mezclada sin que nadie lo vea. Un site con una sola landing no nota
   * la diferencia; el día que tiene dos, el número que decide la inversión en
   * el envío sin JS ya está mal y nada lo dice.
   *
   * Sale del host del PING, que es el mismo que el de la página: los tres
   * contadores son de primera parte a propósito (ver la cabecera). `URL.host`
   * llevaría el puerto en local, así que se usa `hostname`.
   */
  host: string;
  /** Ruta de la página medida (no la del pixel), recortada. */
  path: string;
  /** `utm_campaign` de la landing, si venía. Cadena vacía = sin campaña. */
  campaign: string;
  bot: boolean;
  ts: number;
}

const MAX_FIELD = 120;
// Control characters: nunca llegan de un navegador honesto y ensucian el log
// (un \n partiría la línea JSON en dos y el lector contaría eventos de más).
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Recorta y limpia un valor que viene de la query. Nunca confía en su tamaño. */
function clean(value: string | null): string {
  if (!value) return '';
  return value.slice(0, MAX_FIELD).replace(CONTROL_CHARS, '');
}

export function buildEvent(kind: Kind, url: URL, userAgent: string | null): MeasureEvent {
  return {
    kind,
    host: url.hostname.toLowerCase(),
    path: clean(url.searchParams.get('p')) || '/',
    campaign: clean(url.searchParams.get('c')),
    bot: isLikelyBot(userAgent),
    ts: Date.now(),
  };
}

/**
 * Dónde caen los contadores.
 *
 *   'log'  — una línea JSON por evento a los logs del Worker
 *            (`observability.enabled` ya está en wrangler.jsonc). Es el
 *            sumidero por defecto: no depende de nadie y no escribe en
 *            sistemas de terceros.
 *   'gen'  — además reenvía a Gen DESDE EL SERVIDOR (el navegador nunca habla
 *            con gen.saastro.io por esta vía: si lo hiciera, un bloqueador
 *            rompería la simetría que hace válida la medición). Requiere que
 *            el colector de Gen acepte estos eventos; mientras no lo haga,
 *            deja el sumidero en 'log'.
 */
export type MeasureSink = 'log' | 'gen';

export interface SinkConfig {
  sink: MeasureSink;
  genEndpoint: string;
  genWorkspaceId: string;
  /**
   * El HMAC de la costura `gen.render-ratio`. Vacío o ausente = no se reenvía,
   * pase lo que pase en `sink`.
   *
   * Es PROPIO de esta costura, no el de ingest: aquél es el de productor de
   * leads, compartido con forms-worker y los verticales, y usarlo aquí
   * convertiría cada site descendiente en productor de leads. La costura del
   * directorio ya se quemó así una vez.
   */
  secret?: string;
}

/** La ruta del colector. Interna a propósito: la llama el Worker del site,
 *  nunca un navegador — si un día la llamara el cliente, un bloqueador mataría
 *  unos pings y no otros y la medición dejaría de valer, que es exactamente el
 *  sesgo que los tres pings de primera parte existen para evitar. */
export const RUTA_DEL_COLECTOR = '/api/_internal/render-ratio';

/** La cabecera donde viaja la firma. */
export const CABECERA_DE_FIRMA = 'x-gen-signature';

/**
 * HMAC-SHA256 en hex minúsculas sobre EL CUERPO CRUDO.
 *
 * Sin el prefijo `sha256=` — gen acepta las dos formas y hay que elegir una.
 * Se firma exactamente la cadena que viaja: serializar dos veces produciría
 * dos JSON distintos (el orden de claves no está garantizado entre motores) y
 * el 401 resultante parecería un bug del otro lado.
 */
async function firmar(secreto: string, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Escribe el evento. Devuelve la promesa del reenvío (o null) para que el
 * endpoint la pase a `waitUntil`: en Workers una fetch sin esperar se cancela
 * cuando sale la respuesta, y el evento se perdería en silencio.
 */
export function record(event: MeasureEvent, config: SinkConfig): Promise<unknown> | null {
  // Siempre al log: es el registro que queda aunque el reenvío falle.
  //
  // Los campos van ESCRITOS UNO A UNO y en orden fijo, no con un spread, y sin
  // `ts`. No es estilo: `scripts/ratio.mjs` agrupa por el texto del mensaje en
  // el servidor de Cloudflare, así que dos eventos iguales tienen que producir
  // cadenas idénticas byte a byte. Un `ts` los haría todos distintos —habría
  // que descargarse los eventos uno a uno y el lector toparía con el tope de
  // 2.000— y un spread dejaría el orden a merced del próximo que edite
  // `MeasureEvent`, rompiendo la agrupación en silencio y a la baja. La hora la
  // pone Workers Logs por su cuenta; `ts` sigue viajando al sumidero de Gen,
  // que sí lo necesita.
  console.log(
    JSON.stringify({
      m: 'render-ratio',
      kind: event.kind,
      path: event.path,
      campaign: event.campaign,
      bot: event.bot,
    }),
  );

  if (config.sink !== 'gen' || !config.genWorkspaceId) return null;

  // ── Sin secreto NO se manda, aunque el sumidero diga `gen` ──────────────
  //
  // Mejor no mandar que mandar sin firmar: el colector contestaría 401 y el
  // evento se perdería igual, pero además cada site descendiente estaría
  // llamando a una puerta ajena con un cuerpo que nadie puede atribuir.
  //
  // Va COMO CÓDIGO y no como «acuérdate de dejar el sink en log»: el theme se
  // clona en cada site cliente y `settings.yaml` lo edita quien monta el site.
  // Una barrera que el llamante decide si le aplica es una etiqueta.
  //
  // Y se dice en el log, porque «no llega nada a gen» y «no se está mandando»
  // se leen igual desde el otro lado.
  if (!config.secret) {
    console.warn(
      JSON.stringify({
        m: 'render-ratio',
        aviso: 'sink=gen sin RENDER_RATIO_SECRET: no se reenvía',
        kind: event.kind,
      }),
    );
    return null;
  }

  const endpoint = config.genEndpoint.replace(/\/+$/, '');
  // El cuerpo se serializa UNA vez y esa misma cadena es la que se firma y la
  // que viaja. Dos `JSON.stringify` del mismo objeto no están garantizados
  // byte a byte entre motores, y la firma que no cuadra da un 401 que parece
  // un bug del otro lado.
  const cuerpo = JSON.stringify({
    workspaceId: config.genWorkspaceId,
    type: `render_ratio_${event.kind}`,
    host: event.host,
    path: event.path,
    // AUSENTE cuando no hay campaña, no `{}`. Confirmado con gen el
    // 10-sep-2026, antes de que nadie estrenara la costura: su esquema lo tiene
    // opcional y el contador hace `utm?.campaign ?? ''`, así que «sin campaña»
    // cae en la cadena vacía, que es su propia fila. `utm: {}` daría el mismo
    // resultado y sería una clave de más en cada ping. No lo «arregles».
    utm: event.campaign ? { campaign: event.campaign } : undefined,
    bot: event.bot,
    ts: event.ts,
  });

  // La promesa devuelta cubre la FIRMA y la fetch. Importa: firmar es
  // asíncrono (`crypto.subtle`), así que si sólo se devolviera la fetch, el
  // `waitUntil` del endpoint no cubriría el await de la firma y el reenvío se
  // cancelaría al salir la respuesta — en silencio, y justo en el sumidero que
  // cuenta. `record` sigue siendo síncrona hasta aquí: el `console.log` de
  // arriba ya se ha ejecutado cuando esta promesa nace.
  return (async () => {
    const firma = await firmar(config.secret!, cuerpo);
    return fetch(`${endpoint}${RUTA_DEL_COLECTOR}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CABECERA_DE_FIRMA]: firma },
      body: cuerpo,
      signal: AbortSignal.timeout(2000),
    });
  })().catch(() => {
    // Un contador que tira la landing abajo es peor que no tener contador.
  });
}

/** GIF transparente de 1×1, 42 bytes. */
const GIF_1X1 = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

/**
 * La respuesta del pixel. `no-store` es obligatorio: si el navegador la
 * cachea, la segunda visita no cuenta y el ratio sale bajo — hacia el lado
 * cómodo otra vez.
 */
export function pixelResponse(): Response {
  return new Response(GIF_1X1, {
    status: 200,
    headers: {
      'content-type': 'image/gif',
      'content-length': String(GIF_1X1.byteLength),
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}
