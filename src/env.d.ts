/// <reference path="../.astro/types.d.ts" />

// El contexto de ejecución de Cloudflare que el adaptador inyecta en
// `Astro.locals`. Se declara aquí porque `/mx/[kind].gif.ts` necesita
// `waitUntil`: en Workers una fetch que no se espera se cancela al salir la
// respuesta. Es `Partial` porque en `astro dev` (node) no hay runtime de
// Workers y la propiedad no existe.
//
// Se usa `cfContext`, no el `locals.runtime` de siempre: en @astrojs/cloudflare
// 12 `runtime` pasó a ser un getter DEPRECADO que ya no está en el tipo.
type CloudflareRuntime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
  interface Locals extends Partial<CloudflareRuntime> {
    /** Current locale (set by middleware when i18n is enabled) */
    lang: import('./i18n/config').Locale;
    /** Translations object for current locale */
    t: import('./i18n/types').Translations;
    /** Build locale-prefixed path: localePath('/about') → '/es/about' */
    localePath: (path: string) => string;
  }
}
