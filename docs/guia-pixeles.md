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
   (ancla `data-legal="tracking-<proveedor>"`, ver `docs/legal-marketing.md`), también si solo lo enciende una landing. Si
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
  consentimiento; Cloudflare Web Analytics, exento, no se toca desde una landing.
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
