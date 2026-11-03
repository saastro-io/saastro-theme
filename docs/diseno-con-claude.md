# Diseñar con Claude un site de este theme: qué es libre, qué es obligatorio y qué se hereda

> **Para quién**: un modelo (Claude en claude.ai o Claude Design) que va a diseñar las páginas de un site nuevo sobre `saastro-theme`, o quien le prepara el encargo. No repite los otros documentos, los enlaza: el cómo portar un diseño está en [claude-design-handoff.md](claude-design-handoff.md), el mapa del proyecto en [pipeline.md](pipeline.md), lo que hay que cambiar en un site recién creado en [nuevo-site-checklist.md](nuevo-site-checklist.md).
>
> **Cómo leerlo.** Medido sobre `main` en `0c66c88` (3-nov-2026), con `@saastro/studio` 0.14.0 (pin exacto en `package.json`). Cada afirmación lleva su origen: **medido** (comando ejecutado, con su resultado), **código** (leído en el fichero citado, no ejecutado) o **SIN VERIFICAR** (no ejecutado ni contrastado). Los números de línea son de ese commit.

## La idea corta, y dónde no es exacta

«Todo es opcional y el theme solo aprovecha la base» es cierto para el **aspecto, el contenido y la estructura de las páginas**, y falso para un **núcleo ejecutable** que la CI comprueba. La regla práctica:

> **Es libre todo lo que ningún guardián mira. Lo que sí miran está enumerado en el bloque B, con su comando.** «Terminado» = esos guardianes en verde, no «se ve bien».

Y hay un tercer grupo (bloque C): cosas que el site **hereda sin pedirlas** o que **se activan** y, al activarse, obligan a algo (casi siempre, a declararlo en la política de cookies).

---

## A. LIBRE: lo que puedes inventar sin pedir permiso

Cada fila es libre **mientras se cumplan las condiciones de la derecha**; esas condiciones son, a su vez, el contenido del bloque B.

| Libre | Condición (qué guardián lo vigila) |
|---|---|
| **Paleta, radios y tipografía**: los valores de los tokens de `src/styles/global.css` (`:root` y `.dark`). Una marca es dar croma a `--primary`/`--accent` (o añadir `--brand`), siempre en oklch. Fuente: [claude-design-handoff.md §3](claude-design-handoff.md#3-tokens--srcstylesglobalcss-is-the-ssot). | Nada de hex a pelo en `.astro` (`hardcoded_hex`); el CSS emitido debe seguir llevando `var(--font-body)`, `var(--font-display)` y la clase `.ac` (`css-tokens`). Ver [§ Reglas de CSS](#reglas-de-css-y-rendimiento). |
| **Fuentes**: cualquier familia, cambiando `--font-body` / `--font-display` en `:root`. Cargar desde el CDN de Google es una decisión del owner (16-jul-2026, [`knowledge/src.md`](../knowledge/src.md)), no un error. | Cargarlas **obliga a declararlo** en la política de cookies, y **ningún portero lo comprueba** (medido: `grep` de `googleapis`/`gstatic` en `scripts/`, `src/`, `public/`, `docs/` solo da la nota de `knowledge/src.md`). Esa falta de control es una razón para decirlo al encargado, no para callarla. |
| **Textos de ejemplo y copy**: todo el JSON de `src/i18n/translations/<locale>.json`. | Mismas claves en todos los idiomas (`i18n_parity`); cada hoja la lee alguna página (`i18n-consumo`); el texto llega **tal cual** al HTML (`verbatim`). |
| **Las secciones de la portada** (`src/pages/[...locale]/index.astro`, `src/components/home/*`, y las de ejemplo `Hero`, `Products`, `TrustBar`…). El `.gitattributes` las marca `merge=ours`: son contenido de ejemplo, el site se queda con las suyas ([CLAUDE.md](../CLAUDE.md)). | Cada sección lleva su marcador `data-saastro="sec:<key>"` (lo inyecta el plugin; ver B.2). Quitar, añadir o renombrar una sección cambia el contrato: **medido** (renombrar `fieldPrefix="faq"` a `faq2` en la página): `sec-markers` da `sec:faq` AUSENTE y `sec:faq2` NO registrada, en las dos portadas. Es el cambio deliberado que se registra con `pnpm studio:contract:update` (ver B.5). |
| **Páginas nuevas enteras** bajo `src/pages/` con `SiteLayout`. | Entran al contrato: `routes` y `sec-markers` piden `studio:contract:update`; `locale-parity` exige que cada página del idioma por defecto exista en los demás; `pagina-servida` exige cuerpo no vacío y `<title>` con texto. |
| **Componentes y adapters nuevos** en `src/components/` y `src/components/blocks/`. Patrón Bloque → Adapter → Contenido: [claude-design-handoff.md §1](claude-design-handoff.md#1-port-section-by-section) y [`knowledge/src.md`](../knowledge/src.md). | Raíz en **etiqueta HTML en minúscula**; `key = fieldPrefix = namespace i18n`; sin transformar el texto. |
| **Bloques de «páginas como datos»** (`src/blocks/<tipo>/Block.astro`, solo con datos y los enums de estilo de `src/blocks/estilo.ts`) y **páginas como borradores del Hub**: [claude-design-handoff.md §1b y §1c](claude-design-handoff.md#1b-new-sections-as-blocks-srcblockstipoblockastro). | Una carpeta nueva en `src/blocks/` pone `pnpm test` en rojo (**medido**, ver B.4). Publicar es siempre humano. |
| **Cabecera y pie con otro aspecto**, incluso sustituirlos por la ranura `header`/`footer` de `SiteLayout`. | Conservan el cableado (menú móvil, selector de idioma, botón `#manage-cookies-btn`, contact sheet). `manage-cookies` y `marca-header` lo vigilan. Ver B.2. |
| **Landings de campaña**: una entrada `.md` en la colección `lp` (`/lp/<slug>`), con `layout` `hero-form` o `largo`. | SSR, nunca prerenderizadas; no editables con Studio. Detalle en [CLAUDE.md](../CLAUDE.md#landings-lpslug--páginas-de-campaña-por-colección). |
| **Imágenes, logos, favicon, OG** (en `public/` y `src/assets/brand/`). | Ver [§ Imágenes](#imágenes). |

Lo que **no** es libre aunque lo parezca: los ficheros de arquitectura con hash (B.2, invariante `architecture`), las primitivas `src/components/ui/*` que vienen del registry (`pnpm ui:check`, B.1) y `form.tsx`/`field.tsx` (exports por nombre, `form-primitives`).

---

## B. OBLIGATORIO: qué hay que dejar en verde y cómo se comprueba

### B.1 Qué es «verde»

La CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) tiene dos jobs:

- **`studio-check`**: `pnpm install --frozen-lockfile` → `pnpm run typecheck` → `pnpm run test` → `pnpm studio:check`.
- **`ui-check`**: `node scripts/ui-check.mjs --diff` (drift de las primitivas contra el registry; puede ponerse rojo sin que tu cambio lo toque).

`pnpm studio:check` no es un único script: son **ocho comandos encadenados** (`package.json`, línea 14). Si uno falla, los siguientes no corren.

| # | Comando | Qué mira | Docs |
|---|---|---|---|
| 1 | `node scripts/cabeceras-check.mjs` | que `public/_headers` y `src/lib/security-headers.ts` declaren las mismas cabeceras (nombre y valor) | B.3 |
| 2 | `node scripts/studio-check.mjs` | **el doctor** sobre el código fuente (B.1.a) | abajo |
| 3 | `astro build` (con `PUBLIC_SAASTRO_I18N_READS=1 SAASTRO_CHECK_ROUTES=1`) | que el site construya; el registro de lecturas i18n que necesita `i18n-consumo` | — |
| 4 | `node scripts/studio-contract-check.mjs` | **el contrato** sobre el DOM construido o servido (B.2) | abajo |
| 5 | `node scripts/pwa-check.mjs` | `dist/client` coherente con `pwa.enabled` | [pwa.md](pwa.md) |
| 6 | `node scripts/pwa-build-check.mjs` | un build con la PWA encendida (en memoria) tiene link y manifest | [pwa.md](pwa.md) |
| 7 | `node scripts/cabeceras-worker-check.mjs` | que el Worker construido sirva las 6 cabeceras | B.3 |
| 8 | `node scripts/critical-css-check.mjs` | que cada página (también las rutas SSR) pinte igual con solo su CSS crítico que con el CSS completo, en claro y oscuro, y CLS = 0 | B.3, [css-critico.md](css-critico.md) |

Medido el 3-nov-2026 sobre `0c66c88` con `SITE_URL=https://example.test pnpm studio:check`: salida 0, con avisos (`tracking-legal` inverso para GA4 y Clarity, `i18n-consumo` para `lp` y `whatsapp.*`, ver B.2). En esa pasada el contrato corrió en **modo crawl**: levanta `wrangler dev` sobre `dist/server/wrangler.json` y pide cada ruta por HTTP. No está colgado, está arrancando un servidor.

#### B.1.a El doctor (`scripts/studio-check.mjs`, paquete `@saastro/studio/doctor` 0.14.0)

Es el mismo validador que usa el «Setup» del Hub: verde aquí ⇒ verde allí. Lee `src/**/*.{astro,tsx,jsx}` y los JSON de i18n.

**Bloquean** (cuentan para la salida 1; severidad leída en `node_modules/@saastro/studio/dist/doctor.js`):

| Estado | Qué significa | Cómo se arregla | Reproducido |
|---|---|---|---|
| `missing_marker` | un componente pinta `t.<key>` y no lleva marcador | darle `fieldPrefix` (el plugin inyecta el marcador) o raíz en etiqueta minúscula | **medido**: componente que pinta `t.zzsec.title` sin `fieldPrefix` → `✖ [missing_marker] … fix: data-saastro="sec:zzsec"`, salida 1 |
| `no_schema_no_i18n` | sección marcada sin namespace i18n ni `interface Props` | crear el namespace `<key>` en los JSON | código |
| `autowrap_gap` | se recorre un array derivado (`items.map(...)` sobre una copia) y el plugin no puede instrumentar sus elementos | pasar el array **directo** del i18n, o marcador de campo a mano | **medido**: salida 1 con `✖ [autowrap_gap] … Array prop "items" is iterated via a derived variable` |
| `unreachable_root` | la raíz de la sección es un componente (`<Logo />`), no una etiqueta HTML: el marcador no tiene dónde caer | envolver en `<section>`/`<div>` | **medido**: cuenta como bloqueante (`1 need attention`, salida 1) pero **`studio-check.mjs` no imprime la línea** (su lista `ATTENTION` no incluye este estado, `scripts/studio-check.mjs`); el síntoma es solo «failed — 1 blocking issue(s)». Si el doctor falla sin motivo visible, busca una raíz en PascalCase. El mensaje del doctor dice que el build también falla (**SIN VERIFICAR**, no reproducido) |
| `i18n_parity` | una clave existe en un idioma y no en otro | añadirla en todos | **medido**: quitar `hero.title` de `es.json` → `✖ [i18n_parity] … "hero.title" is missing in locale "es"` |
| `hardcoded_hex` | un hex en un `.astro`: `[#xxxxxx]` de Tailwind, un atributo `style`, o un bloque `<style>` (los `<svg>` se excluyen) | usar un token oklch (`var(--primary)`…) | **medido**: `style="color:#ff0000"` en `TrustBar.astro` → `✖ [hardcoded_hex]`. Ojo: solo mira `.astro`; el hex en `.css` o `.tsx` no lo caza este control, pero rompe la regla igual |
| `raw_form` | un `<form>` en `.astro`/`.tsx`/`.jsx` | usar `<HubForm>` de `@saastro/forms` | **medido**: `<form>` en `TrustBar.astro` → `✖ [raw_form]` |
| `spans_malformed` | un valor con forma de «rich spans» mal formado (`[{ text, marks? }]`) | corregir la forma o volver a string | código |

**Solo avisan** (severidad `warn`, no cambian la salida): `allowlist_violation` (copy literal en una sección marcada, fuera de la lista del Hub), `spans_shape_mismatch`, `theme_font_not_overridable` (una familia literal dentro de `@theme` en un `.css`), `island_raw_markers` (marcadores `data-saastro` tecleados a mano en una isla `.tsx`). Un aviso no rompe nada, pero el segundo y el tercero son errores de diseño reales: ver [§ Reglas de CSS](#reglas-de-css-y-rendimiento) y B.5.

Dos condiciones del doctor que conviene saber al escribir una sección: el marcador de la **página** (`autoWrapPages`) lo pone el plugin porque `astro.config.mjs` declara literalmente `saastroStudio({ autoWrap: true, autoWrapPages: true, ... })`; si pones esas banderas en una variable, el doctor lo da por «unknown» (código, `detectAutoWrapPagesInConfig`).

### B.2 El contrato sobre el DOM: los invariantes de `studio-contract-check.mjs`

Fichero: [`scripts/studio-contract-check.mjs`](../scripts/studio-contract-check.mjs). Compara el HTML construido (o servido por HTTP en modo crawl) con los JSON de i18n y con el manifiesto commiteado [`studio-contract.json`](../studio-contract.json). Cada fallo imprime `[invariante] página — dónde — qué pasa — fix:`. Los nombres de abajo son los literales que pasa el script a `fail(...)`; la columna «Reproducido» dice si lo ejercité con una mutación.

| Invariante | Qué exige en el HTML / el repo | Cómo se arregla | Reproducido |
|---|---|---|---|
| `cobertura` (l. 1193) | que se mida **al menos una página de contenido**; con cero, cada invariante por página sale como «NO APLICABLE» y cuenta como fallo | medir en crawl (`pnpm studio:contract:update` graba las rutas) | código |
| `crawl` (l. 1215) | toda ruta que fue crawleable sigue dando 200 + HTML | arreglar la ruta o registrar el borrado con `studio:contract:update` | código |
| `pagina-servida` (l. 1230) | cuerpo no vacío y `<title>` con texto en cada página (caso real: una portada de 0 bytes con 200, PR #50) | un componente que revienta al prerenderizar deja el fichero a cero: busca la prop que llega `undefined` | código |
| `sec-markers` (l. 1220-1270) | las secciones `data-saastro="sec:<key>"` de cada página = las del manifiesto, **sin duplicados**; una página nueva o ausente también cuenta | el componente perdió su marcador (sin `fieldPrefix`, raíz PascalCase) o el cambio es deliberado → `studio:contract:update` | **medido** (renombrar `faq`→`faq2`: AUSENTE + NO registrada) |
| `field-markers` (l. 1282) | los `data-saastro-field` de cada sección = los del manifiesto | igual que arriba | código |
| `routes` (l. 1297) | toda ruta descubierta (`src/pages` × idiomas) está en el manifiesto | página nueva deliberada → `studio:contract:update` | código |
| `verbatim` (l. 1315) | cada hoja de texto de un namespace de sección aparece **idéntica** en el HTML (precondición del click-to-edit) | renderizar la hoja sin `trim`/mayúsculas/concatenar, o sacarla del namespace | **medido** (`hero.title` + « zzz» en `en.json`, sin rebuild: `✖ [verbatim] index.html — hero.title`) |
| `img-raw` (l. 1329) | un `data-saastro="img:…"` nunca con `src` que empiece por `/cdn-cgi/image` | pasar `raw` al `<Img>` (ver `Hero.astro`: `raw={!/^https?:\/\//.test(image)}`) | código |
| `schema-scripts` (l. 1343) | los `<script type="application/saastro-schema">` parsean, `version === 1`, `fields` es array | los emite el plugin; si fallan, revisar versión del plugin | código |
| `locale-parity` (l. 1368) | cada página del idioma por defecto existe en los demás idiomas | rutas `[...locale]` con `getStaticPaths` que cubra todos | código |
| `css-tokens` (l. 1396-1405) | el CSS emitido contiene `var(--font-body)`, `var(--font-display)` y la clase `.ac` (`CSS_REQUIRES`, l. 1023) | no hardcodear `font-family`; mantener `.ac` en `global.css` | **medido** (`.ac`→`.acx` y rebuild: `ningún CSS servido contiene ".ac"`) |
| `manage-cookies` (l. 1416) | toda página con footer lleva `#manage-cookies-btn` | el pie debe renderizar el botón (`manageCookiesLabel`); reabre el banner de consentimiento | **medido** (id renombrado y rebuild: 18 páginas en rojo) |
| `cookie-policy` (l. 1486) | el enlace a la política que lleva el banner (`cookiesPolicyHref`) responde 200 | crear la página o corregir el href | **medido** (href a una ruta inexistente y rebuild: rojo en `about` y `es/about`) |
| `gen-legal` (l. 1511) | si el HTML servido emite el beacon de Gen (`<script data-gen-workspace>`), la política de cookies lleva `<div data-legal="gen-tracking"></div>` | copiar la sección de [legal-gen-tracking.md](legal-gen-tracking.md) a **todos** los idiomas, o vaciar `gen.workspaceId` | **medido** (`workspaceId` puesto y rebuild: rojo en las dos políticas) |
| `medicion-legal` (l. 1528) | si `measure.renderRatio: true` en `settings.yaml` (o el píxel `/mx/` está en el DOM), la política lleva `data-legal="render-ratio"` | [legal-render-ratio.md](legal-render-ratio.md) | **medido** (flag a `true`, sin rebuild: rojo en las dos políticas) |
| `tracking-legal` (l. 1546) | por cada proveedor encendido en `settings.tracking.*` **o en el frontmatter `tracking:` de cualquier landing**, la política lleva `data-legal="tracking-<proveedor>"`; Cloudflare Web Analytics está exento | [legal-marketing.md](legal-marketing.md); el texto lo aprueba JC. **Limitación medida: NO cubre un proveedor encendido solo por variable de build `PUBLIC_TRACKING_*`** (ver «Lo que `tracking-legal` NO ve», abajo). Otros dos casos del script: falla si hay píxeles encendidos y ninguna página lleva banner con enlace a política (`(site)`, l. 1570); y solo **avisa** («NO SE MIDIÓ») si la política enlazada no se puede escanear (enlace externo o ruta fuera del manifiesto): ahí verde **no** equivale a «declarado» | **medido** (`metaPixel` entrecomillado, sin rebuild: `✖ … data-legal="tracking-meta"` en las dos políticas) |
| `form-primitives` (l. 1588) | `form.tsx` y `field.tsx` siguen exportando los nombres del manifiesto | restaurar el export (`@saastro/forms` los resuelve por nombre) | **medido** (`export const FormMessage` → `const`: `✖ [form-primitives] … FormMessage`) |
| `architecture` (l. 1600) | el sha256 de **17 ficheros de arquitectura** = el del manifiesto (lista abajo) | cambio deliberado → `studio:contract:update` y revisar el diff | **medido** (una línea de comentario en `src/middleware.ts` → `✖ [architecture] src/middleware.ts`) |
| `i18n-consumo` (l. 1624) | toda hoja del JSON de traducciones la **lee** alguna página (registro de `src/i18n/reads.ts`) | cablear la clave o borrarla de todos los idiomas | **medido** (clave `zzmuerta.x` en ambos JSON: `✖ [i18n-consumo] (i18n) — zzmuerta.x`) |
| `marca-header` (l. 1661) | el `<header>` del site pinta `meta.siteName` del idioma, los logos de `src/assets/brand/logo-{light,dark}.svg` que existan y `nav.contact` en el botón de contacto | el Header resuelve la marca con `src/lib/brand.ts`; no cablear la marca prop a prop | código |

**Los 17 ficheros con hash** (`architectureFiles()`, l. 167 del script, y `architectureHashes` de `studio-contract.json`): `astro.config.mjs`, `saastro.template.json`, `saastrocms.config.ts`, `src/content.config.ts`, `src/env.d.ts`, `src/lib/settings.ts`, `src/middleware.ts`, `src/integrations/strip-studio-meta-middleware.ts`, `scripts/studio-check.mjs`, `scripts/studio-contract-check.mjs`, `scripts/lib/default-locale.mjs` y **todos** los `src/i18n/*.ts` (hoy `config`, `index`, `meta`, `reads`, `types`, `utils`). `src/data/settings.yaml` y `studio.config.json` quedan **fuera** a propósito (los escribe el Hub).

**Avisos que el contrato imprime en cada pasada** (no fallan): `tracking-legal` inverso (la política declara GA4 y Clarity y el site no los tiene encendidos: esperado en la plantilla limpia), `i18n-consumo` para `lp.*` y `whatsapp.*` (claves que solo se leen en rutas SSR o con número de WhatsApp: `I18N_NO_VERIFICABLE`, l. 142), y los inversos de `gen-legal` y `medicion-legal` (la política declara un tratamiento y el site no lo tiene encendido).

**Lo que `tracking-legal` NO ve** ([guia-pixeles.md](guia-pixeles.md) lo decía «NO medido con un caso»; lo medí el 3-nov-2026): con `PUBLIC_TRACKING_META_PIXEL=1234567890` en el build, el id sale en el HTML (`grep -c` sobre `dist/client/index.html` = 1 línea) y en `saastro-tracking.json` (`"source":"variable"`), y **`studio-contract-check` termina con salida 0** sin ancla `tracking-meta` en la política. El portero lee `settings.yaml` y las landings, no las variables de build. Quien enciende un píxel por variable debe declarar su proveedor en la política **a mano**.

### B.3 Otros guardianes del `studio:check`

- **Cabeceras** (`cabeceras-check`, `cabeceras-worker-check`): hay dos listas, `public/_headers` (lo que sirven los assets) y `src/lib/security-headers.ts` (lo que sirve el Worker). Se mantienen a la par. Medido: `✓ cabeceras-check — las dos listas cuadran (6 cabeceras, nombre y valor)` y `✓ cabeceras-worker-check — el Worker sirve las 6 cabeceras`. Si un diseño necesita otro origen (fuentes, mapas, vídeo), se toca en las dos.
- **CSS crítico** (`critical-css-check`): compara el estilo computado de cada página con solo el CSS crítico inline contra el CSS completo (claro y oscuro, móvil y escritorio), y exige CLS = 0 cuando el CSS completo llega tarde. Si tu diseño pone un estado en `<html>` antes de pintar (una clase, un `data-*`) y el CSS lo usa de raíz, falla hasta que lo añadas a `ALLOW_RULES`. Mecánica, depuración y qué hereda un site: [css-critico.md](css-critico.md).
- **PWA** (`pwa-check`, `pwa-build-check`): medido `pwa-check: pwa.enabled=false, 17 HTML, 0 fichero(s) de manifest` y `pwa-build-check: build con pwa.enabled=true — 17/17 HTML con link`. Detalle: [pwa.md](pwa.md).

### B.4 Tests de `pnpm test` que también pueden bloquear un diseño

- `src/blocks/blocks.test.ts` fija las **nueve** carpetas de `src/blocks/` (`NUEVE`). **Medido**: crear `src/blocks/logos/Block.astro` → `FAIL … cada carpeta tiene su Block.astro … expected [ 'compare', 'contact', 'cta', …(7) ] to deeply equal [ … (6) ]`, mientras `studio:check` sigue verde. Un bloque nuevo exige extender ese test en el mismo PR (o avisar al dueño del theme).
- `src/lib/restos-plantilla.test.ts` (ningún nombre de cliente como literal en `LocalBusinessJsonLd.astro`, PR #129), `src/lib/ids-del-theme.test.ts` (ningún id de medición del theme en `settings.yaml` ni en las traducciones, PR #133) y `src/lib/guia-pixeles.test.ts` (la guía y el catálogo de proveedores no se desincronizan).

### B.5 Cuándo se regenera el contrato

`pnpm studio:contract:update` reescribe `studio-contract.json` (build + `--update`). **No es un botón de silenciar**: se corre solo tras un cambio estructural **deliberado** (secciones, páginas, idiomas, un fichero de arquitectura) y **se revisa el diff** antes de commitear ([pipeline.md](pipeline.md#errores-caros-que-ya-nos-costaron-caro), [apply-handoff/SKILL.md](../.claude/skills/apply-handoff/SKILL.md)). Un diseño nuevo con secciones nuevas lo necesita casi siempre; un cambio de solo estilo o de copy, no. Cambiar los idiomas lo regenera ([idiomas.md](idiomas.md)). Un `.md` como este no toca ningún fichero hasheado.

### B.6 Qué exige el HTML: marcas, atributos e ids

| Marca / atributo / id | Quién lo pone | Qué la lee |
|---|---|---|
| `data-saastro="sec:<key>"` en la raíz de cada sección | el plugin, desde el default de `fieldPrefix` en el frontmatter; en islas `.tsx`, `@saastro/studio/markers` | `sec-markers`, `verbatim`, doctor |
| `data-saastro-field="<ruta>"` | el plugin, desde las expresiones del fichero que declara `fieldPrefix` | `field-markers` |
| `data-saastro="img:…"` con `src` raw | `<Img>` de `@saastro/studio/Img.astro` con `raw` | `img-raw` |
| `<script type="application/saastro-schema">` | el plugin | `schema-scripts` |
| `#manage-cookies-btn` (en el pie) | `Footer.astro` | `manage-cookies` |
| `<header>` con marca del site | `Header.astro` (o tu sustituto por la ranura) | `marca-header` |
| `<title>` con texto | `BaseLayout.astro` | `pagina-servida` |
| `<div data-legal="…">` en el markdown de la política de cookies | el texto legal (lo aprueba JC) | `gen-legal`, `medicion-legal`, `tracking-legal` |
| `main#main-content` con `tabindex="-1"` | `SiteLayout.astro` | el enlace «saltar al contenido» de `BaseLayout.astro` (no hay guardián) |

---

## C. SE HEREDA O SE ACTIVA: qué hace cada opción por defecto

| Opción | Por defecto (medido/código) | Cómo se activa | Qué obliga al activarla |
|---|---|---|---|
| **Tracking** (GA4, GTM, Google Ads, Meta, TikTok, LinkedIn, Clarity, Cloudflare Web Analytics) | todo vacío: no mide. Medido: `settings.yaml` sin ids | ids en `tracking:` de `settings.yaml` (o la tarjeta Tracking del Hub), o variables de build `PUBLIC_TRACKING_*`; las variables **ganan** y se descartan con aviso si son inválidas ([guia-pixeles.md](guia-pixeles.md)) | nombrar el proveedor en la política (`tracking-legal`), **salvo** que se encienda por variable (B.2, medido: nadie lo comprueba). Cloudflare Web Analytics carga sin consentimiento por una exención escrita en `src/lib/tracking-providers.json`, que ese mismo fichero marca **SIN VERIFICAR** contra la documentación de Cloudflare; la valoración legal es de JC |
| **WhatsApp** (widget flotante) | no se monta sin número | `PUBLIC_WHATSAPP_NUMBER` o `whatsapp.number` en los JSON (8-15 dígitos) **y** el bloque i18n `whatsapp` (`src/lib/whatsapp.ts`, `SiteLayout.astro`) | las claves `whatsapp.*` salen como «NO VERIFICADAS» en cada pasada; con número, la sección `whatsapp` entra al DOM y el contrato la trata como condicional (`SECCIONES_CONDICIONALES`) |
| **Gen** (beacon de atribución de leads) | apagado: `gen.workspaceId: ""` | `gen.workspaceId` en `settings.yaml` (lo escribe el Hub al aprovisionar) | declararlo en la política (`gen-legal`, medido) |
| **Medición render-vs-JS** (`/mx/*.gif`) | apagada: `measure.renderRatio: false` | `measure.renderRatio: true` | declararla en la política (`medicion-legal`, medido); con `sink: "log"` hay que encender la observabilidad del Worker ([`knowledge/src.md`](../knowledge/src.md)) |
| **PWA** («Instalar app») | **apagada** desde `0c66c88` (PR #139): sin `<link rel="manifest">`, `/manifest.webmanifest` da 404. Antes se heredaba el manifest del theme (nombre y color incluidos) | `pwa.enabled: true` con nombre, colores y los iconos `icon-*` propios | `pwa-check` y `pwa-build-check` ([pwa.md](pwa.md)) |
| **Idiomas** | `en` por defecto y `es` con prefijo; fuente única `src/i18n/config.ts` | editar `config.ts` + un JSON por idioma + `not-found.ts` + `saastrocms.config.ts` + textos legales ([idiomas.md](idiomas.md)); con un solo idioma no hay prefijos, selector ni `hreflang` | regenerar el contrato (cambia `config.ts`, que está hasheado) |
| **Landings con marco mínimo** | `chrome: completo` (cabecera y pie del site) | `chrome: minimo` en el frontmatter de la entrada `lp`: cabecera solo con el logo, pie legal y CTA fijo en móvil | las landings son SSR y quedan fuera del contrato; un píxel puesto en su frontmatter sí exige ancla (`tracking-legal`) |
| **CSP en modo informe** | **ya viene encendida en todo site**, no es opt-in: `Content-Security-Policy-Report-Only` en `src/lib/security-headers.ts` y en `public/_headers` | — | no bloquea nada: solo apunta en consola lo que bloquearía. La que se aplica es `frame-ancestors 'self'`. Un origen nuevo (fuentes, scripts, vídeo) saldrá como violación hasta que se añada a la lista (**código**: el valor del header, no probado en navegador) |
| **«Páginas como datos»** (`/__render`, `/__blocks.json`…) | inertes: responden 404 sin `PAGES_RENDER_SECRET` y `PAGES_SITE_ID` en el Worker | variables del Worker | ver el handoff §1b/§1c |

**Lo que se hereda sin pedirlo** (la plantilla es también la web del propio theme): está en [nuevo-site-checklist.md](nuevo-site-checklist.md): el `forms.siteId` del theme en `settings.yaml`, `site.name: "TuMarca"`, favicons y OG del theme, entradas de blog de ejemplo, textos legales plantilla que ya **declaran GA4 y Clarity**, CTAs que apuntan a `ui.saastro.io`, y `SITE_URL` (sin él, canonical, OG, hreflang y sitemap salen con el dominio de la plantilla; el build avisa). Que `studio:check` esté verde **no** significa que el site esté limpio.

---

## Reglas de CSS y rendimiento

**Tailwind v4 y tokens** (`src/styles/global.css`, fuente única):
- Los colores son variables oklch en `:root` y `.dark`, mapeadas a utilidades con `@theme inline` (`--color-primary: var(--primary)`…). El modo oscuro es una clase `.dark` en `<html>` (`@custom-variant dark (&:is(.dark *))`). Define todo token nuevo **en los dos**.
- **No rompas**: los nombres de los tokens shadcn (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-*`, `--sidebar-*`, `--radius`) porque `src/components/ui/*` los consume; `--font-body` y `--font-display` (`css-tokens`); la clase `.ac` (acento semántico del texto con marca «accent»; **nunca** apuntarla al `--accent` de shadcn, que es casi blanco: está escrito en `global.css`).
- **Fuentes por indirección**: `--font-sans: var(--font-body)` y `--font-heading: var(--font-display)` dentro de `@theme inline`. Una familia literal ahí queda inlinada en build y el editor de fuentes de Studio deja de funcionar (comentario de `global.css`, PR #17; el doctor lo avisa como `theme_font_not_overridable`). **El ejemplo de «Fonts» del [README](../README.md) (`--font-sans: 'Your Font'`) contradice esto**: manda `global.css` y el doctor.
- **Clases generadas**: Tailwind solo ve las clases escritas literales en las rutas `@source` de `global.css`: `components` y `widgets` (`.astro/.tsx/.ts`), `layouts` y `pages` (solo `.astro`) y `blocks` (`.astro/.ts`, sin `.tsx`). Nunca construyas un nombre de clase con una plantilla (`estilo.ts` lo explica; según `knowledge/src.md`: sin la línea `@source` de `blocks`, 0 reglas emitidas). Clases que solo aparezcan en otros directorios: **SIN VERIFICAR**.
- **Base UI, no Radix**: las animaciones del acordeón usan `--accordion-panel-height` (`global.css`); un keyframe con la variable vieja de Radix anima a altura 0 sin dar error.
- **Impresión**: `global.css` oculta cabecera, pie, banner de cookies y contact sheet con `@media print`.

**`.ds-home` y el DS de la portada**: `src/styles/home-ds.css` reescribe los tokens del theme en toda la página con el selector `:root:has(.ds-home)` (y `:root.dark:has(.ds-home)`), y trae Hanken Grotesk y Space Mono autoalojadas. Lo importan la portada y **los nueve `Block.astro`**, y `claseBloque()` añade siempre la clase `ds-home`. Consecuencia (código): **una página con cualquier bloque de `src/blocks/` toma los tokens del DS, no los de `global.css`**. Para un site con otra marca, o se reescribe ese fichero, o se evita `ds-home` en sus bloques; no lo descubras a media maqueta.

**Tamaño y pintado**. *Actualización:* desde el CSS crítico ([css-critico.md](css-critico.md)) cada página lleva inline solo las reglas que usa y las hojas completas van al final del `<body>`, sin JS ni `onload`; los números de abajo son de `0c66c88`, **antes** de ese cambio. Medido el 3-nov-2026 en el build de `0c66c88`: `astro.config.mjs` no fija `inlineStylesheets`; el HTML de la portada enlaza **dos hojas externas** (`button.*.css`, 129 313 bytes, 19 994 gzip; `index.*.css`, 25 149 bytes, 6 445 gzip) y lleva dos `<style>` de 58 y 59 bytes. El criterio del encargo es: **un CSS grande es aceptable; lo que no se acepta es dejar `<html>` en un estado previo al pintado que un script o una condición tardía tengan que cambiar**. El theme ya tiene **un** caso, deliberado: `ApplyColorMode.astro` es un `<script is:inline>` síncrono en `<head>` que pone o quita `.dark` en `<html>` antes de que haya `<body>` (README: «no FOUC»). No añadas más: nada de clases tipo `no-js`/`loading` en `<html>`, ni `opacity:0`/`visibility:hidden` en `html` o `body` a la espera de JS o de fuentes, ni reglas `:root:has(...)` nuevas que dependan de lo que aparezca en el body (la de `.ds-home` ya existe y obliga a recalcular el estilo de toda la página). **SIN VERIFICAR**: el efecto real en LCP/CLS de estas hojas y del script (no se ha corrido Lighthouse ni un trace); que el script llegue siempre antes del primer pintado se afirma por el código y el README, no por una medición en navegador.

**Con `ClientRouter`** (`BaseLayout.astro` lo monta), un script inline corre una vez por carga completa: lo que deba repetirse en cada navegación se engancha a `astro:page-load` (así lo hacen `GenTracking.astro` y `RenderRatio.astro`).

## Imágenes

- El adaptador de Cloudflare está con `imageService: 'passthrough'` (`astro.config.mjs`): Astro **no** redimensiona ni convierte. Entrega ya optimizadas (WebP/AVIF, tamaños razonables).
- Una imagen editable con Studio usa `<Img>` de `@saastro/studio/Img.astro` con `fieldPrefix`; si lleva marcador `img:`, el `src` sale **raw** (`img-raw`). Patrón en `src/components/Hero.astro`: `width`/`height` explícitos, `sizes`, `loading="eager"` y `fetchpriority="high"` solo en la imagen de cabecera.
- `alt` siempre; vacío (`alt=""`) solo si es decorativa. El logo sale de `src/assets/brand/logo-light.svg` y `logo-dark.svg` (`marca-header` los exige si existen).
- Favicon y PWA se generan de una sola fuente: `public/SVG/icon.svg` + `node scripts/gen-favicons.mjs` ([`knowledge/src.md`](../knowledge/src.md)). `public/og-image.png` es la del theme: cámbiala.
- Contadores que animan un número: renderiza el valor final en el HTML (no `0`) y guarda el destino en `data-count` ([`knowledge/src.md`](../knowledge/src.md)).

## Fuentes

El theme trae Geist por `@fontsource-variable/geist` (autoalojada, `global.css`). Cambiar de familia = tocar `--font-body`/`--font-display` en `:root`. Cargar desde Google Fonts es válido por decisión del owner, pero **obliga a declararlo en la política** y no hay guardián; además la CSP en modo informe (`font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`) la señalará en consola (código, no probado en navegador). No se vuelve a plantear la decisión ([`knowledge/src.md`](../knowledge/src.md#fuentes-decisión-del-owner-16-jul-2026)).

## Accesibilidad mínima

Lo que el theme ya trae (README «Accessibility» y código): enlace «saltar al contenido» (`.skip-to-content`) hacia `main#main-content` (`tabindex="-1"`), `:focus-visible` con anillo, `aria-current="page"` en navegación e idioma, HTML semántico, `scroll-padding-top` para el header fijo. Tu diseño debe conservarlo y añadir: contraste suficiente **en claro y en oscuro**, un único `<h1>` por página, jerarquía de títulos sin saltos, objetivos táctiles cómodos, y que no haya scroll horizontal en 360 px. **Ningún guardián de B mira nada de esto** (no hay axe ni Lighthouse en `scripts/` ni en `package.json`): lo verifica una persona o una pasada manual. Un caso real: el hero salió blanco sobre blanco en oscuro por usar `bg-foreground` + `text-primary-foreground` (comentario de `src/components/Hero.astro`, PR #86). El texto del enlace «Skip to content» está fijo en inglés en `BaseLayout.astro` (no pasa por i18n; **código**).

---

## Checklist de entrega (pásala antes de dar un diseño por terminado)

Ordenada de barata a cara. Cada línea es un comando o una comprobación, no una opinión.

1. `pnpm install --frozen-lockfile`.
2. `pnpm typecheck` (la CI lo corre antes que los tests).
3. `pnpm test` (incluye `blocks.test.ts`, B.4).
4. `SITE_URL=https://<dominio real> pnpm studio:check`: los ocho comandos de B.1, salida 0. Lee los **avisos**, no solo la salida.
5. `pnpm ui:check`: si sale rojo y no tocaste `src/components/ui/*`, es drift del registry ajeno a tu cambio; repórtalo, no lo tapes.
6. Si cambiaste secciones, páginas, idiomas o un fichero con hash a propósito: `pnpm studio:contract:update`, **revisa el diff** (solo debe cambiar lo que cambiaste) y commitea `studio-contract.json`. Vuelve a correr el paso 4.
7. Cada texto nuevo está en **todos** los idiomas declarados en `src/i18n/config.ts`, y cada clave la lee algún componente.
8. Ningún color a pelo; ninguna `font-family` literal en `@theme`; ningún `<form>` suelto; Header y Footer no regenerados.
9. Si activaste tracking, Gen, medición o PWA: la sección de la política en **todos** los idiomas, con el texto que apruebe JC. Si lo hiciste por variable de build, comprobarlo a mano (B.2).
10. El `git grep` de [nuevo-site-checklist.md](nuevo-site-checklist.md) no devuelve nada (ids del theme, CTAs a `ui.saastro.io`).
11. Revisión visual y manual: claro y oscuro, móvil de 360 px, teclado (Tab, saltar al contenido, foco visible), contraste, sin scroll horizontal, imágenes con `alt`. **Esto no lo cubre ningún comando.**
12. En el informe de entrega: qué comandos corriste y su salida; lo que no corriste, marcado **SIN VERIFICAR**.

---

## Qué NO hacer (errores reales, con su rastro)

| Error | Qué pasó / cómo se detecta | Dónde está escrito |
|---|---|---|
| Crear el repo con «Use this template» | repo sin historia común: nunca podrá `git merge upstream/main` | [CLAUDE.md](../CLAUDE.md), [pipeline.md](pipeline.md) |
| Regenerar Nav/Footer desde el diseño | se pierde el menú móvil, el selector de idioma y la reapertura de cookies. **Medido**: sin `#manage-cookies-btn`, `manage-cookies` falla en 18 páginas | [pipeline.md](pipeline.md), [handoff, sección «Nav / Footer»](claude-design-handoff.md) |
| `studio:contract:update` para ver verde | borra la alarma, no el fuego. **Medido**: un renombrado accidental produce AUSENTE + NO registrada, que es justo lo que ese comando taparía | [pipeline.md](pipeline.md), [SKILL.md](../.claude/skills/apply-handoff/SKILL.md) |
| Dar por buena una página vacía | una portada de 0 bytes con 200 y todas las cabeceras puestas pasó el gate (9-sep-2026); hoy lo caza `pagina-servida` | PR #50, comentario de `porQueNoEsUnaPagina` en `scripts/studio-contract-check.mjs` |
| Enlazar el banner a una política que no existe | 404 en producción en dos sites vivos; hoy lo caza `cookie-policy` (**medido**) | [handoff §4](claude-design-handoff.md#4-validation-gate--pnpm-studiocheck), comentario 8b del script |
| Encender Gen, la medición o un píxel sin tocar el texto legal | tratamiento de datos sin declarar. Lo cazan `gen-legal`, `medicion-legal` y `tracking-legal` (**medidos**), salvo por variable de build | PR #33, PR #108, [pipeline.md](pipeline.md) |
| Dejar una clave i18n que nadie lee | el texto no llega al site; el Header pintaba sus defaults mientras `nav.contact` y `meta.siteName` esperaban en el JSON | PR #69, PR #70, `i18n-consumo` (**medido**) |
| Remapear el array i18n antes de pasarlo a un bloque | autoWrap pierde el rastro y la sección deja de ser editable (`autowrap_gap`, **medido**) | [`knowledge/src.md`](../knowledge/src.md) |
| Partir un titular en un array de dos | el acceso por índice no se instrumenta: el texto principal sale no editable; usa dos props | [`knowledge/src.md`](../knowledge/src.md) |
| Pasar una colección como prop editable | Studio la expone como JSON roto y las ediciones no escriben en ningún sitio: carga la colección dentro del componente | [`knowledge/src.md`](../knowledge/src.md) |
| Contadores que sirven `0` en el HTML | rastreadores y visitantes sin JS ven un cero | [`knowledge/src.md`](../knowledge/src.md) |
| Añadir un `public/robots.txt` | el host queda fijo y se publica un sitemap ajeno; es un endpoint generado | [`knowledge/src.md`](../knowledge/src.md) |
| Importar la raíz de `@saastro/studio` en un componente | su entrada arrastra el plugin de Node y da 500 en workerd; usa los subpaths `Img.astro` y `markers` | [`knowledge/src.md`](../knowledge/src.md) |
| Poner una redirección en el middleware y suponer que corre en lo prerenderizado | con Workers Static Assets, lo prerenderizado no invoca al Worker: ni middleware ni su redirección | PR #56, PR #57, PR #63, cabecera de `public/_headers` |
| Prerenderizar una landing | el contrato se pone rojo cada vez que el cliente publica | [CLAUDE.md](../CLAUDE.md), cabecera de `src/pages/[...locale]/lp/[slug].astro` |
| Nombre de cliente o ids del theme en la plantilla | un fallback con nombre real casi se publica en un JSON-LD; los ids de medición del theme no pueden volver | PR #129, PR #133, `restos-plantilla.test.ts`, `ids-del-theme.test.ts` |
| Heredar el manifest PWA | cada descendiente salía instalable con el nombre y color del theme | PR #139, [pwa.md](pwa.md) |
| Hardcodear el puerto de dev | colisión de todos los descendientes; usa `DEV_PORT` | PR #34, comentario de `astro.config.mjs` |
| Regenerar `form.tsx` con `shadcn add form` | revienta todos los formularios (`FormControl` oficial exige un `FormItem` que `@saastro/forms` no monta) | [CLAUDE.md](../CLAUDE.md) |
| Familia literal en `@theme` | el selector de fuentes de Studio deja de funcionar | PR #17, `global.css`, `theme_font_not_overridable` |
| Contraste invertido (`bg-foreground` + `text-primary-foreground`) | blanco sobre blanco en oscuro | PR #86, `src/components/Hero.astro` |
| Meter un bloque nuevo sin tocar `blocks.test.ts` | CI roja con `studio:check` verde (**medido**) | `src/blocks/blocks.test.ts`, [handoff §1b](claude-design-handoff.md#1b-new-sections-as-blocks-srcblockstipoblockastro) |
| Un `slot="header"` condicional en una página | el hijo `{cond && <X slot="header"/>}` cuenta como contenido aunque sea `false` y deja la página sin cabecera: decide el marco en `SiteLayout` con `chrome` | comentario de `Props` en `src/layouts/SiteLayout.astro` |

---

## SIN VERIFICAR (resumen de lo que este documento no ejecutó)

- Rendimiento real: LCP/CLS del CSS actual y del script de modo oscuro; que `ApplyColorMode` llegue antes del primer pintado en un navegador.
- Invariantes del contrato no reproducidos con una mutación: `cobertura`, `crawl`, `pagina-servida`, `field-markers`, `routes`, `img-raw`, `schema-scripts`, `locale-parity`, `marca-header`. Y el estado `no_schema_no_i18n` del doctor; `unreachable_root` solo se midió en el recuento, no en el build.
- Clases Tailwind situadas fuera de las rutas `@source`; si una carpeta nueva bajo `src/` las necesita, añade su `@source`.
- El efecto de la CSP en modo informe sobre un origen nuevo (se deduce del valor del header, no se probó en un navegador).
- Todo lo que depende del Hub (publicar, la lista de lo que reescribe, cómo trata un bloque con props inválidas): se cita del handoff, que ya lo marca como no verificado en parte.
- Los pasos de los paneles de proveedores de medición: ver el aviso de [guia-pixeles.md](guia-pixeles.md).
- `CLAUDE.md` dice «Astro 6» y enumera «hoy: `hero`, `products`, `about`, `nav`, `footer`», y `claude-design-handoff.md §1.2` sitúa los bloques en `src/components/ui/blocks/`: lo medido es Astro 7.4.2 (`package.json`), las secciones de `studio-contract.json` (`about`, `compare`, `contact`, `faq`, `features`, `final`, `footer`, `hero`, `how`, `nav`, `problem`, `proof`, `toggle_theme`) y que el CLI escribe en `src/components/blocks/` (`knowledge/src.md`). Esos tres textos están desactualizados; este documento no los corrige.

## Dónde mirar

[CLAUDE.md](../CLAUDE.md) (contrato del theme) · [README.md](../README.md) · [claude-design-handoff.md](claude-design-handoff.md) · [pipeline.md](pipeline.md) · [nuevo-site-checklist.md](nuevo-site-checklist.md) · [guia-pixeles.md](guia-pixeles.md) · [legal-marketing.md](legal-marketing.md) · [legal-gen-tracking.md](legal-gen-tracking.md) · [legal-render-ratio.md](legal-render-ratio.md) · [idiomas.md](idiomas.md) · [pwa.md](pwa.md) · [`knowledge/src.md`](../knowledge/src.md) · [apply-handoff/SKILL.md](../.claude/skills/apply-handoff/SKILL.md) · [`scripts/studio-contract-check.mjs`](../scripts/studio-contract-check.mjs) · [`studio-contract.json`](../studio-contract.json).
