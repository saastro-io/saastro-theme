/**
 * Server-side prefetch of a Hub form schema, so a landing page can ship the
 * real form in its HTML instead of a "Loading…" placeholder.
 *
 * Why this exists: `<HubForm>` downloads its schema in a `useEffect`, and an
 * effect does not run during server rendering. Without a prefetch, an SSR'd
 * landing sends the loading fallback as its HTML — a visitor whose JS is slow,
 * blocked or broken, and every crawler, sees no form at all. On a paid landing
 * that is a lost lead. Fetch it here and pass it as `initialSchema` (needs
 * @saastro/forms >= 0.19.0).
 *
 * This is a prefetch, not a fallback: the form still needs JavaScript to
 * SUBMIT, because the ingestion endpoint only accepts `application/json` and
 * answers 415 to a native <form> POST. What this buys is that the form is
 * VISIBLE and readable without JS, and that there is no skeleton flash.
 */
import { DEFAULT_HUB_URL } from '@saastro/forms';

/** Same override the client uses (see LandingForm.tsx) — for local E2E. */
const HUB_URL = import.meta.env.PUBLIC_HUB_URL as string | undefined;

/**
 * Don't let a slow endpoint hold the page hostage. The landing must render
 * even if the ingestion worker is having a bad day: on timeout we return null,
 * the component falls back to fetching in the browser, and the visitor sees
 * exactly what they saw before this existed.
 */
const TIMEOUT_MS = 2500;

/**
 * Fetches `{hubUrl}/{siteId}/{formSlug}.json`.
 *
 * Returns `null` — never throws — when there is no site configured, the form
 * doesn't exist, or the endpoint is slow/down. `null` is meaningful to
 * `<HubForm initialSchema>`: it means "the host tried and failed", which makes
 * it fall back to the client-side fetch.
 */
export async function fetchHubFormSchema(
  siteId: string,
  formSlug: string,
): Promise<unknown> {
  if (!siteId || !formSlug) return null;

  const base = (HUB_URL ?? DEFAULT_HUB_URL).replace(/\/+$/, '');
  const url = `${base}/${encodeURIComponent(siteId)}/${encodeURIComponent(formSlug)}.json`;

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network error, timeout or malformed JSON — all the same to the caller.
    return null;
  }
}
