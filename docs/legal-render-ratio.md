# Declaración legal de la medición render-vs-JS (`data-legal="render-ratio"`)

Texto canónico para la política de cookies de un site con
`settings.measure.renderRatio: true`. Cópialo tal cual al markdown de la
política —**en todos los locales**— **antes** de encender el flag.

**Por qué existe este fichero.** Encender la medición añade un tratamiento
nuevo (tres peticiones por visita, registradas en el servidor) sin que nada
obligue a tocar el texto legal: la política se queda diciendo que no hay
seguimiento. El invariante **`medicion-legal`** (8d) de `pnpm studio:check`
cierra ese hueco y te manda aquí. Mismo mecanismo y mismo ancla explícita que
el beacon de Gen — ver `legal-gen-tracking.md`, que explica por qué el ancla es
un `<div data-legal="…">` y no un heading.

> **Una diferencia con 8c que conviene saber:** el invariante de Gen le
> pregunta al DOM servido; éste le pregunta a `settings.yaml` (y además al DOM).
> No es dejadez: el pixel solo vive en las landings de pago, que son
> `prerender = false` y por eso no entran en `studio-contract.json`. Un
> invariante que solo mirase el DOM no vería nunca el pixel y pasaría siempre.

## Qué hace realmente la medición (auditado sobre el código)

Auditado en `src/lib/render-ratio.ts`, `src/components/RenderRatio.astro`,
`src/pages/mx/[kind].gif.ts` y el `useEffect` de
`src/components/lp/LandingForm.tsx`.

| | |
|---|---|
| **Qué mide** | Cuántas visitas se quedan sin un formulario utilizable. Tres contadores: `r` (el navegador pintó la página), `j` (ejecutó JavaScript), `h` (montó la isla React del formulario). La resta `r − h` es la cifra que se busca. |
| **Cookies** | **Ninguna.** No se escribe ni se lee ninguna cookie; la respuesta del pixel no trae `Set-Cookie`. |
| **Almacenamiento en el dispositivo** | **Ninguno.** Ni cookies, ni `localStorage`, ni `sessionStorage`. A diferencia del beacon de Gen, aquí no hay ningún identificador de visitante: dos visitas de la misma persona son indistinguibles de dos visitas de personas distintas. |
| **Qué se envía en cada ping** | A una ruta del **propio dominio** (`/mx/r.gif`, `/mx/j.gif`, `/mx/h.gif`): la ruta de la página, el `utm_campaign` de la URL si lo hay, y un valor aleatorio `n=` que sirve **solo para que ninguna caché intermedia colapse dos visitas en una** — se descarta al recibirlo y no se guarda. Nada sale hacia un tercer dominio desde el navegador. |
| **Qué se guarda** | Una línea por evento con: tipo de contador, ruta, campaña, un booleano «parece un bot» y la marca de tiempo. Nada más. |
| **User-agent** | **Se lee, no se guarda.** Se usa en el momento para decidir si la petición parece un robot (un crawler pide el HTML y no ejecuta JS: sin ese filtro la cifra sería falsa). De ahí solo se conserva un sí/no. |
| **Dirección IP** | El código de la medición **no la lee ni la guarda**: no aparece en el evento. Lo que la plataforma registre por su cuenta de cualquier petición HTTP no lo fija este repo — ver el hueco `[PENDIENTE]` de abajo. |
| **Destinatario** | El propio site (su Worker). Con `measure.sink: "gen"` se reenvía además a SAASTRO Gen **desde el servidor**; el navegador nunca habla con `gen.saastro.io` por esta vía. |
| **Finalidad** | Decidir cuánto invertir en que los formularios funcionen sin JavaScript. Ninguna finalidad publicitaria ni de perfilado. |

## El texto — español

````markdown
## Medición de accesibilidad de los formularios

<div data-legal="render-ratio"></div>

Para saber a cuántos visitantes **no les llega a funcionar el formulario**
(porque su navegador no ejecuta JavaScript, o porque el código no llegó a
cargarse), esta página pide hasta tres imágenes de 1×1 píxel a **este mismo
sitio web**: una al mostrarse la página, otra si el navegador ejecuta
JavaScript y otra si el formulario llega a montarse.

**No utiliza cookies ni guarda nada en tu navegador**, y **no crea ningún
identificador de visitante**: no podemos saber si dos visitas son de la misma
persona.

De cada una de esas peticiones se registra únicamente:

- cuál de los tres momentos era;
- la dirección (ruta) de la página;
- el parámetro de campaña de la URL (`utm_campaign`), si lo hay;
- si el navegador se identifica como un robot (sí/no);
- la fecha y hora.

No se registra tu dirección IP ni tu navegador. El identificador aleatorio que
verás en la dirección de la imagen sirve solo para evitar que una memoria caché
cuente dos visitas como una, y se descarta al recibirlo.

- **Responsable del tratamiento:** [PENDIENTE: razón social, NIF, dirección y
  correo de contacto del titular del sitio]
- **Base jurídica:** [PENDIENTE: decidir consentimiento o interés legítimo]
- **Plazo de conservación:** [PENDIENTE: ver nota abajo]
- **Transferencias internacionales:** [PENDIENTE: confirmar dónde se procesan
  los datos y con qué garantías]
````

## El texto — inglés

````markdown
## Form accessibility measurement

<div data-legal="render-ratio"></div>

To find out how many visitors **never get a working form** (because their
browser does not run JavaScript, or because the code failed to load), this page
requests up to three 1×1 pixel images from **this same website**: one when the
page is displayed, one if the browser runs JavaScript, and one if the form
actually mounts.

**It uses no cookies and stores nothing in your browser**, and it **creates no
visitor identifier**: we cannot tell whether two visits come from the same
person.

For each of those requests we record only:

- which of the three moments it was;
- the page's path;
- the URL's campaign parameter (`utm_campaign`), if any;
- whether the browser identifies itself as a robot (yes/no);
- the date and time.

Your IP address and your browser are not recorded. The random value you may see
in the image's address exists only to stop a cache from counting two visits as
one, and is discarded on arrival.

- **Data controller:** [PENDIENTE: legal name, tax id, address and contact email
  of the site owner]
- **Legal basis:** [PENDIENTE: consent or legitimate interest]
- **Retention period:** [PENDIENTE: see the note below]
- **International transfers:** [PENDIENTE: confirm where data is processed and
  under which safeguards]
````

## Los huecos `[PENDIENTE: …]` — por qué siguen abiertos

| Hueco | Por qué no lo decide el código |
|---|---|
| Responsable del tratamiento | Es el titular del site, distinto en cada descendiente del theme. |
| Base jurídica | Es una calificación jurídica, no una propiedad del código. Que una medición sin cookies, sin almacenamiento en el dispositivo y sin identificador esté exenta de consentimiento (art. 22.2 LSSI / ePrivacy) es un juicio razonable, y **es exactamente por eso por lo que hay que pedirlo, no darlo por hecho**: la conclusión cómoda no es la comprobada. |
| Plazo de conservación | **Sin verificar, y no se firma sin verificarlo.** Con `sink: "log"` los eventos van a los logs del Worker y el plazo es el que aplique Cloudflare a esos logs — nadie de este repo lo ha comprobado. Con `sink: "gen"` sería el de Gen, que hoy **no acepta estos eventos**. Compruébalo antes de publicar el texto. |
| Transferencias internacionales | El código no fija región de procesamiento. |
| Qué registra la plataforma | La medición no toca la IP, pero cualquier petición HTTP la ve. Qué guarda Cloudflare de cada petición, y durante cuánto, no lo fija este repo y **no está comprobado aquí**. |

## Al encender la medición — checklist

1. Copia la sección de arriba al `cookies.md` de **cada locale**, con su ancla.
2. Rellena los `[PENDIENTE: …]`, empezando por el plazo de conservación, que
   exige mirar qué guarda de verdad el sumidero que hayas elegido.
3. Pon `settings.measure.renderRatio: true` (en este orden: el texto primero).
4. `pnpm studio:check` → verde.
