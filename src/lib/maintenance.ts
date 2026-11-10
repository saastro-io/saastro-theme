/**
 * maintenance.ts — «página en construcción» gobernada por el Hub. OPT-IN.
 *
 * El site pregunta al Hub (`GET /api/_public/maintenance/<siteId>`) si está en
 * obras. Si lo está y la visita no trae un pase válido, el middleware responde
 * un 503 con la página en vez del contenido.
 *
 * Reglas que no se negocian:
 *  - FALLA ABIERTO: Hub caído, lento, 5xx o JSON raro = se sirve el site.
 *    Nunca se tira un site por culpa del Hub.
 *  - Todo lo que viene del Hub es no fiable: `title`/`message`/`contactEmail`
 *    se escapan; `logoUrl` solo https y solo en `<img src>`; `accentColor`
 *    solo `#rrggbb` y solo en `style`. Nada del Hub va en un `href`.
 *  - Apagado por defecto (`maintenance.enabled` en settings.yaml): sin el flag
 *    no hay ni una petición al Hub.
 */
import type { SiteSettings } from './settings';

export const MAINTENANCE_HUB_ORIGIN = 'https://hub.saastro.io';
export const PASE_COOKIE = 'saastro_pase';
export const PASE_PARAM = 'pase';
/** Cuánto vale la respuesta del Hub sin pase (la brecha entre «activo» y «visto»). */
export const CACHE_MS = 5_000;
/** Si el Hub no contesta en esto, se sirve el site. */
export const TIMEOUT_MS = 1_500;
const COOKIE_MAX_AGE = 12 * 60 * 60;
const DEFAULT_RETRY_AFTER = 3600;
const MAX_RETRY_AFTER = 7 * 24 * 3600;

export interface MaintenanceState {
  readonly enabled: true;
  readonly title: string;
  readonly message: string;
  readonly returnAt: string | null;
  readonly contactEmail: string;
  readonly logoUrl: string | null;
  readonly accentColor: string | null;
  /** Solo si se preguntó con `?pase=`. */
  readonly pase?: boolean;
}
export type MaintenanceResult = { readonly enabled: false; readonly pase?: boolean } | MaintenanceState;

type MaintInput = Pick<SiteSettings, 'forms'> & { readonly maintenance?: unknown };

/** `null` = apagado. Solo `true` (o la cadena "true") lo enciende, y hace falta un siteId. */
export function resolveMaintenance(settings: MaintInput): { siteId: string; hubOrigin: string } | null {
  const raw = settings.maintenance;
  if (raw === null || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!(m.enabled === true || m.enabled === 'true')) return null;
  const siteId = (settings.forms?.siteId ?? '').trim();
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(siteId)) return null;
  return { siteId, hubOrigin: MAINTENANCE_HUB_ORIGIN };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida la respuesta del Hub. Cualquier cosa rara = `null` (→ falla abierto). */
export function parseMaintenance(body: unknown): MaintenanceResult | null {
  if (body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const pase = typeof b.pase === 'boolean' ? b.pase : undefined;
  if (b.enabled === false) return pase === undefined ? { enabled: false } : { enabled: false, pase };
  if (b.enabled !== true) return null;
  let logoUrl: string | null = null;
  const rawLogo = str(b.logoUrl, 2048);
  if (rawLogo) {
    try {
      const u = new URL(rawLogo);
      if (u.protocol === 'https:') logoUrl = u.href;
    } catch {
      /* logo inválido: sin logo */
    }
  }
  const accent = str(b.accentColor, 7);
  let returnAt: string | null = null;
  const rawReturn = str(b.returnAt, 64);
  if (rawReturn && !Number.isNaN(Date.parse(rawReturn))) returnAt = rawReturn;
  return {
    enabled: true,
    title: str(b.title, 200),
    message: str(b.message, 2000),
    returnAt,
    contactEmail: str(b.contactEmail, 254),
    logoUrl,
    accentColor: HEX.test(accent) ? accent : null,
    ...(pase === undefined ? {} : { pase }),
  };
}

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

const cache = new Map<string, { at: number; value: MaintenanceResult | null }>();
/** Solo para tests. */
export function _resetMaintenanceCache(): void {
  cache.clear();
}

/**
 * Pregunta al Hub. `null` = no se pudo saber (el llamador sirve el site).
 * Sin pase se cachea CACHE_MS (también el fallo, para no martillar a un Hub
 * caído); con pase nunca.
 */
export async function fetchMaintenance(
  cfg: { siteId: string; hubOrigin: string },
  opts: { pase?: string; fetchImpl?: FetchLike; now?: number } = {},
): Promise<MaintenanceResult | null> {
  const now = opts.now ?? Date.now();
  const key = `${cfg.hubOrigin}|${cfg.siteId}`;
  if (!opts.pase) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.value;
  }
  let value: MaintenanceResult | null = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let url = `${cfg.hubOrigin}/api/_public/maintenance/${encodeURIComponent(cfg.siteId)}`;
    if (opts.pase) url += `?${PASE_PARAM}=${encodeURIComponent(opts.pase)}`;
    const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
    const res = await doFetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (res.ok) value = parseMaintenance(await res.json());
  } catch {
    value = null;
  } finally {
    clearTimeout(timer);
  }
  if (!opts.pase) cache.set(key, { at: now, value });
  return value;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** Segundos para `Retry-After`: hasta `returnAt` si es futuro, con tope; si no, 1 h. */
export function retryAfterSeconds(returnAt: string | null, now = Date.now()): number {
  if (!returnAt) return DEFAULT_RETRY_AFTER;
  const s = Math.ceil((Date.parse(returnAt) - now) / 1000);
  if (!Number.isFinite(s) || s <= 0) return DEFAULT_RETRY_AFTER;
  return Math.min(s, MAX_RETRY_AFTER);
}

/** `contactEmail` solo se enlaza si parece un email; el href lo construye el theme, no el Hub. */
const EMAIL = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/;

export function renderMaintenanceHtml(m: MaintenanceState, siteName: string, lang: string): string {
  const title = m.title || siteName || 'Back soon';
  const accent = m.accentColor ?? '#111827';
  const logo = m.logoUrl ? `<img src="${esc(m.logoUrl)}" alt="" class="logo" height="48">` : '';
  const message = m.message ? `<p>${esc(m.message).replace(/\r?\n/g, '<br>')}</p>` : '';
  const ret = m.returnAt
    ? `<p class="meta"><time datetime="${esc(new Date(m.returnAt).toISOString())}">${esc(new Date(m.returnAt).toUTCString())}</time></p>`
    : '';
  const contact =
    m.contactEmail && EMAIL.test(m.contactEmail)
      ? `<p class="meta"><a href="mailto:${esc(m.contactEmail)}">${esc(m.contactEmail)}</a></p>`
      : '';
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#111827;background:#fff;text-align:center}
main{max-width:36rem;padding:2rem}
.logo{display:block;margin:0 auto 1.5rem;max-width:12rem;height:auto}
h1{margin:0 0 1rem;font-size:2rem;line-height:1.2;color:${accent}}
.meta{color:#4b5563;font-size:.9rem}
a{color:${accent}}
</style>
</head>
<body>
<main>
${logo}
<h1>${esc(title)}</h1>
${message}
${ret}
${contact}
</main>
</body>
</html>`;
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

export function paseCookie(token: string): string {
  return `${PASE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

/** Rutas que nunca pasan por la comprobación: assets y rutas internas. */
export function esRutaExenta(pathname: string): boolean {
  return (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/_image') ||
    pathname.startsWith('/__') ||
    /\.[a-z0-9]{2,5}$/i.test(pathname)
  );
}

export interface MaintenanceDecision {
  readonly action: 'pass' | 'block' | 'setpase';
  readonly state?: MaintenanceState;
  readonly token?: string;
}

/** La decisión entera, sin Request ni Response: es lo que se testea. */
export async function decideMaintenance(
  cfg: { siteId: string; hubOrigin: string },
  input: { queryPase: string | null; cookiePase: string | null },
  fetchImpl?: FetchLike,
): Promise<MaintenanceDecision> {
  const base = await fetchMaintenance(cfg, { fetchImpl });
  if (!base || !base.enabled) return { action: 'pass' };
  const token = input.queryPase || input.cookiePase;
  if (token) {
    const checked = await fetchMaintenance(cfg, { pase: token, fetchImpl });
    // Hub caído al validar un pase: falla abierto también.
    if (!checked) return { action: 'pass' };
    if (checked.pase === true) {
      return input.queryPase ? { action: 'setpase', token: input.queryPase } : { action: 'pass' };
    }
    if (!checked.enabled) return { action: 'pass' };
    return { action: 'block', state: checked };
  }
  return { action: 'block', state: base };
}
