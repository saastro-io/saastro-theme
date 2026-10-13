/**
 * Vista previa de una landing en BORRADOR, con un token firmado y caducable.
 *
 * CONTRATO CON EL HUB (quien firma es el Hub; este módulo solo VERIFICA):
 *
 *   token   = `${exp}.${firma}`
 *   exp     = segundos Unix en que caduca (entero, decimal)
 *   firma   = base64url sin relleno de HMAC-SHA256(secreto, `lp-preview:${slug}:${exp}`)
 *   secreto = `LP_PREVIEW_SECRET`, el mismo valor en el Hub y en el Worker del site
 *   URL     = `/lp/<slug>?preview=<token>`
 *
 * La firma lleva el slug: un token de una landing no abre otra. Lleva `exp`: no
 * hay token eterno, y el techo (`MAX_VIGENCIA_S`) impide que el Hub, por error,
 * firme uno de un año.
 *
 * SIN secreto no hay vista previa: `verifyPreview` devuelve false y la ruta se
 * comporta como siempre (borrador → redirect a home). Es el estado por defecto
 * de toda la flota, igual que con `RENDER_RATIO_SECRET`.
 */

/** Techo de vigencia que este lado acepta, aunque el Hub firme más. */
export const MAX_VIGENCIA_S = 24 * 60 * 60;

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function key(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function message(slug: string, exp: number | string): string {
  return `lp-preview:${slug}:${exp}`;
}

/** Firma un token. El Hub hace esto; aquí existe para los tests y para ensayar. */
export async function signPreview(secret: string, slug: string, exp: number): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(message(slug, exp)));
  return `${exp}.${base64url(sig)}`;
}

/**
 * ¿Es válido este token para esta landing, ahora? Cualquier cosa rara (sin
 * secreto, sin token, formato malo, caducado, vigencia por encima del techo,
 * otro slug, firma distinta) es false: nunca lanza.
 */
export async function verifyPreview(
  secret: string | undefined,
  token: string | null | undefined,
  slug: string | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!secret || !token || !slug) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expText = token.slice(0, dot);
  if (!/^\d{1,12}$/.test(expText)) return false;
  const exp = Number(expText);
  const now = Math.floor(nowMs / 1000);
  if (exp <= now) return false;
  if (exp - now > MAX_VIGENCIA_S) return false;
  const sig = base64urlToBytes(token.slice(dot + 1));
  if (!sig) return false;
  try {
    // `verify` compara en tiempo constante.
    return await crypto.subtle.verify('HMAC', await key(secret, 'verify'), sig, enc.encode(message(slug, expText)));
  } catch {
    return false;
  }
}
