/**
 * Marcadores de «páginas como datos». A mano A PROPÓSITO: aquí la clave no es
 * un namespace de i18n (lo que instrumenta el plugin de Studio desde
 * `fieldPrefix`) sino el `id` del bloque en el documento, y el campo es la ruta
 * de la prop (`items.0.q`). Por eso `src/blocks/` queda fuera de `autoWrap`
 * (astro.config.mjs).
 */
export const sec = (id: string) => ({ 'data-saastro': `sec:${id}` });
export const field = (path: string) => ({ 'data-saastro-field': path });
