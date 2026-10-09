/**
 * La puerta de las rutas firmadas de «páginas como datos», sin Astro dentro
 * para poder probarla en node:
 *
 * - `POST /__render` → `prepareRender` (firma + sobre + props del bloque).
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
  tema: z.string().optional(),
  block: blockRefSchema,
});

export interface RenderJob {
  siteId: string;
  locale: string;
  tema: Tema;
  block: ValidBlock;
}

/**
 * Devuelve la `Response` de error (404/405/401/400) o el trabajo de render.
 * `siteId`: `PAGES_SITE_ID` (sin él, 404). `locales`: los del site; un locale
 * ajeno es un 400, no un render en inglés.
 */
export async function prepareRender(
  request: Request,
  secret: string | undefined | null,
  siteId: string | undefined | null,
  locales: readonly string[],
  now?: number,
): Promise<Response | RenderJob> {
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
  const env = renderEnvelopeSchema.safeParse(body);
  if (!env.success) return json(400, { error: 'sobre', issues: env.error.issues });
  if (env.data.siteId !== siteId) {
    return json(400, { error: 'siteId', issues: [{ path: ['siteId'], message: 'siteId de otro site' }] });
  }
  if (!locales.includes(env.data.locale)) {
    return json(400, { error: 'locale', issues: [{ path: ['locale'], message: `locale fuera de ${locales.join(', ')}` }] });
  }
  if (env.data.tema !== undefined && !isTema(env.data.tema)) {
    return json(400, { error: 'tema', issues: [{ path: ['tema'], message: 'tema desconocido' }] });
  }
  const tema: Tema = isTema(env.data.tema) ? env.data.tema : 'a';
  const r = validateBlock(env.data.block, tema);
  if (!r.ok) {
    return json(400, { error: r.issue.reason, issues: r.issue.issues ?? [] });
  }
  return { siteId: env.data.siteId, locale: env.data.locale, tema, block: r.block };
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
  | { mode: 'preview' }
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
  const ok = await verificarPreview(secret, key, url.searchParams.get('__pv'), now);
  if (!ok) {
    return {
      mode: 'reject',
      response: new Response('vista previa caducada o inválida', {
        status: 401,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      }),
    };
  }
  return { mode: 'preview' };
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
