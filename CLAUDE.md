# saastro-theme — plantilla base lista para Studio

Plantilla canónica de los sites cliente: Astro 6 + React 19 + Tailwind 4,
**pre-instrumentada para Saastro Studio** (el editor vive en el Hub, no aquí).
Repo aparte, fuera del workspace de 3 repos de `~/SAASTRO`.

**Un site nuevo se crea con `pnpm scaffold client` desde el Hub**, nunca con
«Use this template» de GitHub: eso da un repo **sin historia común**, incapaz de
`git merge upstream/main`, y cada fix del theme habría que retroportarlo a mano.
El scaffold clona este repo con su historia y su remote `upstream`.

La plantilla ya trae lo que buscan los detectores del Hub, así que **Setup
valida en verde sin trabajo de instrumentación**. `enlolab/dorjoiers` es un
descendiente en producción: úsalo de referencia para dudas de cableado. Migrado
de `@saastro/cms` a `@saastro/studio` en agosto de 2026 (detalle en la ficha).


## Studio instrumentation (the contract)

| Piece | File |
|---|---|
| `@saastro/studio` Vite plugin (`autoWrap` + `autoWrapPages`) | `astro.config.mjs` |
| `data-saastro="sec:<key>"` markers on section roots | auto-injected by the plugin (≥0.10.1) from the `fieldPrefix` destructuring default; islands spread `@saastro/studio/markers` helpers |
| Global sections (nav/footer) | `studio.config.json` |
| Collections + i18n shape (parsed by the Hub) | `saastrocms.config.ts` (interface inlined — no `@saastro/cms` dep) |
| Editable content | `src/i18n/translations/{en,es}.json` |

**Editable = lo que está en i18n.** Una sección es editable cuando emite
`data-saastro="sec:<key>"` en su raíz —construido desde el prop `fieldPrefix`—
y `<key>` es un namespace de primer nivel en el JSON de traducciones. Hoy:
`hero`, `products`, `about`, `nav`, `footer`. No queda ninguna sección hardcodeada.

> **Los marcadores no se escriben a mano.** Desde `@saastro/studio` 0.10.1 el
> plugin inyecta solos el marcador raíz y los de campo en las secciones `.astro`
> cuyo frontmatter declara `fieldPrefix` — el valor por defecto vive en el
> destructuring (`fieldPrefix = 'hero'`) y el plugin hace el resto. Las islas
> React **nunca** se instrumentan solas: extienden los helpers del subpath
> `@saastro/studio/markers`, y el doctor avisa (`island_raw_markers`) si ve
> atributos tecleados a mano. Única excepción: `ToggleTheme.astro`, que no tiene
> `fieldPrefix` y lleva el suyo fijo a propósito.

## Contract check over the BUILT DOM — `studio-contract.json`

`pnpm studio:check` es el veredicto completo: doctor sobre el fuente →
`astro build` → **contract check sobre `dist/`**. Compara el HTML construido
contra los JSON de i18n y contra `studio-contract.json` (manifiesto commiteado
en la raíz): marcadores por página, el texto i18n literal en el HTML —
precondición del click-to-edit—, imágenes editables, schemas, paridad de
locales, tokens CSS emitidos, el botón de cookies, el enlace a la política, la
**declaración legal del beacon de Gen** y hashes de los ficheros de arquitectura.

The manifest is **never regenerated automatically**: after a deliberate
structural/architecture change run `pnpm studio:contract:update` and commit the
diff. A red check = the built DOM diverged from the recorded contract; each
failure says which invariant, which page/section/field, and what to do.

## Pipeline de un proyecto nuevo

La ruta completa está en **`docs/pipeline.md`**. En corto: `pnpm scaffold client`
desde el Hub (clona con historia, parametriza identidad/locales/colecciones y
**solo commitea si `studio:check` está verde**) → brief y diseño en Claude Design
→ aplicar el handoff con la skill `apply-handoff` → conectar en el Hub.


## Claude Design handoff

Cuando llega un diseño de **Claude Design** (`.dc.html` o el MCP `claude_design`):
sigue `docs/claude-design-handoff.md`, o invoca la skill **`apply-handoff`**, que
lo conduce como un bucle. Regla de oro: **portar, nunca pegar**.

- **Nav y Footer no se regeneran.** Llevan comportamiento —menú móvil, selector
  de idioma, reapertura de cookies, contact sheet—: coge el aspecto nuevo, deja
  el cableado.
- **Nombres**: `key = fieldPrefix = namespace i18n` de primer nivel, y el
  marcador es `data-saastro="sec:<key>"`. No hay lista canónica: las secciones
  son por proyecto y `pnpm studio:check` valida la coherencia interna
  (marcador ↔ i18n ↔ página), no la pertenencia a una lista.
- **Tokens, fuente única**: `src/styles/global.css`, variables oklch con
  `@theme inline`. La paleta base es neutra: una marca es dar croma a
  `--primary`/`--accent`, jamás un hex suelto.

Sobre las fuentes hay una **decisión del owner tomada** (16-jul-2026) con
consecuencias vinculantes para la política de privacidad: está en
`knowledge/src.md`. No se vuelve a plantear.

## Las primitivas se BAJAN del registry — `ui:check` / `ui:sync`

Viven en **`saastro-ui`** (26, todas sobre **Base UI**; Radix salió del
`package.json` en agosto). Este theme es **un consumidor más**: si corriges una
primitiva aquí, súbela al registry o se pierde en el próximo sync.

```bash
pnpm ui:check   # ¿alguna difiere? Solo lee. Sale 1 si hay drift (--diff enseña qué)
pnpm ui:sync    # tráelas — escribe y NO commitea (--dry para ensayar)
```

**`ui:sync` no commitea a propósito**: en copy-in el `git diff` ES la revisión.
Un `--overwrite` a ciegas borra los ajustes locales en silencio.

`command` es el único que vive solo aquí (`cmdk` arrastra cuatro paquetes de
Radix). `ui:check` lo marca «solo local»: es inventario, no error.

Por qué copy-in y nunca un paquete npm, en `knowledge/src.md`.

### `form.tsx` NO se regenera con `shadcn add form`

`src/components/ui/form.tsx` está escrito a mano **a propósito**. El `FormControl`
oficial de shadcn llama a `useFormField()` y exige un `FormItem` como ancestro;
`@saastro/forms` no monta ese `FormItem`, así que el oficial revienta en runtime.
El nuestro fusiona las props con `useRender` y no depende de ese contexto.

Regenerarlo lo pisa y rompe todos los formularios del sitio: si el CLI ofrece
sobrescribirlo (o le pasas `--overwrite`), di que no. El aviso está también en la
cabecera del propio fichero; si lo pisas, recupéralo de git.

## Bloques de `ui.saastro.io` — OBJETIVO, hoy sin implementar

Los **primitivos ya se consumen** (arriba). **Los bloques no: este repo no
consume ninguno.** Las 14 secciones están escritas a mano en `src/components/`,
y no existen ni `src/components/ui/blocks/` ni `src/components/blocks/`.

El objetivo es el modelo de tres capas —bloque pristine del registry, adaptador
con la instrumentación, contenido en i18n—, descrito en `knowledge/src.md`.

⚠️ No migres una sección «copiando el bloque encima». Los bloques del registry
no llevan i18n ni marcador **a propósito**: eso lo pone el adaptador. A lo bruto,
el site pierde las claves i18n y el marcador que enumera el overlay del Hub.


## i18n routing

Default locale (`en`) renders at the root; non-default (`es`) is prefixed via `src/pages/[locale]/*`. `src/middleware.ts` only resolves the locale into `Astro.locals` (no auth, no stega). The native `i18n` block in `astro.config.mjs` uses `routing: 'manual'` — purely a detection signal; Astro does not own routing here.

## Landings (`/lp/<slug>`) — páginas de campaña por colección

Una entrada markdown en la colección **`lp`** = una landing en `/lp/<slug>`. La
entrada elige `layout` de un enum cerrado (`hero-form` | `largo`) y su `form`
(un slug de formulario del Hub que pinta `<HubForm>`). Una landing nueva es un
`.md` que escribe el cliente en Hub → Colecciones: sin código y sin deploy.

Las cuatro reglas duras:

- **SSR, nunca prerenderizadas** (`export const prerender = false`). Si se
  prerenderizan, el contract-check se pone rojo cada vez que el cliente publica.
- **Fuera del sitemap y sin índice `/lp/`**, a propósito: a una landing de pago
  se llega por el anuncio, no orgánicamente. No deben ser enumerables.
- **Borrador o slug desconocido → redirect a home**, nunca un 404 en blanco.
- **No son editables con Studio**: los componentes de `src/components/lp/` no
  llevan `fieldPrefix` ni `data-saastro`. El contenido se edita en Colecciones;
  solo el chrome (`lp.*`) es i18n.

El porqué de cada una, y la nota de merge para descendientes que ya tengan sus
propias colecciones, en `knowledge/src.md`.

## Comandos y deploy

- pnpm. `pnpm dev` (4930) · `pnpm build` · `pnpm preview` · `pnpm studio:check`.
- SSR en Cloudflare **Workers** (`output: 'server'`). El build emite
  `dist/server/wrangler.json` y el deploy es
  `wrangler deploy --config dist/server/wrangler.json`.
- **El deploy lo cablea el Hub, no un workflow de este repo.** Al crear el site,
  el Hub renombra `wrangler.jsonc` y conecta el repo a Workers Builds con sus
  propias credenciales: CF construye y despliega en cada push **sin un solo
  token aquí**. Por eso no hay `deploy.yml` — lo tendría que llevar cada repo
  cliente. CI solo corre `pnpm studio:check`, que no necesita secretos.


## SEO + Studio: las trampas que hereda cada site

Ocho trampas de plantilla que **todo site derivado hereda si no se arreglan
aquí** — `SITE_URL` y el canonical, los dos JSON-LD, los contadores que sirven
`0`, el `robots.txt` generado, el import que revienta en workerd, las secciones
de colección y los favicons. Están en `knowledge/src.md`, que es el contrato:
son lo primero que hay que leer al montar un site nuevo.
## Dónde buscar

| carpeta | sección | ficha |
|---|---|---|
| src/ | src | `knowledge/src.snap.md` (+ `src.md`, contrato) |
| docs/ | docs | `knowledge/docs.snap.md` |
| scripts/ | scripts | `knowledge/scripts.snap.md` |

**De quién dependo**
- dev: @saastro/ui (`~/SAASTRO/saastro-ui`) — las primitivas se BAJAN de su registry con `ui:check`/`ui:sync`, modelo copy-in · @saastro/forms (`~/SAASTRO/saastro-forms`) · @saastro/studio
- ops: nadie — esto es la plantilla base, no un producto operado; los sites que nacen de ella se operan vía hub/gen.

**Quién depende de mí**: los nueve sites de ENLOLAB nacen de este template
(pipeline en el propio CLAUDE.md). `knowledge/src.md` es el contrato que un
agente lee antes de derivar o retocar un site.

El detalle de símbolos está en el snap, no aquí. El contexto vivo se pide
con `office_context`/`office_search`. El mapa del ecosistema lo tiene el
jefe (`office_brief`).

## saastro-office
- `office_init` con project `saastro-theme` al empezar la sesión.
- `office_state` con done/next/needs antes de parar. El hook de Stop la exige.
- Lo que no puedas decidir: `office_decide` (`guarded` si es dinero, legal, destructivo o producción).
- Encargos a otro proyecto: `SendMessage` a su sesión, no por la office.
