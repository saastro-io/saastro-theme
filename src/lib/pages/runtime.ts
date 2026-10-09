/**
 * El runtime de «páginas como datos» en workerd: secreto y variables por
 * `astro:env` (leídas en RUNTIME, ver astro.config.mjs), el service binding
 * `HUB` por `cloudflare:workers`, `caches.default` y `waitUntil`.
 *
 * Separado de `source.ts` para que aquél siga siendo puro y testeable en node.
 */
import { env as cfEnv } from 'cloudflare:workers';
import {
  PAGES_HUB_ORIGIN,
  PAGES_ORIGIN,
  PAGES_RENDER_SECRET,
  PAGES_SITE_ID,
  TEMA_BY_HOST,
} from 'astro:env/server';
import { getSettings } from '../settings';
import type { SourceOptions } from './source';

interface Fetcher {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface PagesRuntime {
  secret: string | undefined;
  hubOrigin: string | undefined;
  temaByHost: string | undefined;
  siteId: string;
  source: Omit<SourceOptions, 'draft'>;
}

export function pagesRuntime(locals: App.Locals): PagesRuntime {
  const hub = ((cfEnv as { HUB?: Fetcher } | undefined)?.HUB as Fetcher | undefined) ?? null;
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  const ctx = locals.cfContext;
  return {
    secret: PAGES_RENDER_SECRET || undefined,
    hubOrigin: PAGES_HUB_ORIGIN || undefined,
    temaByHost: TEMA_BY_HOST || undefined,
    siteId: PAGES_SITE_ID || getSettings().forms.siteId || 'demo',
    source: {
      hub,
      origin: PAGES_ORIGIN || null,
      secret: PAGES_RENDER_SECRET || null,
      cache,
      waitUntil: ctx ? (p) => ctx.waitUntil(p) : null,
    },
  };
}
