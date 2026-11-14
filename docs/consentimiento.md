# Consentimiento, cookies y almacenamiento en el dispositivo

> **Para qué sirve esta página.** Es el mapa de cómo el theme trata el consentimiento:
> qué carga y cuándo, qué deja en el dispositivo del visitante, quién lo decide y dónde
> está cada texto legal. Cada pieza tiene su propio documento; aquí se enlazan.
>
> **Qué NO es.** No es asesoramiento legal. Describe lo que hace el código (medido o leído
> en el repo, con fecha) y marca como **decisión pendiente** o **SIN VERIFICAR** lo que
> es una calificación jurídica. Las lecturas de ley que aparecen (art. 22.2 LSSI,
> art. 5.3 ePrivacy, guía de la AEPD, CNIL, CEPD) son interpretación de este proyecto y
> no las ha confirmado un asesor.

Estado de lo medido: 14-nov-2026, sobre `main` del theme y el repo del Hub.

## La regla

**Nada toca el dispositivo del visitante ni contacta con un tercero antes de que acepte
la categoría que lo cubre, salvo lo que está exento por ley.** Hoy el catálogo no tiene
ningún proveedor exento. Si algún día hay que exentar algo, se hace con
`category: "none"` más un `exemptReason` escrito en `src/lib/tracking-providers.json`, y
el motivo tiene que aguantar una lectura jurídica: no se exenta «porque es poco».

**Qué la hace cumplir y qué no.** `pnpm studio:check` solo exige que la política
**declare** cada tratamiento (ver [El contrato](#el-contrato-lo-que-falla-solo)). **No
comprueba que un script no cargue antes del consentimiento**: eso lo garantizan el código
(`Analytics.astro`, `GenTracking.astro`) y sus tests, y se verifica a mano en un navegador
limpio ([Cómo comprobarlo tú](#cómo-comprobarlo-tú)).

## Qué hay en el dispositivo y por qué

| Qué | Dónde | Quién lo escribe | Cuándo | Consentimiento |
|---|---|---|---|---|
| `cookie_consent` | cookie, 1 año | el banner (`CookieBanner.tsx` → `cookies.ts`) | al decidir el visitante | Esencial: guarda su propia decisión. Lleva `providers`, la **versión** del consentimiento |
| `gen-consent` = `granted` | `localStorage` | `mirrorGenConsent` (`src/lib/gen-consent.ts`) | al aceptar `analytics`; se borra al retirarla | Espejo de `analytics` para el beacon de Gen |
| `gen-visitor-id` | `sessionStorage` | `GenTracking.astro` | tras aceptar `analytics`; se borra al retirar | `analytics` |
| `gen_visitor_id` | campo oculto en cada `<form>` | `GenTracking.astro` | tras aceptar `analytics`; se quita al retirar | `analytics` |
| `saastro_landing_page`, `saastro_first_referrer` | `sessionStorage` | `@saastro/forms` ≥ 0.28 (claves en `utils/deviceStorage.ts` de la librería) | según el changelog de 0.28.0, solo tras conceder el propósito `attribution`; antes viven en memoria | `analytics`: `src/lib/forms-consent.ts` mapea `attribution` y `enrichment` a `analytics`. El comportamiento de la librería está **leído en su changelog y código, no probado en un navegador** |
| `theme` | `localStorage` | `ApplyColorMode.astro` | **solo** cuando el visitante pulsa el interruptor de tema | No se guarda nada por defecto. Se trata como preferencia pedida expresamente: lectura del theme, **SIN VERIFICAR** por un asesor |
| `_ga`, `_ga_*`, `_clck`, `_clsk`… | cookies de terceros | GA4, Clarity | tras aceptar su categoría | `analytics` |
| Meta, TikTok, LinkedIn, Google Ads | scripts de terceros | `Analytics.astro` | tras aceptar `marketing` | `marketing` |
| Cloudflare Web Analytics (beacon) | petición a un tercero | `Analytics.astro` | tras aceptar `analytics` | `analytics` (antes de 13-nov-2026 cargaba sin consentimiento por una decisión que nunca se verificó; ver `docs/legal-marketing.md`) |
| `cf_clearance` | cookie en `*.saastro.io` | **Cloudflare, en el borde**, no el theme | en cuanto la zona tiene Bot Fight Mode / JavaScript Detections activos | Declarada esencial en la política. **Es una interpretación**, ver [Decisiones pendientes](#decisiones-pendientes-y-lo-que-no-está-verificado) |

Formularios con Turnstile (antibots): desde `@saastro/forms` 0.29.0 el script y el widget
de Cloudflare cargan en la **primera interacción** del visitante con el formulario o, a
más tardar, al enviar (`loadOn: 'interaction'`, el valor por defecto; `'mount'` restaura el
comportamiento anterior). La configuración del plugin la sirve el formulario, no el
theme. **No se ha comprobado en un navegador** con un formulario real: `theme.saastro.io`
aún no tiene formulario conectado al Hub.

## El flujo: de la decisión del visitante a cada consumidor

```
visitante decide en el banner
   └─ save() en CookieBanner.tsx
        ├─ setConsent(prefs, trackingKeys)   → cookie `cookie_consent` (con `providers`)
        ├─ mirrorGenConsent(analytics)       → localStorage['gen-consent'] + evento `gen:consent-granted`
        ├─ evento `cookie-consent-updated`   → GenTracking (revalida), forms-consent (fromCookie)
        ├─ revocación: borra las cookies de los trackers retirados (`clearTrackerCookies`)
        └─ revocación con un tracker ya cargado: recarga la página
```

Quién lee qué:

| Consumidor | Lee | Regla |
|---|---|---|
| `Analytics.astro` | cookie `cookie_consent` | Carga cada proveedor solo si su categoría está aceptada **y** el consentimiento cubre los proveedores de hoy (`consentCovers`). Consent Mode v2 para Google |
| `GenTracking.astro` | `gen-consent` **y** la cookie | Necesita `gen-consent = granted` **y** `analytics === true` en la cookie **y** que la cookie cubra los proveedores (`consentCovers`). Retirar borra el id y los campos ocultos |
| `src/lib/forms-consent.ts` | la cookie (`fromCookie`) | `attribution` y `enrichment` de `@saastro/forms` cuelgan de `analytics` |

**La versión del consentimiento.** La cookie guarda la lista `providers` de los proveedores
que estaban encendidos cuando el visitante consintió. Si hoy hay un proveedor que no está
en esa lista, el visitante no consintió ese tratamiento: se le vuelve a preguntar. Una
cookie anterior a este campo con algún proveedor encendido tampoco vale. Fuente única de
la regla: `consentCovers` en `src/lib/cookies.ts`; `Analytics.astro` y `GenTracking.astro`
llevan una réplica inline, y los tests las ejecutan contra la función pura.

**El catálogo es único.** `src/lib/tracking-providers.json` define cada proveedor
(categoría, marcador, `exemptReason` si lo hubiera). Lo leen el resolutor
(`tracking.ts`), el cargador, la configuración efectiva que lee el Hub
(`/saastro-tracking.json`) y el contrato. Detalle en [guia-pixeles.md](guia-pixeles.md).

## Gen: el valor por defecto y lo que heredan los sites

`settings.gen.consent` vale `"required"` por defecto desde el 13-nov-2026
(saastro-theme#148): el beacon no hace nada hasta que el visitante acepta `analytics`.
Solo un `"none"` escrito a propósito se salta el banner; cualquier otro valor, o su
ausencia, es `"required"`. Texto legal y comportamiento: [legal-gen-tracking.md](legal-gen-tracking.md).

**Cuidado con los sites que descienden del theme.** `src/data/settings.yaml` está marcado
`merge=ours` en `.gitattributes`: al hacer `git merge upstream/main` el site **conserva su
propio** `settings.yaml`. Un site que heredó `consent: "none"` sigue con `"none"` aunque el
theme haya cambiado el defecto. Y el Hub **no corrige eso**: al provisionar escribe solo
`gen.workspaceId` y `gen.vertical` (`apps/hub-react/src/server/lib/gen-config.ts` del Hub),
nunca `gen.consent`. Puede haber descendientes con `consent: "none"` y un `workspaceId` puesto: si lo tienen
desplegado, miden antes del banner. **No se listan aquí** (el repo es público): hay que
medirlo site a site, en su `main` y en producción, no en una copia local.

## El contrato: lo que falla solo

`pnpm studio:check` (y la CI) verifica, sobre el DOM construido o sobre `settings.yaml`:

| Invariante | Qué comprueba | Texto que exige |
|---|---|---|
| `gen-legal` (8c) | Si el beacon de Gen está encendido, la política lo declara | [legal-gen-tracking.md](legal-gen-tracking.md) |
| `medicion-legal` (8d) | Si `measure.renderRatio` está encendido (o el pixel está en el DOM), la política lo declara. Mira `settings.yaml`, no solo el DOM | [legal-render-ratio.md](legal-render-ratio.md) |
| `tracking-legal` (8e) | Cada proveedor encendido (en `settings.tracking.*` o en el frontmatter de una landing) tiene su ancla `data-legal="tracking-…"` en la política | [legal-marketing.md](legal-marketing.md) |
| `legal-texto` (13b) | Hash del párrafo bajo cada ancla `data-legal`: avisa cuando el texto legal cambia. Con `STUDIO_LEGAL_STRICT=1` falla en vez de avisar | [legal-marketing.md](legal-marketing.md), sección del contrato |

Lo que el contrato **no** puede verificar: que el texto sea jurídicamente correcto, que el
texto publicado en el Hub coincida con el del repo, ni lo que Cloudflare o un tercero
escriben por su cuenta (p. ej. `cf_clearance`).

## Dónde viven los textos legales

- **Repo:** `src/content/legal/{es,en}/cookies.md` (y privacidad y términos). Son plantilla,
  sin responsable del tratamiento ni datos de contacto: **requieren revisión legal antes
  de publicar** ([nuevo-site-checklist.md](nuevo-site-checklist.md), fila 11).
- **Hub:** el Centro Legal guarda la política publicada de cada site. El Hub comprueba qué
  anclas `data-legal` lleva la política **publicada** y avisa de las que faltan
  (`tracking-route.ts` del Hub); el texto lo escribe una persona, no el Hub.
- **Textos canónicos para copiar:** `docs/legal-gen-tracking.md`, `docs/legal-render-ratio.md`,
  `docs/legal-marketing.md` (secciones por proveedor, incluida Cloudflare Web Analytics).
- **SIN VERIFICAR:** cómo llega al site el texto que se publica en el Centro Legal (si el
  site lo lee en runtime o hay que copiarlo al repo). El contrato solo ve lo que sirve el
  site.

## Decisiones pendientes y lo que no está verificado

| Tema | Estado | Quién decide | Nota |
|---|---|---|---|
| **Render-ratio** (`measure.renderRatio`) | **Apagado** (`false`, el valor por defecto). No se enciende hasta decidir la base jurídica | JC y su asesor | No toca el dispositivo ni lleva identificador, pero la calificación jurídica no es una propiedad del código. Texto con `[PENDIENTE]` en [legal-render-ratio.md](legal-render-ratio.md) |
| **`cf_clearance`** | Declarada esencial en la política (saastro-theme#153). **Interpretación**, no certeza | JC y su asesor | A favor: Cloudflare la declara «strictly necessary»; la guía AEPD 2024 y la FAQ 17 de la CNIL (29-abr-2026) admiten seguridad. En contra: sin resolución AEPD; confianza media-baja para JSD en todas las visitas; Cloudflare trata algunas señales de Turnstile como responsable propio. La salida limpia es apagar Bot Fight Mode y las detecciones JS de la zona (la API exige apagar las dos). Detalle en [legal-marketing.md](legal-marketing.md) |
| **Turnstile al interactuar** | En `@saastro/forms` 0.29.0 y en el theme (#156) | — | Sin comprobar en navegador con un formulario real |
| **Descendientes con `consent: "none"`** | Pendiente de medir y corregir site a site | JC | Ver la sección de Gen |
| **Textos legales** | Plantilla con `[PENDIENTE]`: responsable, transferencias, plazos | JC y su asesor | Base jurídica de Gen, Gen como encargado, AEPD solo España, párrafo de Cloudflare: lecturas del proyecto, **SIN VERIFICAR** |
| **Estado de Cloudflare en el DPF** | No verificado contra el registro oficial | JC y su asesor | Hay que comprobarlo antes de cerrar la política de transferencias |

## Cómo comprobarlo tú

1. **Navegador limpio, antes de tocar el banner.** DevTools → Application: cookies,
   `localStorage`, `sessionStorage`. **`document.cookie` vacío no basta**: hay cookies
   que JavaScript no ve (`HttpOnly`) y otras con partición. Mira también la pestaña Network:
   no debe haber peticiones a `gen.saastro.io`, `static.cloudflareinsights.com`,
   `googletagmanager.com` ni `challenges.cloudflare.com` hasta aceptar.
2. **Aceptar `analytics`:** debe aparecer `gen-consent`, `gen-visitor-id` y la primera
   petición a Gen.
3. **Retirar el consentimiento:** el id y los campos `gen_visitor_id` desaparecen, y la
   página se recarga si había un tracker vivo.
4. **Lo que sirve producción:** `curl https://<site>/health.json` devuelve el sha del
   build (ver [conexion-hub.md](conexion-hub.md)).
5. **Contrato:** `pnpm studio:check`.
