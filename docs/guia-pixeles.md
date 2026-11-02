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
2. **Nada carga sin consentimiento, salvo el proveedor exento.** Los ids se ponen y
   el banner decide (ver la categoría de cada proveedor abajo). La única excepción
   es Cloudflare Web Analytics (categoría `none`, su sección está más abajo): carga
   sin esperar al banner, por una exención escrita con su motivo en el catálogo.
3. **Encender un proveedor exige nombrarlo en la política de cookies**
   (ancla `data-legal="tracking-<proveedor>"`, ver `docs/legal-marketing.md`). Si
   no, `pnpm studio:check` se pone rojo. El texto lo aprueba el responsable del site.
   El proveedor exento no exige ancla (excepción explícita del catálogo).

**Un id con formato inválido no se inyecta nunca**: se descarta con un aviso en el
build. Un id **numérico sin comillas** en el YAML (`metaPixel: 1234567890`) también
se descarta: entrecomíllalo.

## Dónde se pone

- **En el Hub:** Site → Settings → tarjeta **Tracking**. Vacío = apagado.
- **A mano:** `src/data/settings.yaml`, bloque `tracking:`.
- **En el `settings.yaml` del propio theme solo van los ids de `theme.saastro.io`**
  (los escribe el Hub). Los ids de un cliente o de otro site **nunca** se ponen ahí.
  Los descendientes se protegen con `merge=ours` (ver el `.gitattributes`): un site que
  ya editó su `settings.yaml` conserva el suyo al traer el theme. Revisa ese diff en el
  primer merge de cada site.

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

## Cloudflare Web Analytics · `cloudflareWebAnalytics` · categoría `none` (exento de consentimiento)

- **Id:** el *token del beacon*, 32 caracteres hexadecimales (patrón `^[0-9a-fA-F]{32}$`).
  No es el *site tag* de la API GraphQL: es el token que va en `data-cf-beacon`.
- **Cuenta necesaria:** una cuenta de Cloudflare. Gratis.
- **Dónde se pone:** `tracking.cloudflareWebAnalytics`. La ruta antigua
  `analytics.cloudflareWebAnalytics.token` **se sigue leyendo** como respaldo (hay
  descendientes y el Hub la escribe todavía); si existen las dos, **gana
  `tracking.cloudflareWebAnalytics`**, aunque su valor sea inválido (entonces se
  descarta con aviso y NO se cae a la antigua en silencio).
- **Cookies propias del site:** ninguna prevista en el catálogo (SIN VERIFICAR).
- **Consentimiento: exento, y es una decisión escrita, no un olvido.** El motivo
  literal está en `exemptReason` del catálogo. Consecuencias: carga sin esperar al
  banner, no cuenta en «si hay un proveedor nuevo, volver a preguntar», retirar el
  consentimiento no recarga la página por él y no recibe `window.saastroTrack`.
  Sigue sin cargar en una vista previa de borrador y en `localhost`/`*.saastro.io`
  (salvo el host propio del site). **SIN VERIFICAR** contra la documentación
  vigente de Cloudflare que el beacon no use almacenamiento ni identifique al
  visitante; la valoración legal y, si hace falta, el texto, son del responsable del site.
- **Política de cookies:** el invariante 8e **no exige ancla** por este proveedor
  (`docs/legal-marketing.md`, última sección).
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

## Diseño propuesto (NO implementado): override de tracking por landing

> Es el diseño del siguiente PR. Hoy ninguna landing puede cambiar los píxeles: son
> los del site. Aquí solo se fija la forma para discutirla antes de escribir código.

**Para qué:** una landing de campaña necesita su propio píxel de Meta o su propia
cuenta y etiqueta de Google Ads sin tocar los del resto del site.

**Forma** (frontmatter de la landing, solo cadenas, como todo lo que escribe el Hub):

```yaml
tracking:
  mode: add            # add (por defecto) | replace
  metaPixel: "1234567890123"
  googleAds: "AW-123456789"
  googleAdsConversionLabel: "AbCdEfGhIj_k"
```

- Las claves son las del catálogo (`ga4`, `gtm`, `googleAds`, `googleAdsConversionLabel`,
  `metaPixel`, `tiktokPixel`, `linkedinPartnerId`, `clarity`) y los valores admiten
  listas, con la **misma** validación, el mismo tope y los mismos avisos que en
  `settings.tracking`. Una clave desconocida se descarta con aviso. Cloudflare Web
  Analytics **no** se puede sobrescribir por landing (es del site).
- **`mode: add` (suma):** los ids de la landing se añaden a los del site, sin
  repetir y con el tope de 5 sobre la **suma**. La etiqueta de conversión se
  empareja por posición con la lista **ya sumada**.
- **`mode: replace` (sustituye):** para cada clave presente, los ids de la landing
  **reemplazan** a los del site; una clave presente y **vacía** (`""`) apaga ese
  proveedor en esa landing; una clave ausente hereda la del site.
- `noindex` (vista previa) lo sigue apagando todo.

**Lo que hay que resolver en el PR (decisiones, no huecos):**

1. **Consentimiento.** Si la landing enciende un proveedor que el site no tiene, la
   versión del consentimiento (`consentKeys`) es distinta en esa página: quien ya
   consintió en el resto del site vería el banner de nuevo **solo ahí**. Es lo
   correcto (no consintió ese tratamiento) y debe quedar probado.
2. **Invariante `tracking-legal` (8e).** Hoy solo lee `settings.yaml`. Con overrides
   tendrá que leer también el frontmatter de las landings **publicadas**; si no, un
   proveedor encendido solo en una landing no exigiría ancla. Sin ese cambio el
   override no se puede activar.
3. **Dónde se resuelve.** Una función pura nueva (`resolveTracking(settings, { noindex,
   landing })`) con tests en `src/lib`, y `BaseLayout`/`SiteLayout` pasando el
   frontmatter. El esquema de la colección vive en `src/content.config.ts`, que está
   en la lista de ficheros de arquitectura (`studio:contract:update`).
4. **El Hub.** Hay que comprobar que su editor de landings preserva un bloque
   `tracking:` anidado (hoy solo escribe cadenas planas); si no, el modo y las claves
   se aplanan a `tracking_mode`, `tracking_metaPixel`… y hay que fijarlo antes.

---

## Después de poner los ids

1. **Comprobar en un navegador real:** sin aceptar no sale ninguna petición al
   proveedor; al aceptar sí; al retirar el consentimiento dejan de cargar y se borran
   sus cookies propias.
2. **Política de cookies:** añadir la sección de cada proveedor encendido
   (`docs/legal-marketing.md`), en todos los idiomas. Texto del responsable del site.
3. **`pnpm studio:check`** en verde.
