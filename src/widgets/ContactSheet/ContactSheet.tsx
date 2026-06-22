import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HubForm } from '@saastro/forms';
import type { Locale } from '@/i18n/config';
import type { Translations } from '@/i18n/types';
import { getSettings } from '@/lib/settings';
import { useContactFormStore } from './store';

// @saastro/forms <Form> needs the host's UI primitives (Input, Button,
// Label, Textarea, Checkbox, Select, Field, Form…) injected via the
// `components` prop. Eager-glob every shadcn file so the bundle stays one
// chunk and the Form picks up whatever the site has on disk — newly added
// primitives become available without touching this file.
const uiComponents = import.meta.glob('@/components/ui/*.tsx', { eager: true });

// The form schema lives in Saastro Hub (designed via the embedded builder)
// and is fetched at runtime from the ingestion Worker, by default:
//   GET https://submit.saastro.io/v1/<siteId>/<formSlug>.json
// Submissions POST to /v1/<siteId>/<formSlug>/submit, where the worker
// dispatches to the configured integrations (Resend, Google Sheets, R2…).
// Override the endpoint only for self-hosting / local E2E:
//   PUBLIC_HUB_URL=http://submit.saastro.test:4905/v1 pnpm dev
const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string | undefined;

interface ContactSheetProps {
  locale: Locale;
  /** Localized copy for the sheet wrapper (title/description/privacy). */
  t: Translations['contactForm'];
  /** Locale-aware href to the privacy policy. */
  privacyHref: string;
}

const ContactSheet = ({ locale, t, privacyHref }: ContactSheetProps) => {
  const { isOpen, openSheet, closeSheet } = useContactFormStore();
  const { siteId, contactFormSlug } = getSettings().forms;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? openSheet() : closeSheet())}>
      <SheetContent className="flex flex-col h-full gap-0">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>{t.sheetTitle}</SheetTitle>
          <SheetDescription>{t.sheetDescription}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 p-4">
          {siteId ? (
            <HubForm
              {...(HUB_URL ? { hubUrl: HUB_URL } : {})}
              siteId={siteId}
              formSlug={contactFormSlug}
              locale={locale}
              formProps={{ components: uiComponents }}
            />
          ) : (
            <div className="space-y-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Contact form not configured</p>
              <p>
                Set <code className="rounded bg-muted px-1 py-0.5">forms.siteId</code> in{' '}
                <code className="rounded bg-muted px-1 py-0.5">src/data/settings.yaml</code> to the
                Hub site slug (shown in the Hub → Setup page), then design a{' '}
                <code className="rounded bg-muted px-1 py-0.5">{contactFormSlug}</code> form in the
                Hub.
              </p>
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground">
            {t.privacyNotice}
            <a
              href={privacyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {t.privacyPolicyLinkText}
            </a>
            .
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactSheet;
