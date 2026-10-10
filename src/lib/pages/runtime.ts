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
  /** String JSON u objeto: ver `tema.ts`. */
  temaByHost: unknown;
  /** El de las páginas públicas: `PAGES_SITE_ID`, o `forms.siteId`, o `demo`. */
  siteId: string;
  /**
   * SOLO `PAGES_SITE_ID`, sin respaldo: el que ata las firmas Hub↔site. Sin él,
   * `/__render`, `/__purge` y `?__pv` responden 404.
   */
  siteIdFirmado: string | undefined;
  source: Omit<SourceOptions, 'draft'>;
}

export function pagesRuntime(locals: App.Locals): PagesRuntime {
  const raw = cfEnv as { HUB?: Fetcher; TEMA_BY_HOST?: unknown } | undefined;
  const hub = raw?.HUB ?? null;
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  const ctx = locals.cfContext;
  return {
    secret: PAGES_RENDER_SECRET || undefined,
    hubOrigin: PAGES_HUB_ORIGIN || undefined,
    // Directo del env de workerd y no solo de `astro:env`: una var JSON llega
    // como OBJETO y `astro:env` la convierte en `undefined` (solo pasa strings).
    temaByHost: raw?.TEMA_BY_HOST ?? (TEMA_BY_HOST || undefined),
    siteId: PAGES_SITE_ID || getSettings().forms.siteId || 'demo',
    siteIdFirmado: PAGES_SITE_ID || undefined,
    source: {
      hub,
      origin: PAGES_ORIGIN || null,
      secret: PAGES_RENDER_SECRET || null,
      cache,
      waitUntil: ctx ? (p) => ctx.waitUntil(p) : null,
    },
  };
}
