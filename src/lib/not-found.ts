import type { Locale } from '@/i18n/config';

/**
 * Textos del 404. Viven aquí y no en `src/i18n/translations` porque el 404 lo
 * sirve el Worker en runtime (no entra en la enumeración de páginas de
 * `studio:check`, que daría las claves por huérfanas). Cada idioma del site
 * necesita su entrada: el tipo `Record<Locale, …>` lo obliga al compilar.
 */
export interface NotFoundCopy {
  title: string;
  heading: string;
  body: string;
  home: string;
}

export const notFoundCopy: Record<Locale, NotFoundCopy> = {
  en: {
    title: 'Page not found',
    heading: 'Page not found',
    body: "Sorry, we couldn't find the page you're looking for.",
    home: 'Go back home',
  },
  es: {
    title: 'Página no encontrada',
    heading: 'Página no encontrada',
    body: 'Lo sentimos, no hemos encontrado la página que buscas.',
    home: 'Volver al inicio',
  },
};
