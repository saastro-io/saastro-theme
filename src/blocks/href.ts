import { z } from 'zod';

/**
 * Destino de un enlace en un documento: ancla (`#contact`), ruta del site
 * (`/about`) o `https://`. Nada de `javascript:`, `data:` ni `//host`.
 */
export const safeHref = z
  .string()
  .min(1)
  .max(300)
  .refine((v) => /^(#|\/(?!\/)|https:\/\/)/.test(v), {
    message: 'Usa un ancla (#x), una ruta (/x) o https://',
  });
