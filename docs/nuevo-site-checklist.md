# Checklist de un site nuevo creado desde la plantilla

El repo del theme es a la vez la plantilla y la web de `theme.saastro.io`. Un site creado con «Use this template» hereda esa web, con los valores del theme. Que `pnpm studio:check` pase NO significa que esté limpio: ese control no mira nada de esto.

Desde este cambio la plantilla **sale limpia**: `tracking.ga4`, `tracking.clarity`, el token de Cloudflare Web Analytics y el número de WhatsApp (`whatsapp.number`) van VACÍOS en el repo. `theme.saastro.io` sigue midiendo y mostrando WhatsApp con variables de build (ver abajo).

Quién lo escribe, verificado en el Hub: el aprovisionamiento reescribe SOLO `forms.siteId` y el bloque `gen` de `src/data/settings.yaml` (declarados en `saastro.template.json` como `siteIdTarget` y `genTarget`). No toca `tracking.*`, ni el token de Cloudflare, ni el WhatsApp. La tarjeta **Tracking** del Hub escribe `tracking.*` en el `settings.yaml` de un site ya creado. Todo lo demás de la lista lo cambia una persona.

## Qué pone quien crea un site nuevo

Con la plantilla limpia, un site nuevo **no mide ni muestra WhatsApp** hasta que tenga:
- **Medición:** o bien los ids en `settings.yaml` (a mano o desde la tarjeta Tracking del Hub), o bien variables de build `PUBLIC_TRACKING_*` (lista exacta abajo). Encender un proveedor exige nombrarlo en la política de cookies.
- **WhatsApp:** `PUBLIC_WHATSAPP_NUMBER` o `whatsapp.number` en `es.json`/`en.json`. Sin número, el widget no se monta.

## Variables de build (nombres exactos; NO son secretos, acaban en el HTML)

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

Se leen al construir: cambiar una exige reconstruir y desplegar. No vacía = gana a `settings.yaml`; vacía = se usa settings; inválida = se descarta con aviso y NO cae a settings. Detalle en [guia-pixeles.md](guia-pixeles.md#variables-de-build-las-pone-el-despliegue).

## Qué debe poner el site vivo `theme.saastro.io`

Cuatro variables, en Cloudflare → Workers → `saastro-theme` → Settings → Variables and Secrets (y en las variables de **build** si el build corre en Cloudflare): `PUBLIC_TRACKING_GA4`, `PUBLIC_TRACKING_CLARITY`, `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS`, `PUBLIC_WHATSAPP_NUMBER`. Con los valores de las cuentas del theme (no se escriben en este repo). **Antes de desplegar esta versión hay que ponerlas, o el theme vivo deja de medir y de mostrar WhatsApp.**

## Lista de cosas a cambiar

| # | Qué cambiar | Dónde | Lo escribe el Hub solo |
|---|---|---|---|
| 1 | `tracking.ga4`, `tracking.clarity` (y el resto de `tracking.*` que se enciendan) | `src/data/settings.yaml` o variables `PUBLIC_TRACKING_*` | No. La plantilla ya viene vacía: poner los del cliente |
| 2 | Token de Cloudflare Web Analytics | `tracking.cloudflareWebAnalytics` o `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS`; la ruta vieja `analytics.cloudflareWebAnalytics.token` también viene vacía | No. Desde #151 (13-nov-2026) carga solo tras aceptar `analytics`, como el resto; aun así, nunca poner el token del theme en un site ajeno |
| 3 | `forms.siteId` | `src/data/settings.yaml`; también el `siteId` de `content/pages/*` | `forms.siteId` sí. Los `content/pages/*` no: revisarlos |
| 4 | Bloque `gen` (`workspaceId`, `consent`, `vertical`) | `src/data/settings.yaml` | `workspaceId` y `vertical` sí. **`consent` NO**: déjalo `"required"` o ausente. Un `"none"` heredado hace que el site mida antes del banner ([consentimiento.md](consentimiento.md)) |
| 5 | Número de WhatsApp (vacío oculta el widget) | `PUBLIC_WHATSAPP_NUMBER` o `whatsapp.number` en `src/i18n/translations/es.json` y `en.json` | No |
| 6 | Home, About, hero, features, CTA y demás textos del escaparate «Saastro Theme» | `src/i18n/translations/*.json` y `src/pages/[...locale]/index.astro` | No |
| 7 | `meta.siteName` y `site.name` (hoy hay dos nombres; gana `meta.siteName`) | `src/i18n/translations/*.json` y `settings.yaml` | No |
| 8 | ¿Debe ser instalable («Instalar app»)? Por defecto **no**: `pwa.enabled: false`. Si sí: `pwa.enabled: true` con nombre y colores propios, y los iconos `icon-*` de la fila 9 (docs/pwa.md) | `pwa` en `src/data/settings.yaml` | No |
| 9 | Logos y favicons | `src/assets/brand/logo-{light,dark}.svg`, `public/favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `og-image.png` | No |
| 10 | Entradas de blog de ejemplo (aparecen en `/blog`, RSS y sitemap) | `src/content/blog/`: borrarlas o `draft: true` | No |
| 11 | Política de cookies, privacidad y términos: son plantilla, sin responsable del tratamiento ni datos de contacto. Requieren revisión legal antes de publicar. La política de cookies declara GA4 y Clarity; ajustarla a lo que el site encienda | `src/content/legal/**` o el Centro Legal del Hub | No. El texto lo aprueba una persona |
| 12 | `SITE_URL` con el dominio real (sin él, canonical, OG, hreflang y sitemap salen con el dominio de la plantilla) | variable de build | No |
| 13 | CTAs de ejemplo que apuntan a `ui.saastro.io` (`secondaryHref` en los bloques y en `content/pages/*`) | `content/pages/*` y bloques | No |

Antes de publicar, en el repo del site (se excluye `docs/`, que cita estos valores):

```
git grep -n "2b771188\|ui.saastro.io" -- . ':!docs'
```

No debe devolver nada (`2b771188` es el `forms.siteId` del theme). Los ids de medición y el WhatsApp del theme ya no están en el repo; comprueba a ojo que `tracking.*`, `analytics.cloudflareWebAnalytics.token` y `whatsapp.number` están vacíos o son del cliente.

Nota del punto 7: `meta.siteName` solo gana a `site.name` con i18n activo.

## Después de conectar el site

Comprueba con `curl` y en un navegador limpio (guía completa en [conexion-hub.md](conexion-hub.md#qué-comprobar-tras-conectar-un-site) y [consentimiento.md](consentimiento.md#cómo-comprobarlo-tú)):

- `/health.json` devuelve el sha que esperas.
- `/saastro-tracking.json` responde 200 con JSON: es lo que lee el Hub.
- Antes de tocar el banner, ninguna petición a Gen, Google, Clarity, Cloudflare Insights ni Turnstile.
