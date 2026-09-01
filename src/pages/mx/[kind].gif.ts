import type { APIRoute } from 'astro';
import { getSettings } from '../../lib/settings';
import { buildEvent, isKind, pixelResponse, record } from '../../lib/render-ratio';

/**
 * `/mx/r.gif`, `/mx/j.gif`, `/mx/h.gif` — los tres contadores de
 * `src/lib/render-ratio.ts` (qué mide cada uno y por qué son tres, ahí).
 *
 * `/mx/` es un prefijo corto y neutro A PROPÓSITO: los tres pings comparten
 * ruta, así que un bloqueador que mate uno los mata todos y la comparación
 * sigue siendo válida. Una ruta con `pixel`, `track` o `beacon` dentro estaría
 * en las listas de bloqueo y mataría el ping del HTML sin matar el del JS —
 * exactamente el sesgo que esta medición existe para evitar.
 *
 * SSR obligatorio: el contador cuenta peticiones, y una ruta prerenderizada se
 * serviría del CDN sin ejecutar nada.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const settings = getSettings();
  const measure = settings.measure;

  // Apagado ⇒ la ruta no existe. Un contador público y abierto en cada
  // descendiente del theme es superficie que nadie pidió; solo aparece en los
  // sites donde alguien lo encendió a conciencia.
  if (!measure?.renderRatio) {
    return new Response(null, { status: 404 });
  }

  // Un `kind` inventado no se cuenta ni se responde con imagen: si alguien
  // sondea la ruta, que no parezca que hay más contadores de los que hay.
  if (!isKind(params.kind)) {
    return new Response(null, { status: 404 });
  }

  const event = buildEvent(
    params.kind,
    new URL(request.url),
    request.headers.get('user-agent'),
  );

  const pending = record(event, {
    sink: measure.sink ?? 'log',
    genEndpoint: measure.genEndpoint ?? 'https://gen.saastro.io',
    genWorkspaceId: settings.gen?.workspaceId ?? '',
  });

  // En Workers, una fetch que no se espera se cancela en cuanto sale la
  // respuesta: sin `waitUntil` el reenvío al sumidero se perdería en silencio
  // justo en el sumidero que sí cuenta. Si no hay runtime (dev con node), se
  // espera a secas — son milisegundos y no hay respuesta que bloquear.
  if (pending) {
    const ctx = locals.cfContext;
    if (ctx) ctx.waitUntil(pending);
    else await pending; // `astro dev` sobre node: no hay runtime de Workers
  }

  return pixelResponse();
};
