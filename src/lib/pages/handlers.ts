/**
 * La puerta de las rutas firmadas de «páginas como datos», sin Astro dentro
 * para poder probarla en node:
 *
 * - `POST /__render` → `prepareRender` (firma del Hub O token de vista previa
 *   del navegador + sobre + props del bloque), y su preflight `OPTIONS`.
 * - `POST /__purge`  → `handlePurge`.
 * - `/<locale>/p/<slug>?__pv=…` → `checkPreview`.
 *
 * Regla común: SIN `PAGES_RENDER_SECRET` o SIN `PAGES_SITE_ID` todo esto
 * responde 404, como si no existiera. Es lo que hace inocuo el cambio para cada
 * site descendiente. La firma va atada a ese siteId, al método y a la ruta+query
 * (`firma.ts`), y el siteId del cuerpo (o de los tags) tiene que ser el mismo.
 */
import { z } from 'zod';
import { CABECERA_FIRMA, rutaDe, verificarFirma, verificarPreview, type PreviewKey } from './firma';
import { blockRefSchema, validateBlock, type ValidBlock } from './doc';
import { isTema } from './tema';
import type { Tema } from '../../blocks/registry';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

/** Firma de una petición entrante, atada a `siteId`, método y ruta+query tal cual llegan. */
const firmaDe = (request: Request, secret: string, siteId: string, raw: string, now?: number) =>
  verificarFirma(
    secret,
    request.headers.get(CABECERA_FIRMA),
    { siteId, metodo: request.method, ruta: rutaDe(request.url), cuerpo: raw },
    now,
  );

export const renderEnvelopeSchema = z.object({
  v: z.literal(1),
  siteId: z.string().min(1),
  locale: z.string().min(2).max(10),
  /** Solo en el render directo del navegador: el slug al que está atado el token `__pv`. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/).optional(),
  tema: z.string().optional(),
  block: blockRefSchema,
});

/** Lo que ata el token `__pv`, sacado del cuerpo antes de validarlo entero. */
const pvKeySchema = z.object({
  locale: z.string().min(2).max(10),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
});

/** Token de vista previa (`?__pv` del iframe) del render directo. Cabecera, nunca query: no queda en logs. */
export const CABECERA_PV = 'x-saastro-pv';
/** Tope del cuerpo de `/__render` (los dos modos): un bloque son unos pocos KB. */
export const MAX_RENDER_BYTES = 64 * 1024;
/** Lo que el navegador cachea el preflight. */
export const CORS_MAX_AGE_S = 600;

/** El origen exacto de `PAGES_HUB_ORIGIN` (http/https), o null si falta o no es una URL. */
export function hubOriginDe(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Cabeceras CORS de `/__render`. Solo para el origen EXACTO del Hub: nunca `*`
 * ni se refleja el `Origin` que llega; sin credenciales. Con el Hub
 * configurado, `Vary: Origin` va siempre (también cuando el origen no casa),
 * para que ninguna caché sirva una respuesta con CORS a otro origen.
 */
function corsPara(hub: string | null, origin: string | null): { ok: boolean; headers: Record<string, string> } {
  if (!hub) return { ok: false, headers: {} };
  if (origin !== hub) return { ok: false, headers: { vary: 'Origin' } };
  return {
    ok: true,
    headers: {
      vary: 'Origin',
      'access-control-allow-origin': hub,
      'access-control-expose-headers': 'server-timing',
      'timing-allow-origin': hub,
    },
  };
}

/**
 * Lee el cuerpo con tope de bytes; null si lo pasa (sin leer el resto: con
 * `content-length` de más ni lo empieza). Nota de banco: en `wrangler dev` /
 * `unstable_startWorker`, responder sin consumir un cuerpo grande hace que el
 * proxy de desarrollo pierda la conexión de la petición SIGUIENTE; por eso el
 * 413 va el último en `scripts/paginas-datos-check.mjs`.
 */
async function leerConTope(request: Request, max: number): Promise<string | null> {
  const len = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(len) && len > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    buf.set(p, o);
    o += p.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export interface RenderJob {
  siteId: string;
  locale: string;
  tema: Tema;
  block: ValidBlock;
  /** Quién autorizó: el Hub con su firma, o el navegador con el token de vista previa. */
  auth: 'hmac' | 'pv';
  /** Lo que tardó verificar la firma o el token, en ms (para `Server-Timing`). */
  firmaMs: number;
  /** Cabeceras CORS que la respuesta tiene que llevar (vacío fuera del render directo). */
  cors: Record<string, string>;
}

export interface RenderOptions {
  /** `PAGES_HUB_ORIGIN`: sin él no hay render directo ni preflight (404). */
  hubOrigin?: string | null;
  now?: number;
}

/**
 * `/__render`. Devuelve la `Response` de error o el trabajo de render.
 *
 * Dos formas de autorizar un `POST`:
 * - **Hub → site**: `x-saastro-sig` (firma HMAC atada a site, método y ruta).
 * - **Navegador → site** (render directo, sin pasar por el Hub): `x-saastro-pv`
 *   con el token de vista previa del iframe, `Origin` = `PAGES_HUB_ORIGIN`
 *   exacto y un cuerpo con `siteId` = `PAGES_SITE_ID` y el `locale` y `slug`
 *   a los que está atado el token. El token NO se debilita: es el mismo HMAC
 *   `siteId:locale:slug:exp` de `?__pv`, con la misma caducidad (≤ 15 min).
 *   El render es una función pura de los props del cuerpo: no lee el borrador
 *   ni nada del Hub.
 * Si llegan las dos cabeceras manda la firma. Sin ninguna, 401 como siempre.
 *
 * `OPTIONS` (preflight): 204 con las cabeceras CORS SOLO si `Origin` es el del
 * Hub; con otro origen, 403 sin cabeceras CORS.
 *
 * Sin `PAGES_RENDER_SECRET` o sin `PAGES_SITE_ID`: 404 a todo, como antes. Sin
 * `PAGES_HUB_ORIGIN`: el render directo y el preflight dan 404; la firma del
 * Hub sigue igual. Cuerpo de más de `MAX_RENDER_BYTES`: 413.
 */
export async function prepareRender(
  request: Request,
  secret: string | undefined | null,
  siteId: string | undefined | null,
  locales: readonly string[],
  opts: RenderOptions = {},
): Promise<Response | RenderJob> {
  if (!secret || !siteId) return notFound();
  const hub = hubOriginDe(opts.hubOrigin);
  const cors = corsPara(hub, request.headers.get('origin'));

  if (request.method === 'OPTIONS') {
    if (!hub) return notFound();
    if (!cors.ok) return new Response(null, { status: 403, headers: { 'cache-control': 'no-store', ...cors.headers } });
    return new Response(null, {
      status: 204,
      headers: {
        ...cors.headers,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': `content-type, ${CABECERA_PV}`,
        'access-control-max-age': String(CORS_MAX_AGE_S),
      },
    });
  }
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: hub ? 'POST, OPTIONS' : 'POST', ...cors.headers } });
  }

  const sigHeader = request.headers.get(CABECERA_FIRMA);
  const pv = request.headers.get(CABECERA_PV);
  const modo: 'hmac' | 'pv' = !sigHeader && pv !== null ? 'pv' : 'hmac';
  const fail = (status: number, body: unknown) => json(status, body, cors.headers);
  if (modo === 'pv') {
    if (!hub) return notFound();
    if (!cors.ok) return fail(403, { error: 'origin' });
  }

  const raw = await leerConTope(request, MAX_RENDER_BYTES);
  if (raw === null) return fail(413, { error: 'tamaño', max: MAX_RENDER_BYTES });

  let firmaMs = 0;
  if (modo === 'hmac') {
    const t0 = performance.now();
    const sig = await firmaDe(request, secret, siteId, raw, opts.now);
    firmaMs = performance.now() - t0;
    if (!sig.ok) return fail(401, { error: 'firma', motivo: sig.motivo });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, { error: 'json' });
  }

  if (modo === 'pv') {
    // El token se comprueba ANTES de mirar nada más del cuerpo, y contra
    // `PAGES_SITE_ID`, no contra el `siteId` que diga el cuerpo: sin token
    // válido no hay respuesta que distinga un siteId acertado de uno fallido
    // ni errores de Zod. (El `Origin` no autentica: un servidor lo falsifica;
    // lo que autoriza es el token, y el render solo pinta los props recibidos.)
    const llave = pvKeySchema.safeParse(body);
    const t0 = performance.now();
    const ok = llave.success && (await verificarPreview(secret, { siteId, ...llave.data }, pv, opts.now));
    firmaMs = performance.now() - t0;
    if (!ok) return fail(401, { error: 'pv', motivo: 'token ausente, caducado, malformado o de otro site, locale o slug' });
  }

  const env = renderEnvelopeSchema.safeParse(body);
  if (!env.success) return fail(400, { error: 'sobre', issues: env.error.issues });
  if (env.data.siteId !== siteId) {
    // Con firma, el Hub mandó un sobre incoherente (400). Con token (ya
    // válido para ESTE site), el cuerpo pide renderizar como otro: 403.
    return fail(modo === 'pv' ? 403 : 400, { error: 'siteId', issues: [{ path: ['siteId'], message: 'siteId de otro site' }] });
  }

  if (!locales.includes(env.data.locale)) {
    return fail(400, { error: 'locale', issues: [{ path: ['locale'], message: `locale fuera de ${locales.join(', ')}` }] });
  }
  if (env.data.tema !== undefined && !isTema(env.data.tema)) {
    return fail(400, { error: 'tema', issues: [{ path: ['tema'], message: 'tema desconocido' }] });
  }
  const tema: Tema = isTema(env.data.tema) ? env.data.tema : 'a';
  const r = validateBlock(env.data.block, tema);
  if (!r.ok) {
    return fail(400, { error: r.issue.reason, issues: r.issue.issues ?? [] });
  }
  return { siteId: env.data.siteId, locale: env.data.locale, tema, block: r.block, auth: modo, firmaMs, cors: cors.headers };
}

const TAG_RE = /^pg:[^:\s]{1,100}:[^:\s]{1,10}:[a-z0-9][a-z0-9-]{0,99}$/;
const purgeSchema = z.object({ tags: z.array(z.string().regex(TAG_RE)).min(1).max(30) });

export async function handlePurge(
  request: Request,
  secret: string | undefined | null,
  siteId: string | undefined | null,
  invalidate: (tags: string[]) => Promise<void>,
  now?: number,
): Promise<Response> {
  if (!secret || !siteId) return notFound();
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const raw = await request.text();
  const sig = await firmaDe(request, secret, siteId, raw, now);
  if (!sig.ok) return json(401, { error: 'firma', motivo: sig.motivo });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'json' });
  }
  const parsed = purgeSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: 'tags', issues: parsed.error.issues });
  const ajenos = parsed.data.tags.filter((t) => t.split(':')[1] !== siteId);
  if (ajenos.length > 0) return json(400, { error: 'siteId', issues: [{ path: ['tags'], message: `tags de otro site: ${ajenos.join(', ')}` }] });
  try {
    await invalidate(parsed.data.tags);
  } catch (err) {
    return json(502, { error: 'invalidate', message: (err as Error)?.message ?? String(err) });
  }
  return json(200, { purged: parsed.data.tags });
}

export type PreviewCheck =
  | { mode: 'public' }
  | { mode: 'preview'; firmaMs: number }
  | { mode: 'reject'; response: Response };

/**
 * `?__pv` ausente → página pública. Presente → sin secreto o sin
 * `PAGES_SITE_ID` (`siteId`), 404 (la lectura del borrador va firmada con él);
 * token malo 401.
 */
export async function checkPreview(
  url: URL,
  secret: string | undefined | null,
  siteId: string | undefined | null,
  key: PreviewKey,
  now?: number,
): Promise<PreviewCheck> {
  if (!url.searchParams.has('__pv')) return { mode: 'public' };
  if (!secret || !siteId || key.siteId !== siteId) return { mode: 'reject', response: notFound() };
  const t0 = performance.now();
  const ok = await verificarPreview(secret, key, url.searchParams.get('__pv'), now);
  const firmaMs = performance.now() - t0;
  if (!ok) {
    return {
      mode: 'reject',
      response: new Response('vista previa caducada o inválida', {
        status: 401,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      }),
    };
  }
  return { mode: 'preview', firmaMs };
}

/** CSP de la vista previa: el Hub puede encuadrarla; nadie más. */
export function previewFrameAncestors(hubOrigin: string | undefined | null): string {
  let origin = '';
  try {
    if (hubOrigin) origin = new URL(hubOrigin).origin;
  } catch {
    origin = '';
  }
  return origin ? `frame-ancestors 'self' ${origin}` : "frame-ancestors 'self'";
}

/**
 * Cabecera INTERNA: la ruta deja aquí la suma (ms) de las fases que midió ella
 * —firma, documento— y el middleware de tiempos (`timing-middleware.ts`) la
 * resta del total para sacar `render`, y la borra antes de responder.
 */
export const CABECERA_FASES_MS = 'x-saastro-fases-ms';

/** `Server-Timing` con la duración en ms y los bloques omitidos. */
export function serverTiming(parts: { name: string; dur?: number; desc?: string }[]): string {
  return parts
    .map((p) => {
      let s = p.name;
      if (p.dur !== undefined) s += `;dur=${Math.round(p.dur * 10) / 10}`;
      if (p.desc !== undefined) s += `;desc="${p.desc.replace(/["\\]/g, '')}"`;
      return s;
    })
    .join(', ');
}
