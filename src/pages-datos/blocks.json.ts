import type { APIRoute } from 'astro';
import { buildManifest } from '../blocks/registry';

/**
 * `GET /__blocks.json` — el catálogo de bloques para el Hub:
 * `[{ slug, type, variant?, category, jsonSchema, demoProps }]`.
 *
 * Prerenderizado: es un asset estático (lo sirve Static Assets sin invocar al
 * Worker) y cambia solo cuando cambia el código de los bloques.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildManifest(), null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
