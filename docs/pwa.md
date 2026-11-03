# Web manifest / «Instalar app» (opt-in)

Por defecto el theme **no** emite web manifest. Un `<link rel="manifest">` hace que Chrome y Edge ofrezcan «Instalar app»; en una web normal o en una landing de anuncios eso es ruido, y antes cada descendiente heredaba además el nombre y el color del theme.

Se enciende por site en `src/data/settings.yaml`:

```yaml
pwa:
  enabled: true            # solo true (o la cadena "true") enciende; cualquier otra cosa = apagado
  name: "Clínica Luz"      # vacío => site.name
  shortName: "Luz"         # vacío => name
  themeColor: "#123456"    # #rrggbb; vacío => site.favicon.colors.theme
  backgroundColor: "#ffffff" # #rrggbb; vacío => #ffffff
```

| `pwa.enabled` | `<link rel="manifest">` | `/manifest.webmanifest` | fichero en `dist/client` |
|---|---|---|---|
| apagado (plantilla) | no | 404 | no |
| encendido | sí, en todas las páginas de `BaseLayout` | `application/manifest+json` con los datos del bloque | `manifest.webmanifest` |

- Código: `src/lib/pwa.ts` (una sola resolución para el `<link>` y para la ruta `src/pages/manifest.webmanifest.ts`).
- Un color inválido se descarta con aviso en el build y cae al respaldo; nunca llega al JSON.
- Los iconos son los de `public/` (`icon-192/512`, `-maskable`, `favicon.svg`; los genera `scripts/gen-favicons.mjs`). **Un site que se haga instalable debe poner los suyos**, o se instala con el icono del theme.
- `<meta name="theme-color">` se mantiene siempre (color de la barra del navegador móvil; no hace instalable nada). Si `pwa.themeColor` difiere de `site.favicon.colors.theme`, la barra y el manifest no coinciden: pon el mismo.
- No hay service worker: es un manifest para instalar un acceso directo, no una app offline.
- Portero: `node scripts/pwa-check.mjs` (va en `pnpm studio:check`, tras el build) compara `dist/client` con `pwa.enabled`: apagado y aparece un link o un fichero de manifest => rojo; encendido y falta el link, el fichero o sus campos => rojo.
- Descendientes: el `public/manifest.json` estático desapareció del theme. Al traer esta versión, un site que ya lo tuviera y quiera seguir siendo instalable debe poner `pwa.enabled: true` (y su nombre/colores) en su `settings.yaml`; si no, deja de ofrecer «Instalar app». Un `public/manifest.json` propio que conserve queda huérfano (nada lo enlaza): bórralo.
