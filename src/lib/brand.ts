/**
 * brand.ts — la marca del site, resuelta en UN sitio.
 *
 * Antes el fallback `t.meta.siteName ?? settings.site.name ?? 'Saastro'`
 * vivía copiado en BaseLayout (og:site_name) y SiteLayout (footer), y el
 * Header no lo tenía: pintaba su default 'Saastro' y los logos de
 * `src/assets/brand/` no los usaba nadie. Header, Footer y BaseLayout
 * leen de aquí; sus props siguen valiendo como override.
 */
import type { ImageMetadata } from 'astro';
import { i18nConfig } from '../i18n/config';
import { getSettings } from './settings';

/** `meta.siteName` del locale (editable en el Hub) → `settings.site.name` → 'Saastro'. */
export function resolveSiteName(locals: App.Locals): string {
  return (
    (i18nConfig.enabled ? locals.t?.meta?.siteName : undefined) ??
    getSettings().site.name ??
    'Saastro'
  );
}

/** `nav.contact` del locale → 'Contact'. Mismo criterio que resolveSiteName. */
export function resolveContactLabel(locals: App.Locals): string {
  return (i18nConfig.enabled ? locals.t?.nav?.contact : undefined) ?? 'Contact';
}

// Glob y no import: un site que borre uno de los dos logos sigue construyendo
// (el Logo cae al monograma si no hay ninguno, y al claro si falta el oscuro).
const brandLogos = import.meta.glob<ImageMetadata>('../assets/brand/logo-{light,dark}.svg', {
  eager: true,
  import: 'default',
});

/** URLs de los logos del site (`src/assets/brand/logo-light.svg` / `logo-dark.svg`). */
export const brandLogo = {
  light: brandLogos['../assets/brand/logo-light.svg']?.src,
  dark: brandLogos['../assets/brand/logo-dark.svg']?.src,
};
