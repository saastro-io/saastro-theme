import { HubForm, parseGlobModules } from '@saastro/forms';
import type { LandingNotConfiguredCopy } from '@/lib/landings';

// Same wiring as the ContactSheet: <HubForm> renders a form DESIGNED IN THE HUB
// (fetched by slug at runtime) through the host's shadcn primitives, resolved by
// name from a flat registry. The glob path must stay relative — import.meta.glob
// does not expand the `@` alias inside its pattern and would return {} → "Missing
// UI Components". From this file, ../ui/*.tsx is src/components/ui.
const uiComponents = parseGlobModules(import.meta.glob('../ui/*.tsx', { eager: true }));

// Override the ingestion base for local E2E (points HubForm at the local hub):
//   PUBLIC_HUB_URL=http://submit.saastro.test:4905/v1 pnpm dev
const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string | undefined;

interface LandingFormProps {
  /** Hub site id from settings.yaml. Empty ⇒ no lead destination. */
  siteId: string;
  /** The Hub form slug this landing renders (the entry's `form` field). */
  formSlug: string;
  locale: string;
  /** Localized placeholder copy (i18n `lp.notConfigured`) shown when siteId is empty. */
  notConfigured: LandingNotConfiguredCopy;
}

/**
 * A landing page's lead-capture form. Unlike bespoke wizards that live in code,
 * a landing form is simple capture the client owns entirely: they draw it in
 * the Hub and reference it by slug. This component is only the seam that
 * renders that Hub form on the page. When no Hub site is connected it announces
 * itself instead of pretending to work — no data is sent or stored.
 */
export function LandingForm({ siteId, formSlug, locale, notConfigured }: LandingFormProps) {
  if (!siteId) {
    return (
      <div className="rounded-2xl border border-dashed border-foreground/40 bg-card p-5">
        <p className="mb-2 font-heading text-base font-bold text-foreground">{notConfigured.title}</p>
        <p className="mb-2 text-sm leading-relaxed text-muted-foreground">{notConfigured.body}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{notConfigured.hint}</p>
      </div>
    );
  }

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
