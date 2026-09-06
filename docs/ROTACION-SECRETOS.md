# Rotación de los secretos de `saastro-theme`

Doctrina: `saastro-office/ecosistema/41-SECRETOS.md`. Aquí solo lo que es propio
de este Worker: **qué es cada secreto, quién más lo tiene, y qué se rompe si se
rota**. La lista ejecutable vive en `scripts/secretos.ts` y
`pnpm sync-secrets --check` dice cuáles faltan hoy en 1Password.

Item de 1Password: `op://Saastro/saastro-theme-prod`. Worker: `saastro-theme`
(**sin `--env`**: este Worker no declara entornos, ni en `wrangler.jsonc` ni en
el `dist/server/wrangler.json` con el que se despliega de verdad).
**5 secretos**, medidos el 6-sep-2026 con `wrangler secret list`, y los 5
declarados en `scripts/secretos.ts`: cero de más, cero de menos.

## Lo primero, porque cambia todo lo demás: ninguno de los cinco tiene consumidor

Medido el 6-sep-2026, no deducido:

| Comprobación | Resultado |
|---|---|
| `grep` de los 5 nombres en todo el repo | solo `GITHUB_BRANCH`, en `saastrocms.config.ts:44` y con `process.env` (build, no el `env` del Worker) |
| `git log --all -S<nombre>` | **0 commits en toda la historia** para `ENCRYPTION_KEY`, `SESSION_SECRET`, `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` |
| los 5 en el bundle construido (`dist/server`) | ninguno |
| `dist/server/wrangler.json` (el config del deploy) | `d1_databases: []`, `kv_namespaces: []`, `r2_buckets: []`, `vars: {}` |

Tienen la forma exacta del backend OAuth de un CMS —client id + client secret +
secreto de sesión + clave de cifrado— y este repo tuvo un admin de CMS que ya no
tiene: el propio `saastrocms.config.ts` dice que el site «no depende de
`@saastro/cms`». Encaja con que el item **`saastro-theme-dev`** de 1Password
(creado el 16-jun-2026) tenga esos mismos cinco campos con valor.

> **Decisión pendiente, y no la tomo aquí:** o se cablea alguno, o se retiran del
> Worker. Un secreto sin consumidor no se puede comprobar, y el día que alguien
> lo rote no se enterará nadie de si rompió algo. Retirar secretos de producción
> es de JC. Si se retiran: `wrangler secret delete <NOMBRE>` uno a uno, y
> `GITHUB_CLIENT_SECRET` además **se revoca en la OAuth App de GitHub**, porque
> es el único de los cinco cuya fuga da acceso a algo de un tercero.

### `ENCRYPTION_KEY` aquí no cifra nada: 0 filas

Es la pregunta del encargo y la respuesta está medida. En `saastro-hub-react`
esta clave cifra `site_integrations.config_encrypted` en D1, y por eso allí está
clasificada como `peligroso`: rotarla deja ilegible lo guardado, así que no es
una rotación sino una migración (hub#491 construyó la ventana de doble clave y
`recifrar-secretos` el re-cifrado).

**Aquí no hay nada de eso.** El Worker `saastro-theme` no tiene D1, ni KV, ni R2
—los tres vienen vacíos en el config con el que se despliega—, así que no hay
ninguna fila cifrada con esta clave: **cero**. No hace falta doble clave ni
re-cifrado, y no hay `ENCRYPTION_KEY_PREVIOUS` que declarar. Rotarla es
trivial porque no abre nada.

Copiar la clase `peligroso` del Hub por parecerse el nombre habría inventado una
migración que no existe; el test `sync-secrets.test.ts` fija que aquí es
`propio` para que nadie la reclasifique sin leer esto.

## Aquí no se rota nada

`sync-secrets` es **transporte**: copia de 1Password al Worker. Subir el mismo
valor es un no-op. Cambiar el valor es rotar, y eso es lo de abajo.

Y el orden nunca cambia: **valor nuevo en 1Password → `sync-secrets` →
comprobar que el consumidor responde → revocar el viejo**. Nunca se revoca antes
de comprobar, y nunca se rota antes de tener dónde guardar el valor nuevo.

Con la salvedad de arriba: hoy «comprobar que el consumidor responde» no se
puede hacer con ninguno de los cinco, porque no hay consumidor.

## Las clases, y qué implica cada una

### Configuración — no son secretos (2)

`GITHUB_BRANCH` · `GITHUB_CLIENT_ID`

Un nombre de rama y el identificador público de una OAuth App (la mitad que
viaja en la URL de autorización). No hay nada que rotar: se cambian cuando
cambia la cosa que nombran. `GITHUB_BRANCH` además se lee en **build** con
`process.env`, así que ponerlo como secreto de Cloudflare no se lo hace llegar a
nadie.

### De terceros — se copian de su consola (1)

| Secreto | Dónde se revoca | Qué se rompe mientras |
|---|---|---|
| `GITHUB_CLIENT_SECRET` | la OAuth App en github.com → Developer settings | nada hoy: no lo lee nadie |

### Propios — se rotan cuando se quiera (2)

`SESSION_SECRET` · `ENCRYPTION_KEY`

Sin contraparte: no hay que coordinar con nadie. `SESSION_SECRET` firmaba las
sesiones del admin del CMS que ya no está; `ENCRYPTION_KEY`, ver arriba.

### Peligroso — ninguno (0)

Y está comprobado, no supuesto: el test se pone rojo si alguien clasifica algo
como `peligroso` aquí sin actualizar este documento.

## Cómo se rota, en la práctica

1. **Valor nuevo en 1Password**, en el campo con el nombre exacto de la variable
   (`op://Saastro/saastro-theme-prod/<NOMBRE>`). A mano, en la app; nunca por
   una terminal cuya salida queda escrita.
2. `pnpm sync-secrets` — lo copia al Worker por STDIN. No imprime valores.
3. `pnpm sync-secrets --check` — cruza los dos lados y sale **1** si algo pide
   acción (falta en 1Password, falta en el Worker, o un transitorio olvidado).
4. Revocar el viejo en el tercero, si lo hay.

## El estado de hoy (6-sep-2026), medido

`pnpm sync-secrets --check` corre y responde:

```
  op://Saastro/saastro-theme-prod  →  worker saastro-theme

  ✓ 1 en su sitio (1Password y Worker)

  ✗ 5 SIN VALOR EN 1PASSWORD — no se pueden rotar ni restaurar:
    GITHUB_BRANCH  (configuracion)
    GITHUB_CLIENT_ID  (configuracion)
    GITHUB_CLIENT_SECRET  (de-tercero)
    SESSION_SECRET  (propio)
    ENCRYPTION_KEY  (propio)
```

Salida **1**, que es lo correcto: pide acción. El «1 en su sitio» es
`CF_API_TOKEN`, que está en 1Password y NO tiene que estar en el Worker.

Los cinco valores existen: están en el item **`saastro-theme-dev`** desde el
16-jun-2026. Meterlos en el de prod es de JC —a mano, en la app, nunca por una
terminal cuya salida queda escrita—, y solo tiene sentido si antes se decide que
los cinco siguen haciendo falta (ver arriba: hoy no los lee nadie).

### `CF_API_TOKEN` es de CI, no del Worker

Está declarado en `scripts/secretos.ts` dentro de `SOLO_CI`: vive en 1Password y
en los secrets de GitHub del repo (`CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID`, creados el 21-jun-2026, el mismo día que el item), y
**no se sube al Worker** — el Worker no despliega nada. `--check` no lo cuenta
como falta por eso.

Dos cosas medidas que quedan pendientes y no toco:

- el nombre del campo en 1Password (`CF_API_TOKEN`) **no coincide** con el de su
  consumidor (`CLOUDFLARE_API_TOKEN`), y la doctrina §Items dice que el campo se
  llama como la variable. Renombrarlo es tocar el item: de JC;
- **ningún workflow lo usa todavía**: `.github/workflows/ci.yml` es el único del
  repo y solo instala, typechequea y corre `studio:check`. El deploy de este
  repo es manual (`pnpm run deploy`).

### El duplicado, ya archivado

Durante unas horas del 6-sep hubo **dos** items titulados `saastro-theme-prod` y
`op item get` abortaba con «More than one item matches» en vez de elegir. Ya está
archivado, pero el script sigue sabiendo diagnosticarlo con esas palabras en vez
de confundirlo con una falta de sesión, y hay un test que lo fija: si vuelve a
pasar, el mensaje dice qué hacer.
