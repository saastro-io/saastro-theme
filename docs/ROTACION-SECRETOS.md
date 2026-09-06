# Rotación de los secretos de `saastro-theme`

Doctrina: `saastro-office/ecosistema/41-SECRETOS.md`. Aquí solo lo que es propio
de este Worker. La lista ejecutable vive en `scripts/secretos.ts` y
`pnpm sync-secrets --check` dice si los dos lados cuadran.

Item de 1Password: `op://Saastro/saastro-theme-prod`. Worker: `saastro-theme`
(**sin `--env`**: este Worker no declara entornos, ni en `wrangler.jsonc` ni en
el `dist/server/wrangler.json` con el que se despliega de verdad).

**El Worker no tiene ningún secreto**, y ése es el estado correcto. Medido el
6-sep-2026 a las 20:45: `wrangler secret list` devuelve `[]`. Lo único declarado
es `CF_API_TOKEN`, que es de CI y no va al Worker.

```
  op://Saastro/saastro-theme-prod  →  worker saastro-theme

  ✓ 1 en su sitio (1Password y Worker)
```

Salida **0**.

## Los cinco que había, y por qué ya no están

El Worker llevaba `ENCRYPTION_KEY`, `GITHUB_BRANCH`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET` y `SESSION_SECRET`. Al declararlos (theme#48) se midió
que **no los leía nadie**:

| Comprobación | Resultado |
|---|---|
| `grep` de los 5 nombres en todo el repo | solo `GITHUB_BRANCH`, en `saastrocms.config.ts:44` y con `process.env` (build, no el `env` del Worker) |
| `git log --all -S<nombre>` | **0 commits en toda la historia** para los otros cuatro |
| los 5 en el bundle construido (`dist/server`) | ninguno |
| `dist/server/wrangler.json` (el config del deploy) | `d1_databases: []`, `kv_namespaces: []`, `r2_buckets: []` |

Tienen la forma exacta del backend OAuth de un CMS —client id + client secret +
secreto de sesión + clave de cifrado— y este repo tuvo un admin de CMS que ya no
tiene: el propio `saastrocms.config.ts` dice que el site «no depende de
`@saastro/cms`». Encaja con que el item `saastro-theme-dev` tenga esos mismos
cinco campos con valor desde el 16-jun-2026.

**JC los retiró del Worker el 6-sep-2026 a las 20:40.** Un secreto sin consumidor
no se puede comprobar: el día que alguien lo rote, nadie se entera de si rompió
algo, y mientras tanto es superficie de ataque que nadie vigila.

> ### Pendiente: revocar la OAuth App de GitHub
>
> Borrar `GITHUB_CLIENT_SECRET` del Worker **no lo revoca**. El valor sigue
> siendo válido en GitHub hasta que se regenere en la OAuth App
> (github.com → Settings → Developer settings → OAuth Apps). Es el único de los
> cinco cuya fuga da acceso a algo de un tercero, así que es el único que
> importa cerrar de verdad. Los otros cuatro no abren nada fuera de aquí:
> `ENCRYPTION_KEY` no cifraba ninguna fila (el Worker no tiene D1, KV ni R2),
> `SESSION_SECRET` firmaba sesiones de un admin que ya no existe, y
> `GITHUB_BRANCH` y `GITHUB_CLIENT_ID` no son secretos.
>
> Y los valores siguen en `op://Saastro/saastro-theme-dev`. Si la OAuth App se
> retira entera, ese item se archiva (doctrina §Ciclo de vida: archivar, no
> borrar).

### Si alguno vuelve

No se repone sin leer esto. Reponerlo significa que algo del repo ha vuelto a
leerlo: entonces se declara en `scripts/secretos.ts` con **qué lo lee**, se
mete el valor en `op://Saastro/saastro-theme-prod` y se sube con
`pnpm sync-secrets`. En ese orden.

Mientras tanto, `--check` los enseña como **sin declarar** si aparecen en el
Worker, y hay un test que fija que ya no están en la lista.

## Para qué sigue existiendo `sync-secrets` con el Worker a cero

Porque el contrato sigue teniendo trabajo:

1. **Caza lo que aparezca a mano.** `--check` cruza lo declarado con lo que el
   Worker tiene de verdad. Un `wrangler secret put` sale como «sin declarar» y
   obliga a venir aquí a decir qué es. Se **enseña** pero no pone el check en
   rojo: un rojo permanente se aprende a ignorar, y entonces deja de ser un
   control.
2. **Vigila el token de despliegue**, que es lo único que queda declarado.

## `CF_API_TOKEN`: de CI, no del Worker

Declarado en `scripts/secretos.ts` dentro de `SOLO_CI`. Vive en 1Password y en
los secrets de GitHub del repo (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`,
creados el 21-jun-2026, el mismo día que el item) y **no se sube al Worker** — el
Worker no despliega nada. `--check` no lo cuenta como falta por eso.

Dos cosas medidas el 6-sep-2026, pendientes, que no toco:

- el nombre del campo en 1Password (`CF_API_TOKEN`) **no coincide** con el de su
  consumidor (`CLOUDFLARE_API_TOKEN`), y la doctrina §Items dice que el campo se
  llama como la variable. Renombrarlo es tocar el item: de JC;
- **ningún workflow lo usa todavía**: `.github/workflows/ci.yml` es el único del
  repo y solo instala, typechequea, corre los tests y `studio:check`. El deploy
  de este repo es manual (`pnpm run deploy`).

## Cómo se rota, si algún día hay algo que rotar

1. **Valor nuevo en 1Password**, en el campo con el nombre exacto de la variable.
   A mano, en la app; nunca por una terminal cuya salida queda escrita.
2. `pnpm sync-secrets` — lo copia al Worker por STDIN. No imprime valores.
3. `pnpm sync-secrets --check` — cruza los dos lados y sale **1** si algo pide
   acción.
4. Revocar el viejo en el tercero, si lo hay. Nunca antes de comprobar que el
   nuevo funciona.

## Una nota del script que conviene no perder

Mientras se creaba el item hubo **dos** con el título `saastro-theme-prod` y
`op item get` abortaba con «More than one item matches» en vez de elegir. El
script lo diagnostica con esas palabras en vez de confundirlo con una falta de
sesión —que es lo que hacía el molde, y mandaba a hacer `op signin` con la sesión
abierta—. Hay un test que lo fija, y la corrección viajó a `hub-react` y
`forms-worker` en saastro-hub#494.
