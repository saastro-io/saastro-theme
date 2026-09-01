import { useEffect } from 'react';
import { HubForm, parseGlobModules } from '@saastro/forms';
import type { LandingNotConfiguredCopy } from '@/lib/lp';

declare global {
  interface Window {
    /** Ping de medición que instala RenderRatio.astro. Ausente = medición apagada. */
    __mx?: (kind: string) => void;
  }
}

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
  /**
   * The form schema, already fetched on the server by the route (see
   * `@/lib/hub-form-schema`). Passing it makes HubForm render on its FIRST
   * paint, so the form is in the SSR'd HTML rather than a "Loading…" fallback
   * that only resolves once JS runs. `null` ⇒ the prefetch failed, and HubForm
   * fetches in the browser exactly as it did before.
   */
  initialSchema?: unknown;
}

/**
 * A landing page's lead-capture form. Unlike bespoke wizards that live in code,
 * a landing form is simple capture the client owns entirely: they draw it in
 * the Hub and reference it by slug. This component is only the seam that
 * renders that Hub form on the page. When no Hub site is connected it announces
 * itself instead of pretending to work — no data is sent or stored.
 */
export function LandingForm({ siteId, formSlug, locale, notConfigured, initialSchema }: LandingFormProps) {
  // `h` — el tercer contador de la medición render-vs-JS. Este efecto solo
  // corre si el bundle de React se descargó, se parseó y montó la isla, que es
  // exactamente lo que distingue «el visitante tiene JS» de «al visitante le
  // funciona el formulario». La diferencia entre los dos es la mayoría de los
  // casos (en el estudio de GOV.UK, 8 de cada 9 no eran JS desactivado sino JS
  // que falló) y es lo que decide cuánto vale el envío nativo.
  // Ojo: mide que la ISLA montó, no que el formulario tenga campos pintados.
  // No se puede llamar condicionalmente, así que el guard va dentro.
  useEffect(() => {
    if (siteId) window.__mx?.('h');
  }, [siteId]);

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
      initialSchema={initialSchema}
      formProps={{ components: uiComponents }}
    />
  );
}
