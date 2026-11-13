# Guía de píxeles: dónde conseguir cada id y dónde se pone

Para quien monta un site y necesita el id de un proveedor de medición o anuncios.
Cada proveedor es una clave de `tracking:` en `src/data/settings.yaml` (o un campo
de la tarjeta **Tracking** del Hub, que escribe esa misma clave en un site ya creado; o
una variable de build `PUBLIC_TRACKING_*`, ver «Variables de build»). El catálogo con
el formato exacto de cada id y las cookies que deja es
`src/lib/tracking-providers.json`.

> **Qué está verificado y qué no.** Los pasos de **GA4** y el **id de Clarity** los
> recorrimos en los paneles reales el 2-nov-2026. Los de Meta, TikTok, LinkedIn,
> Google Ads y GTM están escritos **de memoria y marcados SIN VERIFICAR**: los
> paneles cambian de sitio con frecuencia, así que cada uno lleva el enlace a la
> documentación oficial. Si un paso no coincide con lo que ves, manda la
> documentación, no esta guía.

## Antes de nada: tres reglas

1. **Un id vacío = apagado.** Nada se carga sin id.
2. **Nada carga sin consentimiento.** Los ids se ponen y el banner decide (ver la
   categoría de cada proveedor abajo). Hoy **no hay ningún proveedor exento**:
   Cloudflare Web Analytics lo estaba por una decisión del theme que nunca se verificó y
   se retiró el 13-nov-2026. Solo se admite una exención si lo está por ley, y la decide JC.
3. **Encender un proveedor exige nombrarlo en la política de cookies**
   (ancla `data-legal="tracking-<proveedor>"`, ver `docs/legal-marketing.md`), también si solo lo enciende una landing. Si
   no, `pnpm studio:check` se pone rojo. El texto lo aprueba el responsable del site.
   (El mecanismo de exención del catálogo —`category: "none"` más `exemptReason`— sigue
   existiendo, pero está vacío y un test impide añadir uno sin cambiarlo a propósito.)

**Un id con formato inválido no se inyecta nunca**: se descarta con un aviso en el
build. Un id **numérico sin comillas** en el YAML (`metaPixel: 1234567890`) también
se descarta: entrecomíllalo.

## Dónde se pone

- **En el Hub:** Site → Settings → tarjeta **Tracking** (escribe `tracking.*` en el `settings.yaml` de un site YA creado). Vacío = apagado. El aprovisionamiento de un site nuevo NO escribe `tracking.*`: solo `forms.siteId` y el bloque `gen`.
- **A mano:** `src/data/settings.yaml`, bloque `tracking:`.
- **Con variables de build** (`PUBLIC_TRACKING_*`, ver abajo): es lo que usa el site vivo `theme.saastro.io`, para que el repo-plantilla pueda salir sin ids.
- **El `settings.yaml` del theme va SIN ids de medición**: el repo es también la plantilla y
  un site nuevo copia `main` tal cual. Los ids de `theme.saastro.io` viven en las variables de
  build de su despliegue. Los ids de un cliente o de otro site **nunca** se ponen en el repo del theme.
  Los descendientes se protegen con `merge=ours` (ver el `.gitattributes`): un site que
  ya editó su `settings.yaml` conserva el suyo al traer el theme. Revisa ese diff en el
  primer merge de cada site.

## Variables de build (las pone el despliegue)

Para los sites cuyo `settings.yaml` no debe llevar los ids (el theme vivo, o cualquier site que
prefiera ponerlos en su panel de despliegue). Los nombres salen del catálogo:
`PUBLIC_TRACKING_` + la clave en MAYÚSCULAS_Y_GUION_BAJO. Lista exacta:

| Variable | Qué hace | Sustituye a |
|---|---|---|
| `PUBLIC_TRACKING_GA4` | Google Analytics 4 | `tracking.ga4` |
| `PUBLIC_TRACKING_GTM` | Google Tag Manager | `tracking.gtm` |
| `PUBLIC_TRACKING_GOOGLE_ADS` | Google Ads | `tracking.googleAds` |
| `PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL` | Etiqueta de conversión de Google Ads | `tracking.googleAdsConversionLabel` |
| `PUBLIC_TRACKING_META_PIXEL` | Meta Pixel | `tracking.metaPixel` |
| `PUBLIC_TRACKING_TIKTOK_PIXEL` | TikTok Pixel | `tracking.tiktokPixel` |
| `PUBLIC_TRACKING_LINKEDIN_PARTNER_ID` | LinkedIn Insight Tag | `tracking.linkedinPartnerId` |
| `PUBLIC_TRACKING_CLARITY` | Microsoft Clarity | `tracking.clarity` |
| `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS` | Cloudflare Web Analytics (token del beacon) | `tracking.cloudflareWebAnalytics` y la ruta vieja `analytics.cloudflareWebAnalytics.token` |
| `PUBLIC_WHATSAPP_NUMBER` | Número del widget de WhatsApp | la clave i18n `whatsapp.number` |

- **No son secretos.** Todas empiezan por `PUBLIC_`: Vite las escribe en el HTML y el JS servidos (un id de GA4, de Clarity o el token del beacon de Cloudflare se ven en el código fuente de cualquier web). No metas nada privado en una variable `PUBLIC_*`.
- **Se leen al CONSTRUIR** (`import.meta.env`, sustituido en el build, también en las rutas SSR del Worker). Cambiar una variable exige **volver a construir y desplegar**; no basta con guardarla.
- **Variable no vacía = gana y va SOLA.** Sustituye a `settings.tracking.<clave>` y a la ruta legacy (no se suman ids). Las props `analytics` de `BaseLayout`, si un site las usa, siguen por encima.
- **Vacía o sin definir = se usa `settings.yaml`**, como siempre.
- **Un valor inválido en la variable se DESCARTA con un aviso en el build y NO cae a `settings.yaml`.** Quien pone la variable quiere sustituir; caer a settings reencendería en silencio justo el id que la variable venía a quitar (en la plantilla, el de otra cuenta). El proveedor queda apagado. Mismas validaciones que en settings: patrón por proveedor, varios ids separados por comas, tope del catálogo.
- **WhatsApp:** `PUBLIC_WHATSAPP_NUMBER` acepta `+34 600 000 000` o `34600000000`; se normaliza a solo dígitos (8 a 15, con indicativo de país). Si es inválido, el widget no se monta (y no se usa la clave i18n). El widget también necesita el bloque i18n `whatsapp` (sus textos): sin él no se monta aunque la variable esté puesta. Sin variable, se usa `whatsapp.number` de `es.json`/`en.json`; sin número, el widget no se monta.

**`theme.saastro.io` (Cloudflare → Workers → `saastro-theme` → Settings → Variables and Secrets / Build → Variables):** `PUBLIC_TRACKING_GA4`, `PUBLIC_TRACKING_CLARITY`, `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS` y `PUBLIC_WHATSAPP_NUMBER`. Deben estar puestas **antes** de desplegar un build que traiga esta versión, o el theme vivo deja de medir y de mostrar WhatsApp. Se pone el valor de cada cuenta; no se copia en este repo.

## Configuración efectiva (para el Hub)

`settings.yaml` solo dice una parte de lo que mide un site: las variables de build `PUBLIC_TRACKING_*` GANAN sobre él y no están en el repo. Para que el Hub sepa qué ids están **realmente activos** y de dónde vienen (sin leer solo settings ni rascar el HTML), cada build publica `/saastro-tracking.json`: un fichero estático generado en el build, en la raíz del site (`https://<dominio>/saastro-tracking.json`).

- **Sale de la misma resolución que el cargador.** Lo escribe `resolveTracking` (`src/lib/tracking.ts`), la función que usan `BaseLayout` y `SiteLayout` para decidir qué carga; no hay una segunda precedencia. Refleja el **site** (sin props de `BaseLayout`, sin override de landing).
- **Determinista:** sin fecha ni hora; proveedores ordenados por `key`; mismo settings y mismas variables, mismos bytes. Cambia solo al volver a construir y desplegar.
- **Público, sin secretos:** los ids ya están en el HTML servido. Un id inválido **no se repite**: solo se da el motivo. No lleva WhatsApp, rutas ni el frontmatter de las landings. No está en el sitemap.
- **El Hub debe leerlo del site DESPLEGADO** (no del repo ni de su propio settings): es lo único que ve las variables del despliegue. Es lo que mide el último build, no lo que hay guardado en el panel del despliegue: si alguien cambia una variable y no reconstruye, el fichero sigue diciendo lo anterior (igual que el HTML).
- Sin cabeceras CORS: se lee desde servidor, no desde el navegador de otra web.

Campos por proveedor del catálogo (`providers[]`, todos presentes aunque estén apagados):

| Campo | Qué es |
|---|---|
| `key`, `label` | Clave del catálogo y nombre legible |
| `category` | `analytics` · `marketing` · `any` (GTM: carga con cualquiera de las dos) · `none` (exento de consentimiento) |
| `ids` | Ids ya validados, sin duplicados, en el orden escrito. `[]` si está apagado |
| `source` | De dónde sale: `variable` (`PUBLIC_TRACKING_*`) · `settings` (`tracking.<clave>`) · `legacy` (ruta vieja `analytics.*`) · `none` (nadie lo fija) |
| `envVar` | Nombre de la variable que lo fijaría (derivado del catálogo), esté o no puesta |
| `consentRequired` | `false` solo para un proveedor exento (hoy ninguno) |
| `perLanding` | ¿Puede una landing sobrescribirlo? `false` en los del site (Clarity, Cloudflare) y en los exentos |
| `invalid` | **Solo si procede:** lista de motivos por los que se descartó un valor: `formato`, `no-cadena` (YAML lo leyó como número/booleano) o `tope` (más ids de los que admite). Nunca el valor |

Cómo leerlo: `source: "variable"` = **fijado por variable de build**. Para ese aviso el Hub usa `source` y `envVar` («este id lo fija `PUBLIC_TRACKING_GA4` en el despliegue; editarlo en settings no tendrá efecto»). Una variable inválida sale como `source: "variable"`, `ids: []` e `invalid: ["formato"]`: el proveedor queda apagado y **no** cae a settings. `source: "none"` con `ids: []` es apagado. `schema` solo cambia si se rompe el contrato; añadir campos no lo cambia.

Ejemplo (fixtures falsos; recortado a tres proveedores). GA4 por variable, Clarity por settings y Meta con un valor descartado:

```json
{
  "schema": 1,
  "siteUrl": "https://example.test",
  "providers": [
    {
      "key": "clarity",
      "label": "Microsoft Clarity",
      "category": "analytics",
      "ids": ["testaaaa01"],
      "source": "settings",
      "envVar": "PUBLIC_TRACKING_CLARITY",
      "consentRequired": true,
      "perLanding": false
    },
    {
      "key": "ga4",
      "label": "Google Analytics 4",
      "category": "analytics",
      "ids": ["G-TESTAAAA01"],
      "source": "variable",
      "envVar": "PUBLIC_TRACKING_GA4",
      "consentRequired": true,
      "perLanding": true
    },
    {
      "key": "metaPixel",
      "label": "Meta Pixel",
      "category": "marketing",
      "ids": [],
      "source": "settings",
      "envVar": "PUBLIC_TRACKING_META_PIXEL",
      "consentRequired": true,
      "perLanding": true,
      "invalid": ["formato"]
    }
  ]
}
```

(El fichero real lista los ocho proveedores, con `ids` expandido a una línea por id.) No incluye la etiqueta de conversión de Google Ads ni las props de `BaseLayout`.

## Una propiedad por negocio, un flujo por web (GA4)

GA4 se organiza en **cuenta → propiedad → flujo de datos**. Recomendación:

| Nivel | Qué es | Ejemplo |
|---|---|---|
| Cuenta | Contenedor de permisos | `Jcenlo` |
| Propiedad | Un conjunto de informes; todo lo que entra se mezcla | `jcenlo`, `enlolab`, `saastro` |
| Flujo de datos | Una web, con su propio id `G-…` | `theme.saastro.io` dentro de `saastro` |

Un flujo por web dentro de la propiedad permite ver todo un negocio junto o filtrar
por flujo. Los subdominios (CNAME) son una web más. **Las webs de un cliente van en
su propia propiedad o cuenta**, no en la del que las construye.

---

## Google Analytics 4 · `ga4` · categoría `analytics`

- **Id:** `G-XXXXXXXXXX` (patrón `^G-[A-Z0-9]{6,12}$`).
- **Cuenta necesaria:** una cuenta de Google. Gratis.
- **Cookies propias del site:** `_ga`, `_ga_<id>` (medidas).
- **Dónde:** <https://analytics.google.com>
- **Pasos (recorridos el 2-nov-2026):**
  1. Admin → **Create** → **Property**.
  2. Nombre, país y zona horaria, moneda → **Next**.
  3. Sector y tamaño del negocio → **Next**. Objetivos (p. ej. *Generate leads* y
     *Understand web traffic*) → **Create**.
  4. Plataforma **Web**: URL de la web (`https://…`) y nombre del flujo →
     **Create and continue**. La *medición mejorada* viene activada: ya cuenta los
     cambios de página por el historial, así que **no** hay que emitir `page_view` a mano.
  5. En **Web stream details**, copia el **Measurement ID** (`G-…`). No confundirlo
     con el *Stream ID*, que es solo numérico.
- **Comprobar:** Informes → **Tiempo real**: aparecen los usuarios activos al
  navegar la web **aceptando** las cookies. El aviso «sin datos» de la portada de la
  propiedad tarda en desaparecer; el tiempo real no.
- **Documentación:** <https://support.google.com/analytics/answer/9304153>

## Microsoft Clarity · `clarity` · categoría `analytics`

- **Id:** 10 caracteres en minúscula y dígitos (patrón `^[a-z0-9]{8,12}$`), p. ej. `testaaaa01` (ficticio).
- **Cuenta necesaria:** Microsoft, Google o Facebook (SIN VERIFICAR: lo que ofrece el inicio de sesión). Gratis.
- **Cookies propias del site:** `_clck`, `_clsk` (medidas). Clarity también usa
  cookies de su propio dominio (`clarity.ms`) que el site **no puede borrar**.
- **Qué hace:** graba sesiones (interacciones en la página). Es el proveedor más
  sensible de esta lista: la política debe decirlo, y conviene mirar cómo enmascara
  los campos de formulario antes de encenderlo en un site con datos personales.
- **Dónde:** <https://clarity.microsoft.com>
- **Pasos:** iniciar sesión → crear un **proyecto** con el nombre y la URL de la web
  (el formulario de creación **no lo recorrimos**: SIN VERIFICAR). El id aparece en
  la URL del proyecto (`…/projects/view/<id>/…`) y en **Getting started → Install
  manually**, en la última línea del código: `"clarity", "script", "<id>"`.
- **Documentación:** <https://learn.microsoft.com/clarity/>

## Google Tag Manager · `gtm` · categoría `analytics` **o** `marketing`

- **Id:** `GTM-XXXXXXX` (patrón `^GTM-[A-Z0-9]{4,10}$`).
- **Ojo:** lo que hace un contenedor depende de las etiquetas que tenga dentro, y
  **no se ven desde este repositorio**. La política debe describirlas. Carga con
  cualquiera de las dos categorías. **Consent Mode solo gobierna las etiquetas de
  Google que lo respetan** (`analytics_storage`, `ad_storage`, `ad_user_data`,
  `ad_personalization`): una etiqueta HTML personalizada o de un tercero dentro del
  contenedor **no** lo respeta por sí sola y puede dispararse con solo analítica
  concedida. Hay que configurarlas con los activadores de consentimiento de GTM y
  describirlas en la política.
- **Dónde (SIN VERIFICAR):** <https://tagmanager.google.com> → cuenta → contenedor →
  el id `GTM-…` aparece arriba a la derecha.
- **Documentación:** <https://support.google.com/tagmanager/answer/6103696>

## Google Ads · `googleAds` y `googleAdsConversionLabel` · categoría `marketing`

- **Ids:** `AW-123456789` (patrón `^AW-[0-9]{8,12}$`) y la **etiqueta de conversión**
  (patrón `^[A-Za-z0-9_-]{10,40}$`). La etiqueta solo vale si `googleAds` está puesto.
- **Cuenta necesaria:** una cuenta de Google Ads (de anuncios; pide datos de facturación).
- **Dónde (SIN VERIFICAR):** <https://ads.google.com> → Objetivos → **Conversiones** →
  crear una conversión de **sitio web** → el panel muestra la etiqueta de Google con
  `send_to: 'AW-XXXXXXXXX/<etiqueta>'`: la primera parte es `googleAds`, la segunda
  `googleAdsConversionLabel`.
- **Cookies propias del site (de memoria, SIN VERIFICAR):** `_gcl_*`, `_gac_*`.
- **Qué emite el theme:** al enviarse un formulario de landing, `generate_lead` →
  un evento `conversion` con `send_to: <AW>/<etiqueta>`.
- **Documentación:** <https://support.google.com/google-ads/answer/6095821>

## Meta Pixel · `metaPixel` · categoría `marketing`

- **Id:** numérico, normalmente 15 o 16 dígitos (patrón `^[0-9]{10,20}$`).
- **Cuenta necesaria:** un Business Manager de Meta.
- **Cookies propias del site (de memoria, SIN VERIFICAR):** `_fbp`, `_fbc`.
- **Dónde (SIN VERIFICAR):** <https://business.facebook.com/events_manager> →
  conectar fuente de datos → **Web** → Meta Pixel. El id aparece en la ficha del píxel.
- **Qué emite el theme:** `PageView` al cargar y `Lead` al enviar el formulario,
  con `eventID` = el `event_id` del envío (sirve para deduplicar con una API de
  conversiones de servidor, que **aún no existe**).
- **Documentación:** <https://developers.facebook.com/docs/meta-pixel>

## TikTok Pixel · `tiktokPixel` · categoría `marketing`

- **Id:** alfanumérico en mayúsculas, ~20 caracteres (patrón `^[A-Z0-9]{15,25}$`).
- **Cuenta necesaria:** TikTok Ads Manager.
- **Dónde (SIN VERIFICAR):** <https://ads.tiktok.com> → Assets → **Events** → Web
  events → gestionar el píxel. El id aparece en la ficha.
- **Cookies propias del site (de memoria, SIN VERIFICAR):** `_ttp`, `_tt_enable_cookie`, `_ttclid`.
- **Qué emite el theme:** la página al cargar y `SubmitForm` al enviar el formulario,
  con `event_id`.
- **Documentación:** <https://business-api.tiktok.com/portal/docs?id=1739585696931842>

## LinkedIn Insight Tag · `linkedinPartnerId` · categoría `marketing`

- **Id:** el *Partner ID*, numérico (patrón `^[0-9]{5,10}$`).
- **Cuenta necesaria:** LinkedIn Campaign Manager.
- **Dónde (SIN VERIFICAR):** <https://www.linkedin.com/campaignmanager> → Analizar →
  **Insight Tag**. El *Partner ID* aparece en el código de instalación.
- **Límite:** el theme carga la etiqueta pero **no emite evento de conversión**:
  las conversiones de LinkedIn se definen en su panel por regla (por ejemplo, por
  URL: la página `/lp/gracias`).
- **Documentación:** <https://www.linkedin.com/help/lms/answer/a415390>

## Cloudflare Web Analytics · `cloudflareWebAnalytics` · categoría `analytics`

- **Id:** el *token del beacon*, 32 caracteres hexadecimales (patrón `^[0-9a-fA-F]{32}$`).
  No es el *site tag* de la API GraphQL: es el token que va en `data-cf-beacon`.
- **Cuenta necesaria:** una cuenta de Cloudflare. Gratis.
- **Dónde se pone:** `tracking.cloudflareWebAnalytics` o la variable de build `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS` (gana a las dos rutas de settings). La ruta antigua
  `analytics.cloudflareWebAnalytics.token` **se sigue leyendo** como respaldo (hay
  descendientes y el Hub la escribe todavía); si existen las dos, **gana
  `tracking.cloudflareWebAnalytics`**, aunque su valor sea inválido (entonces se
  descarta con aviso y NO se cae a la antigua en silencio).
- **Cookies propias del site:** ninguna prevista en el catálogo (SIN VERIFICAR).
- **Consentimiento: de analítica, como GA4 y Clarity** (desde el 13-nov-2026; antes figuraba
  exento por una decisión del theme que **nunca se verificó** contra la documentación de
  Cloudflare ni contra la ley). No carga hasta que el visitante acepta analítica, entra en la
  versión del consentimiento (un consentimiento anterior que no lo cubra vuelve a preguntar) y
  retirar el consentimiento recarga la página. Sigue sin cargar en una vista previa de borrador y
  en `localhost`/`*.saastro.io` (salvo el host propio del site). No recibe `window.saastroTrack`.
- **Política de cookies:** el invariante 8e **exige su ancla** `tracking-cloudflare`
  (`docs/legal-marketing.md`, última sección; el texto final es de JC).
- **Solo un token por página:** con una lista `a,b` se usa el primero y el build avisa.
- **Dónde (SIN VERIFICAR):** <https://dash.cloudflare.com> → Analytics y registros →
  **Web Analytics** → el sitio → el token del fragmento JavaScript.

## Varios ids en un mismo proveedor

El valor de cualquier clave de `tracking:` puede ser **una cadena con ids separados
por comas** (el Hub solo sabe escribir cadenas): `ga4: "G-AAAAAAAAAA,G-BBBBBBBBBB"`.

- Se parte por comas, se recorta cada id, se **valida cada uno con el patrón de su
  proveedor** (el malo se descarta con aviso en el build y el resto sigue), se quitan
  los repetidos y se aplica el **tope de 5** por proveedor (si hay más, se usan los 5
  primeros y se avisa). Un solo id funciona exactamente como siempre.
- Lo que hace cada uno con la lista:

| Proveedor | Con varios ids |
|---|---|
| GA4 | un solo `gtag.js` (con el primero) y un `gtag('config', id)` por id |
| Google Ads | igual que GA4 (comparte el `gtag.js`) |
| GTM | un `gtm.js` por contenedor |
| Meta | un `fbq('init', id)` por píxel y **un solo** `PageView` |
| TikTok | un `ttq.load(id)` por píxel y una sola `ttq.page()` |
| LinkedIn | todos los partner ids en la lista y la etiqueta una vez |
| Clarity | **un solo proyecto por página** (tope 1) |
| Cloudflare | **un solo token** (tope 1) |

- **Clarity (y Cloudflare) con lista: se usa el primero y se avisa**, en vez de
  rechazarlo todo. Motivo: la etiqueta de Clarity es un singleton por página (dos
  proyectos se pisarían), y rechazar la lista apagaría en silencio la grabación de un
  site que hasta ayer funcionaba; el aviso del build deja el error a la vista y todos
  los ids ya pasaron por el patrón, así que no hay riesgo de inyección.
- **Eventos de conversión (`window.saastroTrack`, `generate_lead`):** van a **todos**
  los ids: GA4 emite un evento que gtag reparte a todos sus `config`; Meta y TikTok
  emiten uno que llega a todos los píxeles inicializados (TikTok: **SIN VERIFICAR**
  con dos píxeles reales).
- **Google Ads, etiquetas de conversión:** una etiqueta pertenece a **una** cuenta
  `AW-…`. `googleAdsConversionLabel` admite una lista **en el mismo orden que
  `googleAds`**: la i-ésima etiqueta va con la i-ésima cuenta (`,Etiqueta2` deja la
  primera cuenta sin conversión). Con una sola etiqueta y varias cuentas, la
  conversión sale **solo a la primera cuenta**; no se manda la etiqueta de una cuenta
  a las demás.
- **El consentimiento sigue siendo por proveedor**, no por id: añadir un segundo id de
  un proveedor ya encendido no vuelve a pedir consentimiento (la política debe decir
  que son varias propiedades o cuentas; ver `docs/legal-marketing.md`).
- **Qué está verificado:** el cargador real se ejecuta en pruebas contra un DOM
  simulado, y GA4 con dos ids se midió en un navegador. Los efectos en los paneles de
  cada proveedor con varios ids reales **no** están comprobados.

## Override de píxeles por landing

Una landing de campaña puede traer sus propios píxeles (su Meta, su cuenta y etiqueta
de Google Ads…) sin tocar los del resto del site. Se escribe en el **frontmatter** de
la landing, `src/content/lp/<slug>.md`, y solo afecta a `/lp/<slug>`.

```yaml
---
title: "Campaña de otoño"
form: "contacto"
# … resto de campos de la landing …
trackingMode: add            # add (por defecto) | replace
tracking:
  metaPixel: "1234567890123"
  googleAds: "AW-123456789"
  googleAdsConversionLabel: "AbCdEfGhIj_k"
---
```

**Contrato exacto (lo que la interfaz del Hub tiene que escribir):**

- **Ruta:** el frontmatter de `src/content/lp/<slug>.md`. Dos claves de primer nivel:
  `tracking` (un mapa) y `trackingMode` (una cadena). Ambas opcionales; sin ellas la
  landing usa los píxeles del site, como siempre.
- **Claves de `tracking`** (las del catálogo): `metaPixel`, `tiktokPixel`,
  `linkedinPartnerId`, `googleAds`, `googleAdsConversionLabel`, `ga4`, `gtm`.
  `cloudflareWebAnalytics` y `clarity` **son del site** y no se pueden sobrescribir
  (se ignoran con aviso). Cualquier otra clave se ignora con aviso.
- **Valores:** **siempre cadenas entrecomilladas**; un valor puede ser una lista de
  ids separados por comas (`"G-AAAAAAAAAA,G-BBBBBBBBBB"`). Un id numérico sin comillas
  es un número para YAML y se descarta. Un campo sin rellenar se escribe **omitiendo
  la clave** (o `""`: es lo mismo).
- **`trackingMode`:** `add` o `replace` (mayúsculas y espacios no importan). Otro
  valor = `add` con aviso.
- La clave `tracking:` va **anidada**, no aplanada (`tracking_metaPixel` no se lee).
  El esquema (`src/content.config.ts`) solo exige la forma; **los valores no rompen el
  build**: un id malo se descarta con aviso en el log del servidor y nunca se inyecta.
- Misma validación por id que en `settings.tracking` (patrón del catálogo, repetidos
  fuera, tope de 5 por proveedor). Una vista previa de borrador (`?preview=`, que es
  `noindex`) sigue apagándolo **todo**.

**Qué hace cada modo**

| | `add` (por defecto) | `replace` |
|---|---|---|
| Un proveedor que la landing trae | sus ids se **suman** a los del site (sin repetir; el tope de 5 cuenta la suma) | sus ids **sustituyen** a los del site para ese proveedor |
| Un proveedor que la landing no trae | el del site | el del site |
| Un proveedor que el site no tiene | se enciende solo en la landing | igual |
| Todo lo que trae la landing es inválido (o no es cadena) | no quita nada | el proveedor queda **apagado** en esa landing, con aviso. Nunca hereda el píxel del site: sus visitas irían a una audiencia que no es la de la campaña |
| Clave en blanco (`""`) | no hace nada | **hereda** el del site. No se puede apagar un proveedor desde una landing con un campo vacío: así un editor que escribe todos los campos no borra los píxeles del site sin querer |

**Etiqueta de conversión de Google Ads.** La de la landing se empareja por posición
con las cuentas `googleAds` **de la landing** (misma regla que en el site: `,Etiqueta2`
deja la primera cuenta sin conversión). La del site sigue con las cuentas del site.
Si las dos nombran la misma cuenta gana la de la landing. Una etiqueta en la landing
sin `googleAds` propio en la landing **no sirve** (no se empareja con las cuentas del site)
y el log del servidor lo avisa. En `replace` de `googleAds`
las cuentas del site desaparecen y sus etiquetas también; una cuenta de la landing sin
etiqueta propia **no** hereda la del site.

**Consentimiento: el override no crea excepciones.** Cada proveedor mantiene su
categoría y su puerta. La versión del consentimiento de **esa página** es la unión de
los proveedores efectivos del site y de la landing: quien consintió en el site y entra
en una landing que enciende un proveedor que no vio **vuelve a ver el banner solo ahí**
y no se carga nada hasta que acepte. El banner y el cargador usan la misma lista (se
mide en un navegador). Lo que se consiente en la landing vale después en el site (la
lista guardada es un superconjunto). Añadir otro id a un proveedor que el site ya tiene
no cambia la versión: el consentimiento es por proveedor.

**Invariante `tracking-legal` (8e): límite con las variables de build.** El checker lee `settings.yaml` y las landings, **no** las `PUBLIC_TRACKING_*`. Medido (2-nov-2026): con GA4 y Clarity encendidos solo por variable, `pnpm studio:check` sigue avisando «la política DECLARA GA4/Clarity pero el site NO lo tiene encendido» (aviso inverso, falso para ese despliegue). Por el código (`trackingEnabledPorOrigen`, NO medido con un caso), el efecto contrario también existe: un proveedor encendido solo por variable **sin ancla en la política pasa en verde**. La CI de GitHub no tiene esas variables (viven en el build de Cloudflare), así que no podría verlas aunque las leyera. Quien las use debe comprobar a mano que la política nombra cada proveedor (`docs/legal-marketing.md`). Para `theme.saastro.io`, GA4, Clarity y Cloudflare Web Analytics llevan su ancla en la política del theme (la de Cloudflare es un borrador que revisa JC); la cuarta variable es el número de WhatsApp, que no es un tracker.

**Invariante `tracking-legal` (8e).** Además de `settings.yaml`, lee el frontmatter de
**cualquier** landing de `src/content/lp/*.md` (publicada o borrador). Un proveedor
encendido solo en una landing exige su ancla en la política exactamente igual que uno
del site (`pnpm studio:check` se pone rojo y nombra la landing). Una landing no se
publica sin que la política lo declare. Cuenta en `add` y en `replace`, y con que haya
un solo id de formato válido.

**Conversiones.** `window.saastroTrack` y `generate_lead` envían a los ids **efectivos
de esa página** (los del site más los de la landing, o solo los de la landing en
`replace`). La resolución es **por petición**, sin estado entre páginas.

**Límites conocidos**

- **Navegación sin recargar.** Un píxel ya cargado no se puede descargar. Si el
  visitante pasa, sin recargar, de una landing con override a otra página con una lista
  distinta de píxeles (o al revés), el cargador **recarga la página nueva** una vez
  (firma de proveedores e ids distinta) para que el override no viaje a la otra página.
  Si la página siguiente **no tiene ningún proveedor**, también recarga (un guarda mínimo
  que se emite en ese caso). Medido en un navegador.
- **`/lp/gracias`** es una página aparte, **sin override**: lo que se defina allí por URL
  (conversiones de LinkedIn, por ejemplo) usa los píxeles del site. El evento de lead de
  los píxeles de la landing sale en la propia landing, al enviar el formulario.
- Un proveedor que **solo** enciende una landing hay que declararlo en la política
  (texto de JC) antes de publicarla; el checker lo exige.
- **Vista de las claves (`consentKeys`):** solo cuentan los proveedores que piden
  consentimiento; Cloudflare Web Analytics y Clarity son del site y no se tocan desde una landing.
- Los efectos en los paneles de cada proveedor **no** están comprobados: sí que las
  peticiones salen a los ids esperados (ver la medición del PR).

---

## Después de poner los ids

1. **Comprobar en un navegador real:** sin aceptar no sale ninguna petición al
   proveedor; al aceptar sí; al retirar el consentimiento dejan de cargar y se borran
   sus cookies propias.
2. **Política de cookies:** añadir la sección de cada proveedor encendido
   (`docs/legal-marketing.md`), en todos los idiomas. Texto del responsable del site.
3. **`pnpm studio:check`** en verde.
