# Cómo se conecta un site con el Hub

> **Para qué sirve.** Qué hace el Hub con un site que nace del theme: qué escribe en el
> repo, qué lee del site desplegado, qué texto legal gobierna cada uno y qué **no** hace.
> El pipeline para crear un site está en [pipeline.md](pipeline.md); el deploy, en
> [deploy.md](deploy.md); el consentimiento, en [consentimiento.md](consentimiento.md).
>
> **De dónde sale cada afirmación.** Lo del lado del theme está leído en este repo. Lo del
> lado del Hub está leído en el repo `saastro-hub` el 14-nov-2026 (se cita el fichero del
> Hub entre paréntesis). **No se ha ejecutado nada contra el Hub en producción** para
> escribir esta página: si el Hub cambia, la fuente manda.

## El ciclo de vida

```
1. Crear         pnpm scaffold client … (desde el repo del Hub)
                 clona el theme CON historia y deja el remote `upstream`
2. Provisionar   el Hub escribe en `src/data/settings.yaml` (ver abajo)
3. Deploy        el Hub conecta Cloudflare Workers Builds al repo: cada push a `main` construye y despliega
4. Conectar      en el Hub, «Connect existing» sobre el site desplegado
5. Operar        el Hub lee el site desplegado y escribe en el repo desde sus tarjetas
```

Un site creado con «Use this template» de GitHub **no entra en este ciclo**: no comparte
historia con el theme y nunca podrá `git merge upstream/main`. Siempre `pnpm scaffold client`.

## Qué escribe el Hub en el repo del site

Todo en `src/data/settings.yaml`, declarado en `saastro.template.json`
(`siteIdTarget`, `genTarget`):

| Clave | Quién la escribe | Nota |
|---|---|---|
| `forms.siteId` | El aprovisionamiento | Es el id del site en el Hub. La plantilla trae el del propio theme: un site nuevo tiene que cambiarlo (lo hace el Hub) |
| `gen.workspaceId`, `gen.vertical` | La tarjeta «Gen tracking» del Hub (`gen-config.ts` del Hub) | Un `workspaceId` vacío es «apagado» |
| `tracking.*` (GA4, GTM, Clarity, Meta, TikTok, LinkedIn, Google Ads, Cloudflare Web Analytics) | La tarjeta **Tracking** del Hub | Las variables de build `PUBLIC_TRACKING_*` **ganan** sobre estos valores y no están en el repo |

### Lo que el Hub NO escribe

- **`gen.consent`.** Nunca. El valor lo decide el `settings.yaml` del site: `"required"` si
  es nuevo; el que hubiera si es un descendiente, porque `settings.yaml` es `merge=ours`.
  Un site que heredó `"none"` sigue midiendo antes del banner y el Hub no lo corrige.
  Ver [consentimiento.md](consentimiento.md#gen-el-valor-por-defecto-y-lo-que-heredan-los-sites).
- **`measure.*`** (render-ratio). No aparece en el código del Hub (no hay ninguna coincidencia
  fuera de tests). Se enciende a mano en `settings.yaml`, y el contrato `medicion-legal` exige
  entonces el texto en la política.
- **El consentimiento ni el banner.** Es del theme.

## Qué lee el Hub del site desplegado

| Qué | Cómo | Para qué |
|---|---|---|
| `/saastro-tracking.json` | `GET` desde el servidor del Hub (`tracking-desplegado.ts`) | Saber qué píxeles mide **de verdad** el site, incluidas las variables de build que no están en el repo. Contrato en [guia-pixeles.md](guia-pixeles.md) («Configuración efectiva») |

Cómo lo lee, para que el theme no rompa el contrato: solo `https` y host público; no sigue
redirecciones a otro host (las del mismo host sí, con tope de dos); timeout corto y 64 KB
máximo; valida el cuerpo con un esquema. **Fichero ausente, ilegible o de otra forma ⇒
«sin información»**, nunca «no hay píxeles»: no saber no es apagado. Por eso este fichero es
parte del contrato del theme: cambiarle la forma sin avisar al Hub deja al site «sin
información».

### `/health.json`: qué commit sirve el site

Desde saastro-theme#155 el site publica `/health.json` con `{ "sha": "<40 hex>", "branch": "…" }`,
sin caché (`Cache-Control: no-store`). Es el sha del **build**, que Workers Builds inyecta como
`WORKERS_CI_COMMIT_SHA`; `astro.config.mjs` lo convierte en constante (el código
prerenderizado corre en workerd y no ve `process.env`). Sin esa variable (dev, build a
mano) salen `null`: no se inventa un sha.

- Sirve para **medir** qué corre en producción (mergeado no es desplegado):
  `curl https://<site>/health.json` y comparar con el commit mergeado.
- **El Hub no lo lee hoy** (no hay ninguna referencia en su código). Es para humanos y
  para comprobaciones desde fuera.
- Un descendiente lo recibe al mergear el theme, pero su `astro.config.mjs` cambia: tras el
  merge hay que correr `pnpm studio:contract:update` por el hash de ese fichero.

## Formularios

- El theme trae un formulario por defecto: `defaultForms: [{ slug: "contact" }]`, que
  renderiza el `ContactSheet` con `forms.contactFormSlug` y `forms.siteId`.
- Se envía a `submit.saastro.io` (permitido en la CSP: `src/lib/security-headers.ts`).
- La **configuración del formulario** (campos, plugins como Turnstile) vive en el Hub y la
  sirve el formulario; el theme no la define.
- El consentimiento de `@saastro/forms` se cablea una vez en `src/lib/forms-consent.ts`
  (`setConsent(fromCookie(...))`): atribución y enriquecimiento cuelgan de `analytics`.
- Desde `@saastro/forms` 0.29.0, Turnstile carga al interactuar con el formulario, no al
  montar. Sin comprobar todavía en un navegador con un formulario real.

## Texto legal y Hub

- La política publicada de cada site vive en el **Centro Legal** del Hub. El Hub lee qué
  anclas `data-legal` lleva la política publicada (`tracking-route.ts` del Hub) y avisa de
  las que faltan cuando se enciende un proveedor. **El texto lo escribe una persona**; el
  Hub no lo redacta ni lo publica por su cuenta.
- El repo trae su propia política en `src/content/legal/**` y el contrato la comprueba en
  el DOM construido.
- **SIN VERIFICAR:** si el texto publicado en el Centro Legal llega al site en runtime o
  hay que copiarlo al repo. Mientras no se sepa, el contrato solo garantiza lo que sirve el
  site, y el Centro Legal solo lo que tiene publicado: **pueden diferir**.

## Deploy

Detalle en [deploy.md](deploy.md). En una línea: el Hub conecta el repo a Workers Builds con
sus credenciales; cada push a `main` despliega, y **no hay token de Cloudflare en el repo**
ni `deploy.yml`. La CI del repo solo corre `pnpm studio:check`.

## Qué comprobar tras conectar un site

1. `curl https://<site>/health.json` → el sha es el del commit que esperas.
2. `curl https://<site>/saastro-tracking.json` → el Hub podrá leerlo (responde 200 con JSON).
3. En el Hub, la política publicada lleva las anclas `data-legal` de los proveedores
   encendidos (el propio Hub avisa).
4. `forms.siteId` ya no es el del theme.
5. `gen.consent` del site es `"required"` o está ausente. Si dice `"none"`, el site mide
   antes del banner ([consentimiento.md](consentimiento.md)).
6. Navegador limpio antes del banner: sin cookies de terceros ni peticiones a los píxeles
   (guía en [consentimiento.md](consentimiento.md#cómo-comprobarlo-tú)).
