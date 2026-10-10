/**
 * Marcadores de «páginas como datos». A mano A PROPÓSITO: aquí la clave no es
 * un namespace de i18n (lo que instrumenta el plugin de Studio desde
 * `fieldPrefix`) sino el `id` del bloque en el documento, y el campo es la ruta
 * de la prop (`items.0.q`). Por eso `src/blocks/` queda fuera de `autoWrap`
 * (astro.config.mjs).
 */
/**
 * Raíz de un bloque. Con `tema`, la sección lleva además `data-tema`: así el
 * fragmento suelto de `/__render` trae su tema aunque no tenga contenedor (el
 * puente lo mete como hijo DIRECTO de `[data-saastro-blocks]`, sin envoltorio).
 */
export const sec = (id: string, tema?: string) => ({
  'data-saastro': `sec:${id}`,
  ...(tema ? { 'data-tema': tema } : {}),
});
export const field = (path: string) => ({ 'data-saastro-field': path });
