// /manifest.webmanifest — el web manifest, SOLO si el site activa `pwa.enabled` en settings.yaml.
// Apagado (por defecto) la ruta responde 404 y, al ser prerenderizada, no se emite fichero.
// Contrato y razón: src/lib/pwa.ts y docs/pwa.md.
import type { APIRoute } from 'astro';
import { getSettings } from '../lib/settings';
import { PWA_MANIFEST_TYPE, buildManifest, resolvePwa } from '../lib/pwa';

export const prerender = true;

export const GET: APIRoute = () => {
  const pwa = resolvePwa(getSettings());
  if (!pwa) return new Response(null, { status: 404 });
  for (const r of pwa.rejected) console.warn(`[pwa] ${r} inválido (se espera #rrggbb): se usa el valor por defecto.`);
  return new Response(JSON.stringify(buildManifest(pwa), null, 2) + '\n', {
    headers: { 'Content-Type': PWA_MANIFEST_TYPE },
  });
};
