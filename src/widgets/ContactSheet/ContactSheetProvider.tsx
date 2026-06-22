import { lazy, Suspense, useEffect, useState } from 'react';
import type { Locale } from '@/i18n/config';
import type { Translations } from '@/i18n/types';
import { useContactFormStore } from './store';

const ContactSheet = lazy(() => import('./ContactSheet'));

interface ContactSheetProviderProps {
  locale: Locale;
  /** Localized copy for the sheet wrapper (title/description/privacy). */
  t: Translations['contactForm'];
  /** Locale-aware href to the privacy policy. */
  privacyHref: string;
}

/**
 * Mount once in SiteLayout.
 * The Sheet is only loaded on first button click (lazy).
 */
export function ContactSheetProvider({ locale, t, privacyHref }: ContactSheetProviderProps) {
  const [mounted, setMounted] = useState(false);
  const { shouldLoad } = useContactFormStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !shouldLoad) return null;

  return (
    <Suspense fallback={null}>
      <ContactSheet locale={locale} t={t} privacyHref={privacyHref} />
    </Suspense>
  );
}
