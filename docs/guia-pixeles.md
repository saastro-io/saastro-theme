# Guía de píxeles: dónde conseguir cada id y dónde se pone

Para quien monta un site y necesita el id de un proveedor de medición o anuncios.
Cada proveedor es una clave de `tracking:` en `src/data/settings.yaml` (o un campo
de la tarjeta **Tracking** del Hub, que escribe esa misma clave). El catálogo con
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
   categoría de cada proveedor abajo).
3. **Encender un proveedor exige nombrarlo en la política de cookies**
   (ancla `data-legal="tracking-<proveedor>"`, ver `docs/legal-marketing.md`). Si
   no, `pnpm studio:check` se pone rojo. El texto lo aprueba el responsable del site.

**Un id con formato inválido no se inyecta nunca**: se descarta con un aviso en el
build. Un id **numérico sin comillas** en el YAML (`metaPixel: 1234567890`) también
se descarta: entrecomíllalo.

## Dónde se pone

- **En el Hub:** Site → Settings → tarjeta **Tracking**. Vacío = apagado.
- **A mano:** `src/data/settings.yaml`, bloque `tracking:`.
- **No** en el `settings.yaml` del propio **theme** (la plantilla): lo heredarían
  los descendientes. Ahí van vacíos.

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

- **Id:** 10 caracteres en minúscula y dígitos (patrón `^[a-z0-9]{8,12}$`), p. ej. `z7a7k9iubl`.
- **Cuenta necesaria:** Microsoft, Google o Facebook. Gratis.
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
  cualquiera de las dos categorías; Consent Mode limita lo que cada etiqueta puede hacer.
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

---

## Después de poner los ids

1. **Comprobar en un navegador real:** sin aceptar no sale ninguna petición al
   proveedor; al aceptar sí; al retirar el consentimiento dejan de cargar y se borran
   sus cookies propias.
2. **Política de cookies:** añadir la sección de cada proveedor encendido
   (`docs/legal-marketing.md`), en todos los idiomas. Texto del responsable del site.
3. **`pnpm studio:check`** en verde.
