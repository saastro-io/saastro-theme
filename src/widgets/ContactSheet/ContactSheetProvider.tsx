import { lazy, Suspense, useEffect, useState } from 'react';
import { useContactFormStore } from './store';

const ContactSheet = lazy(() => import('./ContactSheet'));

/**
 * Mount once in SiteLayout.
 * The Sheet is only loaded on first button click (lazy).
 */
export function ContactSheetProvider() {
  const [mounted, setMounted] = useState(false);
  const { shouldLoad } = useContactFormStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !shouldLoad) return null;

  return (
    <Suspense fallback={null}>
      <ContactSheet />
    </Suspense>
  );
}
