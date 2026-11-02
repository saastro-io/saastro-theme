/**
 * whatsapp.ts — de dónde sale el número del widget flotante de WhatsApp.
 *
 * Por orden:
 *   1. variable de build `PUBLIC_WHATSAPP_NUMBER` (la pone el DESPLIEGUE; no es un secreto:
 *      acaba en el HTML servido como enlace wa.me)
 *   2. clave i18n `whatsapp.number` (editable en el Hub)
 * Sin número válido el widget NO se monta.
 *
 * Una variable NO vacía va sola: si es inválida se descarta con aviso y el widget no se monta;
 * NO cae a la clave i18n (misma regla que `PUBLIC_TRACKING_*`: quien la pone sustituye, y caer
 * al i18n reencendería el número que la variable venía a quitar). Vacía o sin definir = i18n.
 *
 * FORMATO: se admite lo que se escribe a mano (`+34 600 000 000`, `(34) 600-000-000`): se quitan
 * espacios, paréntesis, guiones, puntos y un `+` inicial. Lo que queda debe ser SOLO dígitos,
 * 8 a 15 (E.164: indicativo de país incluido, máximo 15). Un `00` inicial no se interpreta.
 * Cualquier otra cosa (letras, `/`, `?`…) se rechaza: el número acaba en una URL wa.me.
 */

export const ENV_WHATSAPP = 'PUBLIC_WHATSAPP_NUMBER';

export interface NumeroWhatsApp {
  /** Solo dígitos, o '' si no hay número utilizable. */
  number: string;
  /** Mensaje de build si había un valor y se descartó. */
  warning?: string;
}

/** Normaliza y valida; devuelve los dígitos o `null` si el valor no es un número válido. */
export function normalizeWhatsAppNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const limpio = raw.trim().replace(/^\+/, '').replace(/[\s().-]/g, '');
  return /^\d{8,15}$/.test(limpio) ? limpio : null;
}

export function resolveWhatsAppNumber(envValue: unknown, i18nValue: unknown): NumeroWhatsApp {
  const delEnv = envValue == null ? '' : typeof envValue === 'string' ? envValue.trim() : null;
  if (delEnv !== '') {
    const n = delEnv === null ? null : normalizeWhatsAppNumber(delEnv);
    return n
      ? { number: n }
      : { number: '', warning: `[whatsapp] ${ENV_WHATSAPP}: número inválido (8 a 15 dígitos con indicativo, sin letras) — DESCARTADO; el widget NO se monta y NO se usa la clave i18n whatsapp.number` };
  }
  const delI18n = i18nValue == null ? '' : typeof i18nValue === 'string' ? i18nValue.trim() : null;
  if (delI18n === '') return { number: '' };
  const n = delI18n === null ? null : normalizeWhatsAppNumber(delI18n);
  return n
    ? { number: n }
    : { number: '', warning: '[whatsapp] i18n whatsapp.number: número inválido (8 a 15 dígitos con indicativo, sin letras) — DESCARTADO; el widget NO se monta' };
}
