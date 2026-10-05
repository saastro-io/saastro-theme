/**
 * RequestSiteForm — el formulario «Request your site» de la home, en línea.
 *
 * Es el MISMO HubForm que el panel de contacto (`ContactSheet`): mismo
 * `forms.siteId`, mismo `forms.contactFormSlug` de `settings.yaml`, mismo
 * registro de primitivas. No hay un `<form>` propio: los leads van por el Hub.
 * Solo se monta si hay `siteId`; sin él, `RequestSite.astro` pinta un aviso.
 */
import { HubForm, parseGlobModules } from '@saastro/forms';
import type { Locale } from '@/i18n/config';

// Ruta RELATIVA a propósito: `import.meta.glob` no resuelve el alias `@`
// (ver la nota en ContactSheet.tsx).
const uiComponents = parseGlobModules(import.meta.glob('../ui/*.tsx', { eager: true }));

const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string | undefined;

interface Props {
  locale: Locale;
  siteId: string;
  formSlug: string;
}

export function RequestSiteForm({ locale, siteId, formSlug }: Props) {
  return (
    <HubForm
      {...(HUB_URL ? { hubUrl: HUB_URL } : {})}
      siteId={siteId}
      formSlug={formSlug}
      locale={locale}
      formProps={{ components: uiComponents }}
    />
  );
}
