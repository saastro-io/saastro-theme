import { getTranslations } from '@/i18n/utils';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import type { LandingNotConfiguredCopy } from '@/lib/lp';

/**
 * El aviso «formulario no conectado» en el idioma del bloque — el mismo
 * `lp.notConfigured` que usan las landings. En un `.ts` a propósito: este
 * bloque no es una sección i18n de Studio (su clave es el id del bloque), y el
 * doctor de Studio exigiría un marcador de namespace a cualquier `.astro` que
 * lea `t.lp`.
 */
export function formCopy(locale: string): { lang: Locale; notConfigured: LandingNotConfiguredCopy } {
  const lang: Locale = (locales as readonly string[]).includes(locale) ? (locale as Locale) : defaultLocale;
  return { lang, notConfigured: getTranslations(lang).lp.notConfigured };
}
