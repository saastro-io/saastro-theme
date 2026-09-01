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
}

/**
 * Escribe el evento. Devuelve la promesa del reenvío (o null) para que el
 * endpoint la pase a `waitUntil`: en Workers una fetch sin esperar se cancela
 * cuando sale la respuesta, y el evento se perdería en silencio.
 */
export function record(event: MeasureEvent, config: SinkConfig): Promise<unknown> | null {
  // Siempre al log: es el registro que queda aunque el reenvío falle.
  console.log(JSON.stringify({ m: 'render-ratio', ...event }));

  if (config.sink !== 'gen' || !config.genWorkspaceId) return null;

  const endpoint = config.genEndpoint.replace(/\/+$/, '');
  return fetch(`${endpoint}/collect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceId: config.genWorkspaceId,
      type: `render_ratio_${event.kind}`,
      path: event.path,
      utm: event.campaign ? { campaign: event.campaign } : undefined,
      bot: event.bot,
      ts: event.ts,
    }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
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
