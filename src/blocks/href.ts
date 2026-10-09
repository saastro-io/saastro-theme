import { z } from 'zod';

/**
 * Un enlace que viene del Hub: ancla, ruta del site, https, mailto o tel.
 * Nunca `javascript:` ni `data:` — sería XSS almacenado desde el contenido.
 */
export const safeHref = z
  .string()
  .min(1)
  .max(500)
  .regex(/^(#|\/(?!\/)|https:\/\/|mailto:|tel:)/, 'href: #ancla, /ruta, https://, mailto: o tel:');
