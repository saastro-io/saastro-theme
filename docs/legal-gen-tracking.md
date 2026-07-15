# Declaración legal del beacon de Gen (`data-legal="gen-tracking"`)

Texto canónico para la política de cookies de un site con **SAASTRO Gen**
activo. Cópialo tal cual al markdown de la política — **en todos los locales** —
cuando enciendas `settings.gen.workspaceId`.

**Por qué existe este fichero.** Encender el flag de Gen añade un tratamiento de
datos nuevo (beacon de vista de página + visitor id) sin que nada obligue a
tocar el texto legal: la política se queda diciendo que no hay seguimiento. El
invariante **`gen-legal`** de `pnpm studio:check` cierra ese hueco — si el DOM
servido emite el beacon y la política no lo declara, el gate se pone rojo y te
manda aquí.

El ancla es `<div data-legal="gen-tracking"></div>`: un marcador explícito,
estable y **independiente del idioma** (un heading por texto sería frágil — los
sites son es/en/fr). Va **dentro** del markdown de la política; markdown admite
HTML. El checker consulta el DOM, así que un texto **comentado no cuenta** — y
es lo correcto: un comentario no declara nada al visitante.

> El texto vive aquí y **no** en `src/content/legal/*/cookies.md` comentado: el
> theme no tiene Gen activo, así que su propia política no debe declararlo
> (sería falso, y el invariante lo avisaría). Un bloque comentado en el
> `cookies.md` del theme además viajaría a cada descendiente y se serviría como
> peso muerto en cada carga de la política.

## Qué hace realmente el beacon (auditado sobre el código)

Auditado en `src/components/GenTracking.astro` (emisor) y en
`saastro-gen/src/server/routes/collect.ts` + `db/schema.ts` (receptor).

| | |
|---|---|
| **Cookies** | **Ninguna.** No se escribe ni se lee ninguna cookie; la respuesta de `/collect` no trae `Set-Cookie` y la petición va con `credentials: 'omit'`. |
| **Almacenamiento en el dispositivo** | `sessionStorage['gen-visitor-id']` — un UUID v4 aleatorio. Vive **mientras dure la pestaña/sesión** del navegador; al cerrarla desaparece. No hay identificador persistente entre sesiones. |
| **Qué se envía en cada vista** | A `https://gen.saastro.io/collect`: id de workspace, vertical, el visitor id, tipo (`page_view`), URL completa, ruta, título de la página, referrer, parámetros UTM (`source`, `medium`, `campaign`, `term`, `content`) y marca de tiempo. |
| **Dirección IP** | Como en cualquier petición HTTP, el servidor la recibe. Gen la usa **solo** para limitar la frecuencia de peticiones: vive ≤60 s en una clave de caché y **no se guarda en la base de datos**. |
| **NO se recoge** | User-agent, geolocalización, huella de dispositivo (*fingerprinting*). Nada de eso se lee ni se almacena. |
| **Formularios** | El visitor id se inyecta como campo oculto `gen_visitor_id`. Al enviar un formulario, Gen **vincula las vistas previas de ese visitante al contacto identificado** — ese es el momento en que el histórico anónimo pasa a ser dato personal. |
| **Finalidad** | Atribución de leads (primer/último contacto) y embudo/coste por lead por canal. |
| **Destinatario** | SAASTRO Gen (`gen.saastro.io`). |

⚠️ **Conservación — leer antes de publicar.** Hoy, en el código de Gen, las
vistas de página de visitantes que **nunca convierten** (`entity_type = NULL`)
**no las borra ningún proceso**: el purgado programado filtra por
`entity_type = 'lead'`, y la retención por workspace está **desactivada por
defecto**. En la práctica esos eventos se conservan indefinidamente. No pongas
un plazo en la política que el sistema no cumple: decide el plazo, configúralo
en Gen, y **entonces** escríbelo.

## El texto — español

````markdown
## Atribución de leads (SAASTRO Gen)

<div data-legal="gen-tracking"></div>

Este sitio utiliza **SAASTRO Gen**, un servicio de atribución de leads, para
saber por qué canal nos llegan las solicitudes de contacto.

**No utiliza cookies.** En su lugar guarda en el almacenamiento de sesión de tu
navegador (`sessionStorage`) un identificador aleatorio y anónimo
(`gen-visitor-id`) que **se borra al cerrar la pestaña**. No permite
identificarte entre sesiones ni entre dispositivos.

En cada página que visitas se envía a `gen.saastro.io` la siguiente información:

- la dirección de la página, su ruta y su título;
- la página de procedencia (*referrer*), si la hay;
- los parámetros de campaña de la URL (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_term`, `utm_content`);
- el identificador anónimo de sesión y la fecha y hora.

Como en cualquier conexión a internet, el servidor recibe tu **dirección IP**.
Se utiliza únicamente para limitar la frecuencia de peticiones (protección
antiabuso), se conserva menos de un minuto y **no se almacena en la base de
datos** ni se asocia a tu navegación.

**No** recogemos por esta vía tu user-agent, tu ubicación geográfica ni ninguna
huella de dispositivo.

**Si envías un formulario**, ese identificador anónimo se adjunta al envío. Eso
nos permite saber por qué canal llegaste, y a partir de ese momento las páginas
que habías visitado quedan vinculadas a los datos de contacto que nos facilitas.

- **Responsable del tratamiento:** [PENDIENTE: razón social, NIF, dirección y
  correo de contacto del titular del sitio]
- **Base jurídica:** [PENDIENTE: decidir consentimiento o interés legítimo —
  depende del modo de consentimiento configurado; ver nota abajo]
- **Plazo de conservación:** [PENDIENTE: fijar el plazo y configurarlo en Gen —
  ver la advertencia de conservación en docs/legal-gen-tracking.md]
- **Transferencias internacionales:** [PENDIENTE: confirmar dónde se procesan
  los datos y con qué garantías]
````

## El texto — inglés

````markdown
## Lead attribution (SAASTRO Gen)

<div data-legal="gen-tracking"></div>

This site uses **SAASTRO Gen**, a lead-attribution service, to understand which
channel our enquiries come from.

**It does not use cookies.** Instead it stores a random, anonymous identifier
(`gen-visitor-id`) in your browser's session storage, which **is deleted when
you close the tab**. It cannot identify you across sessions or devices.

On each page you visit, the following is sent to `gen.saastro.io`:

- the page address, path and title;
- the referring page, if any;
- the campaign parameters in the URL (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_term`, `utm_content`);
- the anonymous session identifier and a timestamp.

As with any internet connection, the server receives your **IP address**. It is
used solely to rate-limit requests (abuse protection), is kept for less than a
minute and is **not stored in the database** or linked to your browsing.

We do **not** collect your user-agent, your geographic location or any device
fingerprint through this mechanism.

**If you submit a form**, that anonymous identifier is attached to the
submission. This tells us which channel you came from, and from that point the
pages you had visited become linked to the contact details you provide.

- **Data controller:** [PENDIENTE: legal name, tax id, address and contact
  email of the site owner]
- **Legal basis:** [PENDIENTE: decide consent or legitimate interest — depends
  on the configured consent mode; see note below]
- **Retention period:** [PENDIENTE: set the period and configure it in Gen —
  see the retention warning in docs/legal-gen-tracking.md]
- **International transfers:** [PENDIENTE: confirm where data is processed and
  under which safeguards]
````

## Los huecos `[PENDIENTE: …]` — por qué siguen abiertos

Ninguno se puede rellenar leyendo el código; los cuatro son decisiones del
titular del site, no hechos del repo. Rellénalos **antes** de publicar.

| Hueco | Por qué no lo decide el código |
|---|---|
| Responsable del tratamiento | Es el titular del site, distinto en cada descendiente del theme. |
| Base jurídica | Es una calificación jurídica, no una propiedad del código. Depende además del modo: `settings.gen.consent: "none"` (por defecto) **dispara el beacon inmediatamente, antes de que el visitante toque el banner**; `"required"` espera a `localStorage['gen-consent'] === 'granted'`. Que guardar un id en `sessionStorage` esté o no exento de consentimiento (art. 22.2 LSSI / ePrivacy) es un juicio legal — el comentario de `GenTracking.astro` lo da por hecho («cookieless → no banner needed»), pero eso es una opinión, no un hecho del código. |
| Plazo de conservación | Hoy Gen **no borra** las vistas de visitantes no convertidos (ver advertencia arriba). Escribir un plazo sin configurarlo sería declarar algo falso. |
| Transferencias internacionales | El código no fija región de procesamiento. |

## Al activar Gen — checklist

1. Rellena `settings.gen.workspaceId` (o deja que lo escriba Hub → Site → Settings).
2. Copia la sección de arriba al `cookies.md` de **cada locale**, con su ancla.
3. Rellena los cuatro `[PENDIENTE: …]`.
4. `pnpm studio:check` → verde.
</content>
