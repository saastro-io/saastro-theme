/**
 * Firmas HMAC-SHA256 de «páginas como datos» (Web Crypto: corre igual en
 * workerd, en node y en el navegador del Hub).
 *
 * Dos formas, las dos del contrato con el Hub:
 *
 * - Cabecera `x-saastro-sig: t=<unix>,v1=<hex>` con
 *   `hex = HMAC(secret, "<t>.<siteId>.<METODO>.<ruta+query>.<cuerpoRaw>")` y
 *   ventana ±60 s (Hub #655): una firma capturada no vale contra otro site,
 *   otro método ni otra ruta. La usan `POST /__render`, `POST /__purge` y la
 *   lectura del BORRADOR al Hub (`GET …?draft=1`, cuerpo vacío).
 * - Token de vista previa `?__pv=<exp>.<hex>` con
 *   `hex = HMAC(secret, "${siteId}:${locale}:${slug}:${exp}")`, exp en
 *   segundos y como mucho 15 min en el futuro.
 *
 * Se firma la cadena EXACTA que viaja (el cuerpo crudo): volver a serializar
 * el JSON cambia el orden de claves y daría 401 «del otro lado».
 */

export const CABECERA_FIRMA = 'x-saastro-sig';
export const VENTANA_S = 60;
export const PREVIEW_MAX_S = 15 * 60;

const enc = new TextEncoder();

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comparación en tiempo constante respecto al contenido: recorre siempre la
 * longitud de `expected` y acumula diferencias con XOR. La longitud del hex de
 * un SHA-256 es pública (64), así que salir antes por longitud no filtra nada.
 */
export function timingSafeEqual(a: string, expected: string): boolean {
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const nowS = () => Math.floor(Date.now() / 1000);

/** Lo que ata una firma a UNA petición: site, método, ruta+query y cuerpo crudo. */
export interface PeticionFirmada {
  siteId: string;
  /** Se normaliza a mayúsculas. */
  metodo: string;
  /** `url.pathname + url.search` tal cual llega (p. ej. `/__render`, `/api/…?draft=1`). */
  ruta: string;
  /** Cuerpo crudo; `''` en GET. */
  cuerpo: string;
}

/** `<t>.<siteId>.<METODO>.<ruta+query>.<cuerpo>` — idéntico a `mensajeFirmado` del Hub. */
export function mensajeFirmado(t: number | string, p: PeticionFirmada): string {
  return `${t}.${p.siteId}.${p.metodo.toUpperCase()}.${p.ruta}.${p.cuerpo}`;
}

/** `pathname + search` de una URL: la ruta que entra en el mensaje firmado. */
export function rutaDe(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  return u.pathname + u.search;
}

export async function firmarPeticion(secret: string, p: PeticionFirmada, t = nowS()): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, mensajeFirmado(t, p))}`;
}

export type MotivoFirma = 'ausente' | 'malformada' | 'caducada' | 'no-coincide';

export async function verificarFirma(
  secret: string,
  header: string | null | undefined,
  p: PeticionFirmada,
  now = nowS(),
): Promise<{ ok: true } | { ok: false; motivo: MotivoFirma }> {
  if (!header) return { ok: false, motivo: 'ausente' };
  const parts = new Map<string, string>();
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
  const tRaw = parts.get('t');
  const v1 = parts.get('v1')?.toLowerCase();
  if (!tRaw || !/^\d{1,12}$/.test(tRaw) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) {
    return { ok: false, motivo: 'malformada' };
  }
  const t = Number(tRaw);
  if (Math.abs(now - t) > VENTANA_S) return { ok: false, motivo: 'caducada' };
  const expected = await hmacHex(secret, mensajeFirmado(tRaw, p));
  return timingSafeEqual(v1, expected) ? { ok: true } : { ok: false, motivo: 'no-coincide' };
}

export interface PreviewKey {
  siteId: string;
  locale: string;
  slug: string;
}

export async function firmarPreview(secret: string, key: PreviewKey, exp: number): Promise<string> {
  return `${exp}.${await hmacHex(secret, `${key.siteId}:${key.locale}:${key.slug}:${exp}`)}`;
}

export async function verificarPreview(
  secret: string,
  key: PreviewKey,
  token: string | null | undefined,
  now = nowS(),
): Promise<boolean> {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token ?? '');
  if (!m) return false;
  const exp = Number(m[1]);
  // Caducado, o con una caducidad más lejana que el máximo del contrato: un
  // token de 15 min no puede convertirse en uno de un año cambiando `exp`
  // (cambiarlo ya rompe el HMAC, pero el tope deja el contrato explícito).
  if (exp < now || exp > now + PREVIEW_MAX_S) return false;
  return timingSafeEqual(m[2], await hmacHex(secret, `${key.siteId}:${key.locale}:${key.slug}:${exp}`));
}
