# Declaración legal de los píxeles de medición y anuncios (`data-legal="tracking-…"`)

> **BORRADOR TÉCNICO — NO ES TEXTO LEGAL APROBADO.** Este fichero dice qué hace
> el código del theme con cada proveedor (qué se carga, de qué host, cuándo). La
> redacción final que ve el visitante —base jurídica, plazos, derechos,
> transferencias internacionales, identidad del responsable— **es de JC** y se
> escribe/aprueba antes de encender el proveedor. Lo que dice cada proveedor de
> sí mismo (cookies que fija, datos que recoge) **no está verificado aquí**: se
> contrasta con su documentación vigente antes de publicar.

Cada sección lleva su **ancla** `<div data-legal="tracking-…"></div>`. Copia la
sección del proveedor que enciendas al markdown de la política de cookies
—**en todos los locales**— **antes** de poner su id en `settings.tracking`.

**Por qué existe.** Encender un proveedor hace que el navegador del visitante
hable con un tercero. El invariante **`tracking-legal`** (8e) de
`pnpm studio:check` cierra ese hueco: por cada proveedor encendido en
`src/data/settings.yaml` **o en el frontmatter `tracking:` de cualquier landing**
(`src/content/lp/*.md`, publicada o borrador), la política enlazada por el banner debe contener su
ancla; si falta, la CI se pone roja y te manda aquí. Es un marcador **por
proveedor** porque «usamos cookies de terceros» no dice cuáles. El inverso (la
política declara uno que está apagado) es un aviso, no un fallo. Mecanismo y
razón del ancla explícita: `legal-gen-tracking.md`; por qué se pregunta a
settings y no al DOM: `legal-render-ratio.md`. **Excepción explícita:** un
proveedor del catálogo `src/lib/tracking-providers.json` con `category: "none"` y
un `exemptReason` escrito (hoy solo Cloudflare Web Analytics) no exige ancla; ver
la última sección.

## Qué es común a todos (auditado sobre el código)

Auditado en `src/components/Analytics.astro`, `src/lib/tracking.ts`,
`src/lib/cookies.ts` y `src/widgets/CookieConsent/CookieBanner.tsx`.

| | |
|---|---|
| **Cuándo se carga** | Solo tras el consentimiento del banner. Sin consentimiento, ninguna petición al proveedor. En una vista previa de un borrador (`noindex`) no se carga nada. **Única excepción: Cloudflare Web Analytics** (proveedor exento, ver su sección al final). |
| **Varios ids** | Un proveedor puede llevar varios ids separados por comas (`tracking.ga4: "G-AAAA…,G-BBBB…"`, máximo 5; Clarity y Cloudflare, 1). El proveedor sigue siendo UNO: el ancla de abajo cubre todos sus ids y el consentimiento es único por proveedor. Al declarar un proveedor con varios ids conviene que el texto lo diga (varias propiedades o cuentas del responsable). |
| **Categoría** | `analytics`: GA4, Clarity. `marketing`: Google Ads, Meta, TikTok, LinkedIn. GTM carga con `analytics` **o** `marketing`. |
| **Retirar el consentimiento** | El banner recarga la página si había un tracker vivo; al arrancar sin consentimiento ya no se inyecta. |
| **Consent Mode v2 (Google)** | Antes de cargar nada de Google se declara todo denegado (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`); al aceptar se actualiza por categoría. |
| **Sin JavaScript** | No hay `<noscript>` de ningún proveedor: sin JS el visitante no puede consentir y no se le mide. |
| **Evento de conversión** | `window.saastroTrack('generate_lead', { event_id })` emite a los proveedores YA cargados (con consentimiento). El cableado al envío del formulario (UUID por envío) llega con el PR de conversión: hasta entonces nadie lo llama. |

## Google Analytics 4 <div data-legal="tracking-ga4"></div>

Categoría `analytics`. Carga `https://www.googletagmanager.com/gtag/js` y envía
medidas a Google. *[Texto final: JC. Contrastar cookies y datos con la
documentación vigente de Google.]*

## Google Tag Manager <div data-legal="tracking-gtm"></div>

Categoría `analytics` o `marketing`. Carga `https://www.googletagmanager.com/gtm.js`;
lo que haga el contenedor depende de las etiquetas que tenga configuradas, que
**no** se ven desde este repositorio: la política debe describir esas etiquetas.
*[Texto final: JC.]*

## Google Ads <div data-legal="tracking-google-ads"></div>

Categoría `marketing`. Usa `gtag.js` de Google para medir conversiones de
anuncios. *[Texto final: JC.]*

## Meta Pixel <div data-legal="tracking-meta"></div>

Categoría `marketing`. Carga `https://connect.facebook.net/en_US/fbevents.js` y
envía `PageView` y, cuando se emite una conversión, `Lead` (con su `event_id`) a Meta. *[Texto final: JC.
Meta puede fijar las cookies `_fbp`/`_fbc`: contrastar.]*

## TikTok Pixel <div data-legal="tracking-tiktok"></div>

Categoría `marketing`. Carga `https://analytics.tiktok.com/i18n/pixel/events.js`
y envía la página y el evento de formulario enviado. *[Texto final: JC.]*

## LinkedIn Insight Tag <div data-legal="tracking-linkedin"></div>

Categoría `marketing`. Carga `https://snap.licdn.com/li.lms-analytics/insight.min.js`
con el Partner ID del site. *[Texto final: JC.]*

## Microsoft Clarity <div data-legal="tracking-clarity"></div>

Categoría `analytics`. Carga `https://www.clarity.ms/tag/<id>`. Clarity registra
sesiones del visitante (interacciones en la página). *[Texto final: JC. Contrastar
qué datos graba y cómo enmascara campos de formulario.]*

## Cloudflare Web Analytics (exento de consentimiento, SIN ancla `data-legal`)

> **Esto no es texto legal.** Es el registro técnico de una excepción que ya existía
> en el código y que ahora está escrita en el catálogo. Si hay que nombrar a
> Cloudflare en la política, el texto lo redacta y lo aprueba JC.

- **Qué hace el código:** carga `https://static.cloudflareinsights.com/beacon.min.js`
  **sin esperar al banner** y con el token de `tracking.cloudflareWebAnalytics` (o,
  como respaldo, `analytics.cloudflareWebAnalytics.token`). No carga en una vista
  previa de borrador ni en `localhost`, `127.0.0.1`, `*.saastro.test`, `*.local` ni
  en `*.saastro.io` salvo el host propio del site.
- **Por qué está exento (decisión técnica anterior al catálogo, tal cual la dejó
  el theme):** el beacon no escribe nada en el dispositivo del visitante ni lo
  identifica. **No está verificado aquí contra la documentación vigente de
  Cloudflare**, y si deja de ser cierto la exención cae. El motivo literal vive en
  `exemptReason`, en el catálogo.
- **Qué NO hace por ser exento:** no entra en la versión del consentimiento (no
  vuelve a preguntar a quien ya consintió), no marca que haya un tracker vivo (retirar
  el consentimiento no recarga por él) y no recibe los eventos de conversión.
- **Qué hace el checker:** el invariante `tracking-legal` (8e) **no exige** su ancla.
  La exención exige las DOS cosas en el catálogo (`category: "none"` y un
  `exemptReason` no vacío); si falta el motivo, el proveedor se trata como uno que
  pide ancla. Si JC decide nombrarlo igualmente, no hay ancla ni marcador previstos:
  habría que añadirlos al catálogo a propósito.
