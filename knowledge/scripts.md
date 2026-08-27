# scripts — las dos puertas que hay que pasar

Herramientas del repo. Dos de ellas son puertas de verdad, no ayudas:

- **`ui-check.mjs` / `ui-sync.mjs`** — comparan las primitivas locales
  contra el registry de `saastro-ui` y las bajan. Modelo copy-in: **una
  primitiva editada a mano se pierde en el siguiente sync**. Si algo falta
  en el registry, se sube allí y se vuelve a bajar; no se parchea la copia.
- **`studio-check.mjs` / `studio-contract-check.mjs`** — verifican el
  contrato de Studio **sobre el DOM construido**, no sobre el código. Es lo
  único que caza que una sección haya dejado de ser editable en el Hub: un
  `.map()` en el adaptador de un bloque pasa el build y lo tumba esta
  puerta. Correrla antes de dar nada por bueno.
- `gen-favicons.mjs` — genera los favicons de un site.

Los dos checks corren en CI; `lib/` son sus utilidades compartidas.
