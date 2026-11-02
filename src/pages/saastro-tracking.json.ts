// /saastro-tracking.json — la configuración de medición EFECTIVA del site, generada en el build
// (ids activos, de dónde vienen y qué variable los fijaría). La lee el Hub del site desplegado.
// Contrato y ejemplo: docs/guia-pixeles.md, «Configuración efectiva (para el Hub)».
//
// Usa la MISMA `resolveTracking` + `getSettings` que BaseLayout (sin props, sin landing, sin
// noindex: es el site): ver src/lib/tracking-efectivo.ts. No añadas aquí precedencia propia.
import type { APIRoute } from 'astro';
import { getSettings } from '../lib/settings';
import { resolveTracking } from '../lib/tracking';
import { serializar, trackingJson } from '../lib/tracking-efectivo';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? '';
  const body = serializar(trackingJson(resolveTracking(getSettings()), siteUrl));
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
