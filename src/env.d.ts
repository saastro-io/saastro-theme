/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Current locale (set by middleware when i18n is enabled) */
    lang: import('./i18n/config').Locale;
    /** Translations object for current locale */
    t: import('./i18n/types').Translations;
    /** Build locale-prefixed path: localePath('/about') → '/es/about' */
    localePath: (path: string) => string;
  }
}
