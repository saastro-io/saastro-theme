# Idiomas: añadir, quitar o dejar uno solo

La fuente de verdad es **`src/i18n/config.ts`**. De ahí derivan, sin otra lista:
`astro.config.mjs` (`i18n` de Astro, `i18n` del sitemap, idiomas de Studio), la carga de
traducciones, la colección legal y las rutas (`getStaticPaths`). Las derivaciones viven en
`src/lib/i18n-derive.ts` (funciones puras, con tests).

## Qué es configuración y qué es código

| Qué | Dónde | Tipo |
|---|---|---|
| `defaultLocale`, `locales`, `enabled` | `src/i18n/config.ts` | configuración |
| Etiqueta del selector (`localeLabels`) | `src/i18n/config.ts` | configuración (el tipo `Record<Locale,…>` obliga a completarla) |
| Traducciones | `src/i18n/translations/<loc>.json` | contenido (uno por idioma declarado) |
| Textos legales | `src/content/legal/<loc>/*.md` | contenido de JC (no se redacta aquí) |
| Texto del 404 | `src/lib/not-found.ts` | contenido (un `Record<Locale,…>`) |
| Idiomas para el Hub/CMS | `saastrocms.config.ts` (`i18n.locales`, `i18n.defaultLocale`) | configuración a mano: el Hub lo lee por análisis estático, no puede importar `config.ts`. Un test (`i18n-derive.test.ts`) falla si no coincide con `config.ts` |
| Bloque `i18n` de Astro, sitemap, idiomas de Studio | `astro.config.mjs` | **derivado**, no se toca |
| Glob de la colección legal, rutas `/legal/*`, carga de traducciones | `content.config.ts`, `utils.ts`, `legal/[slug].astro` | **derivado**, no se toca |

Los valores de `i18nConfig` van como literales: `scripts/lib/default-locale.mjs` los lee con una
expresión regular (por eso `config.ts` no repite esas líneas en sus comentarios).

## Añadir un idioma (p. ej. `fr`)

1. `src/i18n/config.ts`: añade `'fr'` a `locales` y `fr: 'FR'` a `localeLabels`.
2. `src/i18n/translations/fr.json`: copia el de otro idioma y traduce. **Si falta, el build FALLA**
   con `[i18n] Falta la traducción del idioma 'fr': se esperaba src/i18n/translations/fr.json`
   (antes caía en silencio al idioma base y el build salía en verde con el idioma equivocado).
   Las claves que falten dentro del JSON caen al idioma base (eso sí es intencionado).
3. `src/lib/not-found.ts`: añade la entrada `fr` (el tipo lo exige al compilar).
4. `src/content/legal/fr/*.md`: los textos legales los aporta JC. Sin esa carpeta no hay
   `/fr/legal/*` y los enlaces del pie darán 404.
5. `saastrocms.config.ts`: añade `'fr'` a `i18n.locales`.
6. `pnpm studio:contract:update` y commitea `studio-contract.json` (cambiar de idiomas regenera el
   manifiesto: es lo esperado).
7. Comprueba: `pnpm typecheck && pnpm test && SITE_URL=https://<tu-dominio> pnpm build && pnpm studio:check`.

Contenido por idioma que NO se deriva: páginas en `content/pages/<loc>/` y los textos por idioma
de las landings (`src/pages/[...locale]/lp/**`, fuera de esta guía): ahí hay que revisar a mano cada idioma nuevo.

## Quitar un idioma

Quítalo de `locales` y de `localeLabels` (`config.ts`), de `not-found.ts` y de `saastrocms.config.ts`;
borra (o deja) su `<loc>.json` y `src/content/legal/<loc>/`: **un json o una carpeta legal de un idioma no
declarado no se carga ni genera páginas**, y `studio:check` solo cuenta los idiomas declarados.
Regenera el manifiesto (`pnpm studio:contract:update`).

## Dejar un solo idioma

`locales: ['es']` con `defaultLocale: 'es'`. Resultado medido: rutas sin prefijo, sin selector de
idioma, sin `hreflang` ni en el HTML ni en el sitemap, `<html lang>` del idioma base.

`enabled: false` significa exactamente «solo el idioma base» (equivale a `locales: [defaultLocale]`):
el resto de `locales` se ignora y no hay `/<otro>/…`. El middleware rellena `Astro.locals.lang/t/localePath`
siempre, así que `ToggleTheme`, `brand.ts` y el contrato de Studio no dependen de que haya varios idiomas.

## Base distinta de inglés

`defaultLocale: 'es'` sirve el español en la raíz y el resto con prefijo (`/en/…`); no existe `/es/`.
Sitemap: `hreflang="es"` → `/`, `hreflang="en"` → `/en/`; la página lleva además `x-default` → `/`.

## Probar los escenarios (manual, no va en CI)

`node scripts/i18n-escenarios.mjs [0 A A2 B C]` copia el repo a un directorio temporal por escenario,
cambia la config y comprueba typecheck, build, rutas, sitemap, hreflang, `<html lang>`, selector, 404 por
idioma (con `astro preview` en el puerto `I18N_PORT`, 4497 por defecto) y `studio:check`. Cada escenario son
varios builds (~1 min). Sale con 1 si algo falla. Los escenarios:

- `0` control: la config del repo, `studio:check` sin regenerar.
- `A` `enabled:false` · `A2` `locales:['es']` · `B` base `es` + `en` · `C` base `es` + `en` + `fr`
  (con un `fr.json` y un `legal/fr` de prueba que solo existen en la copia).
