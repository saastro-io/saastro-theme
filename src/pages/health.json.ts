// /health.json — qué commit corre. Generado en el build (prerenderizado), así que dice el sha
// CONSTRUIDO, que es el que sirve esta versión. Solo sha y rama: nada del site ni de su
// configuración. Ver src/lib/build-info.ts.
import type { APIRoute } from 'astro';
import { buildInfo } from '../lib/build-info';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildInfo(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
