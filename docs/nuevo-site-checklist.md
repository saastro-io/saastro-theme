# Checklist de un site nuevo creado desde la plantilla

El repo del theme es a la vez la plantilla y la web de `theme.saastro.io`. Un site creado con «Use this template» hereda esa web, con los valores del theme. Que `pnpm studio:check` pase NO significa que esté limpio: ese control no mira nada de esto.

Quién lo escribe, verificado en el Hub: el aprovisionamiento reescribe SOLO `forms.siteId` y el bloque `gen` de `src/data/settings.yaml` (declarados en `saastro.template.json` como `siteIdTarget` y `genTarget`). Todo lo demás de la lista lo cambia una persona.

| # | Qué cambiar | Dónde | Lo escribe el Hub solo |
|---|---|---|---|
| 1 | `tracking.ga4`, `tracking.clarity` (y el resto de `tracking.*` que se enciendan) | `src/data/settings.yaml` | No. Vaciar los del theme y poner los del cliente |
| 2 | Token de Cloudflare Web Analytics | `tracking.cloudflareWebAnalytics` y, si está, vaciar la ruta vieja `analytics.cloudflareWebAnalytics.token` (`settings.yaml`) | No. Carga SIN consentimiento: con el token del theme mide hacia la cuenta del theme |
| 3 | `forms.siteId` | `src/data/settings.yaml`; también el `siteId` de `content/pages/*` | `forms.siteId` sí. Los `content/pages/*` no: revisarlos |
| 4 | Bloque `gen` (`workspaceId`, consentimiento, vertical) | `src/data/settings.yaml` | Sí |
| 5 | Número de WhatsApp (`whatsapp.number`; vacío oculta el widget) | `src/i18n/translations/es.json` y `en.json` | No |
| 6 | Home, About, hero, features, CTA y demás textos del escaparate «Saastro Theme» | `src/i18n/translations/*.json` y `src/pages/[...locale]/index.astro` | No |
| 7 | `meta.siteName` y `site.name` (hoy hay dos nombres; gana `meta.siteName`) | `src/i18n/translations/*.json` y `settings.yaml` | No |
| 8 | Nombre y colores de la PWA | `public/manifest.json` | No |
| 9 | Logos y favicons | `src/assets/brand/logo-{light,dark}.svg`, `public/favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `og-image.png` | No |
| 10 | Entradas de blog de ejemplo (aparecen en `/blog`, RSS y sitemap) | `src/content/blog/`: borrarlas o `draft: true` | No |
| 11 | Política de cookies, privacidad y términos: son plantilla, sin responsable del tratamiento ni datos de contacto. Requieren revisión legal antes de publicar. La política de cookies declara GA4 y Clarity; ajustarla a lo que el site encienda | `src/content/legal/**` o el Centro Legal del Hub | No. El texto lo aprueba una persona |
| 12 | `SITE_URL` con el dominio real (sin él, canonical, OG, hreflang y sitemap salen con el dominio de la plantilla) | variable de build | No |
| 13 | CTAs de ejemplo que apuntan a `ui.saastro.io` (`secondaryHref` en los bloques y en `content/pages/*`) | `content/pages/*` y bloques | No |

Antes de publicar, en el repo del site (se excluye `docs/`, que cita estos valores):

```
git grep -n "G-B2MVN4RSSH\|z7a7k9iubl\|2b771188\|34607768582\|ui.saastro.io" -- . ':!docs'
```

No debe devolver nada. El token de Cloudflare no se busca por valor: comprueba a ojo que `tracking.cloudflareWebAnalytics` y `analytics.cloudflareWebAnalytics.token` de `settings.yaml` están vacíos o son del cliente.

Nota del punto 7: `meta.siteName` solo gana a `site.name` con i18n activo.
