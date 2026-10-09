// Lo mínimo de `cloudflare:workers` que usa `runtime.ts` (el theme no instala
// @cloudflare/workers-types). En workerd el módulo existe; en node, no se importa.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
