/**
 * Contacto alternativo de las landings `/lp/**`, visible en el HTML.
 *
 * Por qué visible y no en `<noscript>`: `<noscript>` solo se pinta con el scripting
 * deshabilitado. Si el JS está habilitado y el bundle falla (red, bloqueador, CSP,
 * otro script que revienta antes), el navegador NO lo muestra, y ese es el caso
 * mayoritario. Un bloque normal, en el HTML servido, lo ve también ese visitante.
 *
 * Decisión pura, sin Astro, para poder probarla. Un valor inválido se descarta (no
 * se pinta un enlace roto): vacío o ausente = sin bloque.
 */
export interface LpContactSettings {
  readonly phone?: string;
  readonly email?: string;
}

export interface LpContact {
  readonly phone?: { readonly label: string; readonly href: string };
  readonly email?: { readonly label: string; readonly href: string };
}

const EMAIL = /^[^\s@<>"',;:?&]+@[^\s@<>"',;:?&]+\.[^\s@<>"',;:?&]+$/;

export function lpContact(cfg: LpContactSettings | undefined | null): LpContact | null {
  const out: { phone?: LpContact['phone']; email?: LpContact['email'] } = {};

  const phone = typeof cfg?.phone === 'string' ? cfg.phone.trim() : '';
  const digits = phone.replace(/[^\d]/g, '');
  // Solo dígitos, espacios, guiones, paréntesis, puntos y un + inicial; 6–15 dígitos (E.164).
  if (/^\+?[\d\s().-]+$/.test(phone) && digits.length >= 6 && digits.length <= 15) {
    out.phone = { label: phone, href: `tel:${phone.startsWith('+') ? '+' : ''}${digits}` };
  }

  const email = typeof cfg?.email === 'string' ? cfg.email.trim() : '';
  if (EMAIL.test(email)) out.email = { label: email, href: `mailto:${email}` };

  return out.phone || out.email ? out : null;
}
