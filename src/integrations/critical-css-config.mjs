// @ts-check
/**
 * Lo que comparten el build (`critical-css.mjs`) y el Worker
 * (`critical-css-middleware.ts`): UNA sola definición de qué es «crítico», para
 * que una página prerenderizada y una SSR salgan con el mismo criterio.
 */

/**
 * Reglas que se inlinan SIEMPRE, aunque el HTML no lleve nada que las active.
 *
 * El análisis es estático sobre el HTML entregado: ve etiquetas, clases, ids y
 * atributos, no el estado que un script pone ANTES del primer pintado ni lo que
 * `var()` resuelve. Cada patrón de aquí cubre una de esas cosas (cada una la
 * rompió una vez; `scripts/critical-css-check.mjs` las vigila):
 *
 *  - `.dark`: la clase la pone `ApplyColorMode` (script síncrono del `<head>`) y
 *    no está en el HTML. Sin ella el crítico pinta el tema CLARO y salta a oscuro.
 *  - `:root` / `html` / `body`: tokens y fuente base. Incluye `:root:has(.ds-home)`,
 *    que fija los tokens de la portada: el motor no evalúa `:has()` y lo
 *    descartaba en silencio (medido: la home pintaba con otros tokens hasta que
 *    llegaba el CSS completo). Un `:has()` anclado a una clase que la página
 *    no tiene se descarta bien; uno anclado a una clase que sí tiene, entra.
 *  - `[data-theme]` / `[data-mode]`: otra forma de poner el tema en `<html>`.
 *  - selectores que EMPIEZAN por `:where(` / `:is(` / `:not(`: el motor quita las
 *    pseudo-clases funcionales antes de buscar el selector en el documento, y si
 *    no queda nada (`:where(.space-y-2>:not(:last-child))`, el `space-y-*` de
 *    Tailwind) descarta la regla en silencio. Medido: el pie perdía 32 px de alto
 *    hasta que llegaba el CSS completo.
 *
 * UN ESTADO PREVIO AL PINTADO PROPIO de un site (p. ej. `.js` o `data-skin` en
 * `<html>` puesto por un script del `<head>`) SE AÑADE AQUÍ. El build avisa («un
 * script del <head> pone «.x» en <html>…») y el control `critical-css-check`
 * falla si olvidas hacerlo. Ver docs/css-critico.md.
 *
 * @type {Array<string | RegExp>}
 */
export const ALLOW_RULES = [
  /^\.dark(?![\w\\-])/,
  /^(:root|html|body)(?![\w-])/,
  /^\[data-(theme|mode)/,
  /^:(where|is|not|matches|-webkit-any|-moz-any)\(/,
];

/** Opciones del procesador (iguales en build y en Worker). @type {import('beasties/runtime').ProcessorOptions} */
export const PROCESSOR_OPTIONS = {
  // Los `<link>` del CSS completo quedan al final del <body>: sin JS, sin `onload`,
  // sin cambios de CSP. Cacheable y compartido entre páginas.
  preload: "body",
  keyframes: "critical",
  inlineFonts: true,
};

/** Sufijo del plan precompilado que acompaña a cada hoja: `/_astro/x.css` → `/_astro/x.css.plan.json`. */
export const PLAN_SUFFIX = ".plan.json";
