# src — el template del que nacen los sites

> **Esta ficha es CONTRATO.** La leen agentes de otros repos —los nueve sites de
> ENLOLAB y quien monte uno nuevo— antes de derivar o retocar nada. Si cambia el
> contrato de Studio, el pipeline o el modelo de bloques, cambia esta ficha en el
> mismo commit.

## Qué es

`saastro-theme` es la **plantilla base lista para Studio**: Astro 6 sobre
Cloudflare Workers, con la instrumentación que el Studio del Hub necesita para
editar visualmente. El contrato se verifica **sobre el DOM construido**
(`studio-contract.json`, comprobado en build): no es documentación, es un gate.

Un site nace con `pnpm scaffold client` desde el Hub y hereda este contrato
entero. Migrado de `@saastro/cms` a `@saastro/studio` en agosto de 2026.

## Lo que se promete

- **El contrato de Studio se cumple en el DOM construido.** Romperlo rompe la
  edición visual de TODOS los sites derivados.
- **Las primitivas no se editan a mano**: se bajan del registry de `saastro-ui`
  con `pnpm ui:check` / `pnpm ui:sync`. Una primitiva tocada en local se pierde
  en el siguiente sync; la corrección se sube al registry.
- **Los formularios son de `@saastro/forms`**, y las landings (`/lp/<slug>`) van
  respaldadas por colección: el contenido de campaña se edita, no se programa.

## Por qué copy-in y no un paquete npm

Tailwind no escanea `node_modules`, así que las clases que viven dentro de un
paquete no entran en el CSS generado. Está intentado varias veces y no funciona.
No se vuelve a proponer.

## El modelo de tres capas — estrenado en `about` (27-ago-2026)

**Piloto hecho en `AboutContent`**; el resto de secciones siguen escritas a mano
y se migran una a una con este patrón.

1. **Bloque** — `src/components/blocks/<name>.astro`, byte a byte del registry.
   Sin i18n y sin `data-saastro`. Se actualiza con `shadcn add`. **Solo se edita
   aguas arriba, en `saastro-ui`**, y vuelve por el registry: nunca se cambia la
   copia de un site.
2. **Adaptador** — el componente de sección de siempre (`AboutContent.astro`),
   que pasa a ser fino. Es el único pegamento propio: mapea el objeto i18n a los props tipados del
   bloque y elige hidratación (estático = SSR y cero JS; interactivo =
   `client:visible`). **La «estructura» vive aquí**: cambiar de bloque o de
   layout se hace en el adaptador, jamás en el bloque.
3. **Contenido** — `src/i18n/translations/{en,es}.json`. Nombre del namespace =
   clave de sección = `fieldPrefix`.

**El invariante**: una edición de contenido toca **solo** el JSON de
traducciones —bloque y adaptador intactos, y todos los idiomas gratis—. Una
edición estructural toca el adaptador. El fichero del bloque no cambia nunca
desde dentro de este repo.

El marcador `data-saastro` **no lo escribe el adaptador**: lo inyecta en build el
plugin de `@saastro/studio` a partir del `fieldPrefix`. El adaptador solo tiene
que declarar ese prop.

## Las trampas que hereda cada site

Son de plantilla: **todo descendiente las hereda si no se arreglan aquí**.

- **`site` / canonical (CRITICAL).** `astro.config.mjs` reads the canonical domain from
  the **`SITE_URL`** build env var, falling back to the template domain. Every project MUST
  set `SITE_URL` (Cloudflare Workers Builds env var) to its real domain — otherwise
  `<link rel="canonical">`, OG/Twitter URLs, the sitemap and hreflang all point at
  `saastro-theme.pages.dev` and Google indexes the wrong host. The build prints a warning
  when `SITE_URL` is unset. (TODO Hub: set `SITE_URL` automatically when a custom domain is
  connected.)
- **`LocalBusinessJsonLd.astro`** emits `Store`/`LocalBusiness` structured data from i18n
  (`contact` + `visitanos` + `meta`). It renders **nothing** until the site adds a
  `contact` namespace with at least `addressLine1`. For a local-business site, add:
  `contact.{addressLine1, addressLine2 ("CP Localidad (Provincia)"), phoneHref, instagramUrl,
  facebookUrl, directionsUrl}` + `visitanos.hours[]` ({days, time}) and the schema fills in
  (address, hours, sameAs) automatically. Critical for local SEO rich results.
- **Baseline site schema — `SiteJsonLd.astro` (wired in `BaseLayout`).** Emits a `WebSite`
  entity always, plus a primary entity (`Person` | `Organization` | `ProfessionalService`)
  when `seo.schemaType` is set in `src/data/settings.yaml`. **New site onboarding: fill the
  `seo` block** (`schemaType`, `email`, `jobTitle` for Person, `sameAs[]` — profiles + owned
  domains). Left empty, the site emits only `WebSite` (no rich-result identity). This is
  separate from `LocalBusinessJsonLd` (NAP/hours) above — a site can use either, both, or
  just the default WebSite.
- **Counters / count-up stats must render the FINAL value in SSR, not `0`.** A common bespoke
  pattern animates a number from 0 on scroll. If the served HTML hardcodes `>0<` and only JS
  fills the real value, crawlers and no-JS users see `0` — a terrible signal on a "trajectory"
  stat. Render `{value}{suffix}` as the node's text content and keep the target in a
  `data-count` attribute for the animation to read; the count-up still works, the real number
  is in the DOM. (Fixed in `enlolab-site` Services.astro.)
- **`robots.txt` is a generated endpoint (`src/pages/robots.txt.ts`), NOT a static file.** It
  derives the `Sitemap:` line from `Astro.site` (= `SITE_URL`) so it always matches the
  deployed domain. **Do NOT add a `public/robots.txt`** — a static file hardcodes the host and
  silently ships the wrong sitemap URL to descendant sites (the original template bug:
  `saastro-theme.pages.dev` leaked into a live site).
- **NEVER import `@saastro/studio` (package ROOT) in a runtime component.** Its main entry
  bundles the Node Vite plugin (references `__filename`) and **500s under the workerd SSR
  runtime**. Import only the SSR-safe subpaths: `@saastro/studio/Img.astro`, and — for the
  editable-marker helpers in islands — **`@saastro/studio/markers`** (≥0.10.1:
  `editableSection`/`editableField`/`editableSlot`/`editableImage`/`editableArrayItem`).
  Don't inline copies of the helpers anymore — the subpath is workerd-safe and the doctor
  recognizes the import.
- **Collection-backed sections: load the collection INSIDE the component, never pass it as
  an editable `items` prop.** If a section receives `items` as a prop, autoWrap exposes it as
  a Studio field (often `kind: json` for unions → a broken raw-JSON editor + "NEEDS CONFIG"),
  and any inline edit is a dead write (the data lives in the collection, not i18n). Do
  `const items = await getCollection('x')` in the `.astro` frontmatter; keep only the section
  header (`eyebrow`/`title`) as i18n props. Edit the entries in Hub → Collections.
- **`output: 'server'` + locale routes** use the rest-spread `src/pages/[...locale]/` dir.
  The Hub's Studio publish resolves both `[locale]/` and `[...locale]/` (fixed), but keep the
  convention consistent so `section_props_update` page paths resolve.
- **Favicons + PWA icons are generated from ONE source.** Drop a compact brand mark (a
  square-ish SVG — an icon, not a wordmark) at `public/SVG/icon.svg` and run
  `node scripts/gen-favicons.mjs`. It writes the whole set — `favicon.svg`/`.ico`,
  `favicon-16/32/48`, `apple-touch-icon`, and PWA `icon-192/512` (+ `-maskable`) — all already
  wired in `src/head/Favicons.astro` + `public/manifest.json`. **New site onboarding: replace
  `icon.svg` with the client's mark and re-run**, or the site ships the template's default icon
  (same class of "born with the template's identity" trap as `SITE_URL`). sharp is resolved
  from the pnpm store, so no extra dep.

## Detalle de las landings

- **SSR y nunca prerenderizadas**: una ruta de colección prerenderizada pone el
  contract-check en rojo cada vez que el cliente publica una entrada, porque el
  contrato ve una ruta de la que no tiene registro. Con SSR, publicar una
  landing no toca el contrato. Sale gratis: el site entero es `output: 'server'`.
- **Fuera del sitemap y sin índice `/lp/`**: `@astrojs/sitemap` no enumera
  páginas SSR, y a una landing de pago se llega por el anuncio. Que no sean
  enumerables es deliberado.
- **Merge aguas abajo**: un descendiente que ya tenga colecciones propias
  resuelve UNA línea en `git merge upstream/main` —fusionar las dos listas del
  `export const collections` de `src/content.config.ts`— y añadir bloques al mapa
  de `saastrocms.config.ts`. El scaffold ancla textualmente esos literales:
  scaffold y theme se tocan a la vez.

## Fuentes: decisión del owner (16-jul-2026)

Los sites cliente **cargan Google Fonts desde el CDN de Google; no las
autoalojan**. Este theme sí empaqueta Geist, pero un rediseño que tire de
`fonts.googleapis.com` está siguiendo una decisión explícita del owner, no
cometiendo un error que haya que «arreglar».

Dos consecuencias que **sí** son vinculantes:

1. La política de cookies del site debe **declarar la transferencia**: el
   navegador del visitante manda su IP a Google en cada carga, antes de que
   exista el banner de consentimiento. El problema real es la carga de terceros
   no declarada, no el origen de la fuente.
2. No gastes una ronda en re-plantearlo: el compromiso —comodidad contra una
   cuestión de transferencia internacional con jurisprudencia detrás— se le puso
   al owner y está decidido. Se revisa solo si él lo pide.

### Lo que enseñó el piloto

**Dónde caen los bloques lo decide el CLI, no nosotros.** `shadcn add` los
escribe en `src/components/blocks/` (el `target` del item en el registry). La
versión anterior de esta ficha decía `src/components/ui/blocks/` y era falso:
manda el CLI. El adaptador es el componente de sección que ya existía.

**El bloque se arregla aguas arriba, y funciona.** `features-01` exigía `icon`
y caía a `sparkles` si faltaba; los valores de una empresa no llevan icono. En
vez de tocar la copia local se hizo `icon` opcional en `saastro-ui`
(PR #24), se desplegó el registry y `shadcn add` lo bajó ya corregido. Ése es
el ciclo completo del modelo, y es la razón de que el bloque no se edite aquí.

**⚠️ No remapees el array de i18n antes de pasarlo al bloque.** Es la trampa
cara: si el adaptador hace `const features = valuesItems.map(...)` y pasa
`features`, **autoWrap pierde el rastro de los items** y esa sección deja de
ser editable con click-to-edit en Studio. Hay que pasar el array **directo**
(`features={valuesItems}`), y para eso los props del bloque tienen que encajar
con la forma del i18n — si no encajan, se ajusta el bloque en el registry, no
el adaptador. Lo caza `pnpm studio:check` con `[autowrap_gap]`, pero solo si se
ejecuta: no da la cara en el build.

**No todo tiene que venir del registry.** La intro y la misión de `about` siguen
siendo markup propio porque ningún bloque las cubre. El modelo no exige que todo
sea del registry: exige que lo que venga del registry no se toque.
