# NoteFlow — GitHub Sync

### Interfaz `SyncProvider` (`electron/syncProvider.ts`) — fase 4.2, tramo 2

`main.ts` **no llama a `githubSync` en duro** en el flujo de escritura de notas: enruta por
`getActiveSyncProvider()`, que devuelve el backend activo — **NoteFlow Cloud si
`settings.cloudSync.enabled` (prioridad), GitHub en caso contrario**. Son **mutuamente
excluyentes**: esta función es la única fuente de verdad (el tick del autosync de GitHub se salta
si Cloud está habilitado), y la página Settings → Sync lo comunica visualmente (vista general del
backend activo; con Cloud activo, GitHub conectado sale en "Other providers" con badge "Paused" y
el mapa lo dibuja como espejo en pausa, y GitHub sin conectar sale como "Not connected" con acceso a
un detalle solo informativo — ver `monetization.md` § 4 "Settings UI").
⚠️ Exclusión mutua = **enrutado**, no "GitHub no escribe nunca": con Cloud activo **`sync:pull` se
rechaza** en `main.ts` (`{…SyncPullResult vacío, error: 'cloud-enabled'}`) y el botón "Sincronizar
ahora" de Settings → Sync solo lo ofrece la tarjeta del backend activo (con Cloud activo, GitHub es una
fila "Paused" con "Mirror to GitHub" + "Disconnect"): un pull del repo pausado podía resucitar notas
borradas bajo Cloud. Todos los demás pulls de GitHub ya se saltan con Cloud activo (tick del autosync,
arranque, `sync:pull-active`) — **excepto** el pull inicial de `initiateDeviceFlow` al conectar
GitHub (pendiente de decidir en main; la UI no ofrece conectar GitHub con Cloud activo: desde la vista
general de Cloud, GitHub sin conectar solo abre un detalle informativo — `GitHubSetup` con
`cloudEnabled` — sin formulario ni botón de conectar, que pide apagar Cloud primero). La única forma de refrescar el repo con Cloud activo es **"Espejar en
GitHub"** (`mirrorToGitHub`, abajo), que lo deja exacto.

**Cerrar sesión de la cuenta NoteFlow apaga Cloud** (`enabled = false` vía `disableCloudSync()`,
que conserva `lastSync`/`pullSeq`/journal) → se **libera la exclusión mutua** y GitHub Sync
vuelve a sincronizar solo en su siguiente tick si estaba conectado. Sin ese apagado la app se
quedaba sin ningún backend activo (Cloud sin sesión no puede sincronizar y GitHub seguía "Paused").
Lo mismo cuando la app **confirma** (fetch fresco de entitlements) que la suscripción Cloud caducó con
la sesión iniciada: mismo `disableCloudSync()`, journal conservado. Lógica pura de la transición:
`electron/accountTransition.ts` (ver `monetization.md` § 4 "Cerrar sesión" y § 3 "Auto-activación…"
punto 3).

Superficie (extraída de lo que `main.ts` consumía de `githubSync.ts`; ambos adapters son finos y
delegan 1:1 sin cambiar comportamiento): `isConnected()`, `schedulePush(relPath, content,
onStart?, onComplete?)`, `pushPathsNow(notesDir, relPaths)`, `scheduleDelete(relPath)`,
`scheduleDeleteDir(dir)`, `pullNotes(notesDir)` (mismo shape de resultado en ambos),
`retrySyncJournal(notesDir)`, `hasPendingRemoteMutations()`. Lo específico de cada backend
(Device Flow, migración remota v2, claves E2EE/unlock) queda FUERA de la interfaz — sus IPC
propios llaman a los módulos directamente.

**Botón de sync de la titlebar** (`TitleBar.tsx`): NO está cableado a GitHub. Consume (vía el hook
`src/components/useActiveSyncStatus.ts`, que comparte con la tarjeta de estado de Ajustes → Sync)
`sync:get-active-status` (helper `getActiveSyncStatus()` en `syncProvider.ts`, espejo de
`getActiveSyncProvider()`) → status normalizado y etiquetado con `backend` (`'github'|'cloud'|'none'`),
y su sync manual va por `sync:pull-active` (Cloud si `enabled`, GitHub si no). **El sync manual no es
solo un pull: también drena el journal** (lo pendiente de subir/borrar, p. ej. pushes que fallaron sin
red). Cloud (`cloudManualSync`, también `cloud:pull` = "Sync now" del panel) corre el **mismo ciclo**
que el auto-sync (`runCloudSyncCycleOnce` vía el runner single-flight, ver `monetization.md` § 4 "Orden
del ciclo"); GitHub (`githubManualPull`, también `sync:pull`) drena el journal y luego hace pull, como el
tick. Antes el manual solo hacía pull: el journal esperaba al tick de 5 min y el pull OK limpiaba
`syncError`, así que la UI decía "Synced" con subidas pendientes (QA 2026-11-11). El botón se muestra
cuando CUALQUIER backend está `active` (antes solo con GitHub conectado → un usuario solo-Cloud se
quedaba sin sync manual) y se suscribe a `sync:status-changed`, `cloud:status-changed`,
`notes-updated` y `sync:push-state` (refresca en **cada** cambio de push-state, no solo en `idle`,
para que el contador de pendientes vaya al día; el paso a `idle` se aplica **junto con** el status
re-leído — bajar `pushing` antes mostraría un instante el status anterior, cuyo journal aún cuenta la
subida/borrado recién aterrizado, como "Not uploaded"; un `pushStateRef` evita pisar un `pushing` llegado
entretanto). La línea de identidad del pie del sidebar
(`stores/identityStore.ts`) también lee `sync:get-active-status`, pero solo `backend` + nombre del repo,
y solo refresca con `sync-auth-complete`, `sync:status-changed` y `cloud:status-changed` (por eso
`sync:disconnect` emite `sync:status-changed`). El botón y su **tarjeta de estado al hover** viven
en `SyncStatusButton.tsx` (sin `title` nativo; `aria-label` con resumen); la prioridad del estado
mostrado (syncing → **choice** (elección de origen pendiente, ver "Origen del dir de notas") → uploading → locked → blocked → error → pending → **unsynced** → synced) es lógica
pura en `src/lib/syncStatus.ts` (testeada). Además de lo normalizado, el status lleva `pendingUploads`
(`pendingPushFiles` + `pendingRemoteDeletes` de `main.ts`, que se lo pasa a
`getActiveSyncStatus(pendingUploads)`: subidas y borrados **en vuelo** — las ediciones aún dentro del
debounce de 5 s no cuentan),
`pendingChanges` (entradas del **journal** del backend activo — subidas/borrados fallidos, `stale` o en
vuelo — menos los ficheros con timer de debounce vivo: `countPendingChanges` de `syncState.ts`, vía
`CloudSyncStatus.pendingChanges` / `githubSync.getPendingChangeCount()`; sobrevive a un push fallido y a
un pull OK que limpia `syncError` → estado **`unsynced`** "Not uploaded", icono `CloudUpload` ámbar, en
vez de "Synced"; la fila *Pending uploads* de la tarjeta muestra `max(pendingChanges, pendingUploads)`),
`autoSyncIntervalMs` (`GITHUB_AUTO_SYNC_INTERVAL_MS` en `githubSync.ts` /
`CLOUD_AUTO_SYNC_INTERVAL_MS` en `cloudSync.ts`), en Cloud `cloud.realtimeConnected` (sin
evento propio: se lee al refrescar; la tarjeta re-lee el status al abrirse y cada 30 s) y
`history` (abajo). La acción del clic (sync / reintentar / desbloquear) va en el `aria-label`
del botón; la tarjeta ya no la muestra.
**Aviso de copias de conflicto:** `ActiveSyncStatus.conflictCopies` (`{count, titles, at}`, de nivel
superior — no dentro de `cloud`) lleva el aviso del backend **activo**, sea Cloud
(`CloudSyncStatus.conflictCopies`) o GitHub (`SyncStatus.conflictCopies` de `githubSync.ts`): punto
ámbar en el botón + bloque con los títulos y *Dismiss* en la tarjeta, igual para los dos. *Dismiss*
llama a `sync:dismiss-conflict-copies`, que limpia el aviso de **ambos** backends. El tipo y el lado
disco de la copia son compartidos (`electron/conflictCopy.ts`).
**Historial de actividad (`history`, mini gráfica de barras de la tarjeta):** buffer circular
**solo en memoria** (no se persiste; vacío en cada arranque) de hasta 24 `{at, files, ok}`, uno
**por backend** (`getSyncHistory()` en `githubSync.ts`/`cloudSync.ts`; el status lleva el del
backend activo, así que un pull manual de GitHub con Cloud activo no ensucia la gráfica de Cloud).
Lógica pura en `electron/syncHistory.ts` (testeada); alturas de las barras en `src/lib/syncStatus.ts`.
⚠️ **Cobertura:** con el latido del tick de 5 min (cada pull registra una entrada, aunque mueva 0
ficheros), 24 entradas cubren solo **~las últimas 2 h**. Por eso **"X files today" no suma el
ring**: el mismo registro lleva un **total acumulado del día** (`{day: 'YYYY-MM-DD' local, files}`,
se reinicia al cambiar la fecha local; leído en otro día devuelve 0), expuesto como `filesToday`
en el status (`getSyncFilesToday()`). Es "hoy en esta sesión": tampoco se persiste.
- **Qué cuenta `files`:** subidas = mutaciones remotas que **llegaron de verdad** — GitHub: 1 por
  PUT/DELETE en los wrappers serializados `upsertRemoteFile`/`removeRemoteFile` (un PUT saltado
  por contenido idéntico o un DELETE de algo ya borrado cuentan 0; `upsertRemoteFileNow`/
  `removeRemoteFileNow` devuelven si escribieron); Cloud: 1 por fila en `pushSingleFile`, N filas
  tombstoneadas en `removeRemotePaths`/`deleteRemoteDirNow` (vía `trackActivity`). Bajadas = al
  final de `pullNotes`, ficheros que el pull **cambió en disco** (escritos o borrados, metadatos
  incluidos). Al estar en los primitivos cubre todos los caminos (push debounced, `pushPathsNow`,
  journal retry, catch-up del pull, espejo, borrados).
- **`ok`:** una mutación que lanza registra `ok: false` con 0 ficheros; un pull con `errors` (o
  sin token/claves) también.
- **Sin entradas espurias:** las operaciones que caen en el **mismo minuto de reloj** (bucket fijo
  de `SYNC_HISTORY_BUCKET_MS`, no ventana deslizante) se **funden** en una entrada (ficheros
  sumados, `ok` = AND, `at` = la última). Así un guardado (≥2 PUTs), las ráfagas del push con
  debounce mientras se escribe o un pull + su catch-up dan **una barra por minuto**; un pull sin
  cambios (tick de 5 min) deja un "stub" de 0 ficheros = el latido.
El indicador "pushing" (`sync:push-state`) vale para **ambos** backends: `applyNoteWrite` en
`main.ts` engancha los callbacks `onStart/onComplete` de `schedulePush` del proveedor activo (y el
push durable de las tools del chat) a `pendingPushFiles`. Los **borrados remotos** (nota borrada —
`applyNoteDelete`, también desde las tools del chat —, nota temporal expirada, sección eliminada en
`applyNoteWrite`) pasan por `scheduleRemoteDelete` de `main.ts`, que los marca en vuelo en
`pendingRemoteDeletes` (`trackInFlight` de `syncCycle.ts`, puro y testeado) mientras el backend está
conectado: `scheduleDelete`/`scheduleDeleteDir` journalan el op **síncronamente**, así que sin esto el
refresco del renderer tras `notes-updated` veía una entrada de journal sin timer → "Not uploaded", y
nada re-leía el status cuando el borrado aterrizaba (los backends no emiten status al terminar un
delete) → ámbar pegado hasta el siguiente evento. Así el borrado se ve como "uploading" y al asentarse
(OK o fallo) el `sync:push-state` idle re-lee el status (synced, o el error y su entrada de journal).
Set aparte de `pendingPushFiles` para que un delete que termina no borre la subida en vuelo de la
misma ruta.
`sync:pull` (GitHub puro) se mantiene intacto para Settings → Sync.

**Cloud Sync** (`electron/cloudSync.ts`, mismo modelo que GitHub pero contra Supabase con E2EE,
tombstones en vez de borrado por ausencia, sin cola de mutaciones y con pull incremental por `seq`, un
número de cambio que asigna el servidor — migración 0008; ya no por `updated_at`, que es la hora de
edición): detalle completo en `monetization.md` § 4 (modos de reconciliación y regla de secciones
sueltas). **Conflictos:** desde la migración 0014, **fusión en tres vías por fichero** (base = `seq`
del servidor + hash del contenido que este dispositivo reconcilió por última vez, `SyncState.bases`)
en cuanto el ancla de la carpeta tiene base — el análogo de la caché de shas de GitHub en QA B3 —;
sin base, la regla histórica compartida con GitHub (carpeta como unidad, decide el `updated:` del
ancla). Su journal (y las bases) reutiliza las transiciones puras de `syncState.ts` en un fichero
PROPIO (`userData/cloud-sync-state.json`) — nunca el `sync-state.json` de GitHub.
📌 **Borrados de Cloud (arreglado):** el listado que usa borrar una nota entera pagina por keyset
sobre `seq` (antes un GET capado a 1.000 filas dejaba la nota sin tombstone y el `deleteDir` se daba
por hecho), y el pull **no aplica** el tombstone de una nota con un `upsert` pendiente bajo su
carpeta (`shouldDeletionRuleSkipDir`, el mismo guard que aquí abajo usa la regla de borrado de
GitHub) ni el de una sección con upsert pendiente de ese fichero (`hasPendingUpsert`): gana la
edición local y la nota se re-sube entera con subida **forzada** (resurrección intencionada: el
tombstone es más nuevo por diseño y una subida condicionada se rechazaría) — salvo que **todas** sus
subidas pendientes sean `stale` (el servidor ya rechazó esa versión local) y el `updated` local no
sea posterior al borrado: entonces se borra en local (`planAnchorTombstone`). Detalle en `monetization.md`
§ 4 "Deletes = tombstones".
📌 **Integridad del pull incremental de Cloud:** `pullNotes` avanza el watermark con
`nextPullSeq(s.pullSeq, rows)` (`cloudSyncLogic.ts`) = máxima `seq` de **todas** las filas de la
consulta incremental. Las filas que **fallan al aplicarse** (error de disco en su carpeta o en un json
de metadatos) o **no descifran** no se pierden: entran en el **retry set**
`settings.cloudSync.pullRetry` (path_key → `{relPath?, attempts}`), escrito en el **mismo**
`patchSettings` que avanza `pullSeq`, y cada pull las vuelve a pedir por `path_key` y las mezcla en
su lote (`mergeRetryRows`/`nextPullRetry`, puros). Las indescifrables se abandonan tras 5 intentos y
las que fallan al aplicarse tras 50 (error local permanente); las de ruta insegura nunca se reintentan. Mientras el retry set no esté vacío el estado de Cloud
muestra un error ("Some remote changes could not be applied…") aunque un push posterior limpie
`syncError`, y el espejo a GitHub se bloquea (`hasPendingPullRetries`). Detalle en
`monetization.md` § 4 "Pull incremental".
📌 **Subidas condicionadas de Cloud (migraciones 0014 y 0011):** las filas de nota se suben por la
RPC `cloud_upsert_file_v2`, que rechaza ("stale") la subida si la fila del servidor ya no está en la
`seq` base del fichero (sin base: la regla de `updated_at` de la 0011; servidor sin la 0014 → fallback
a `cloud_upsert_file`). El ciclo de Cloud hace **pull (y emite su resultado) antes de drenar el
journal**, y el pull **fusiona por fichero**: una edición offline de una sección y una remota de otras
se combinan; si ambos tocaron la misma sección, se **fusiona por líneas** dentro de la nota (diff3 con
el contenido de la base guardado en local, o unión de dos vías; si tocaron las mismas líneas, las dos
versiones entre marcas `> ⚠️ Sync conflict …`, sin nota aparte). Detalle (stale/force, metadatos, cambio de cuenta, bases, residuales) en
`monetization.md` § 4 "Subidas condicionadas" y "Fusión en tres vías".
Las subidas de **un mismo fichero van en serie** y el pull reconoce como propias **todas** las versiones
que este dispositivo mandó y aún no tienen base confirmada (en vuelo, en cola, o con la respuesta
perdida): nunca se fusionan contra un guardado local posterior — `monetization.md` § 4 "Versiones propias
en el pull y subidas en serie por fichero".
📌 **Copias de conflicto y fusión (los dos backends):** desde el 2026-11-06 ni Cloud ni el GitHub
Sync de la app crean nota aparte cuando una sección cambió en los dos lados: la **fusionan por líneas**
(`mergeSectionText`, mismo planificador `planThreeWayDir`; GitHub vía `electron/githubMerge.ts`, con el
contenido de la base pedido por sha a la API de git blobs) y dejan las dos versiones entre marcas ⚠️
solo si chocan las mismas líneas (aviso `conflictMerges`). Las copias quedan para lo que no se fusiona
(notas cifradas, ancla ilegible, borrado remoto de una sección editada aquí en GitHub, el tombstone
`'lost'` y las carpetas sin base de ancla en Cloud, la red de seguridad). El CLI hace lo mismo en los dos
backends (GitHub: `githubResolveConflictDir`, ver "El CLI con GitHub" abajo). Lo
que sigue describe esas copias. Cuando el pull de Cloud (carpetas sin base de ancla; con
base, ver "Fusión en tres vías" en `monetization.md`: una sección que cambiaron los dos se **fusiona por
líneas** en la nota — marcas ⚠️ si chocan las mismas líneas, aviso `conflictMerges` —, y solo una nota
cifrada o una fusión fallida acaba en copia de esas secciones) va a
sobrescribir (ancla remota más
nueva, o una sección remota suelta) o borrar (tombstone `'lost'`) una carpeta con una edición local
**apuntada en el journal** que difiere de la versión del servidor, antes guarda la versión local
como **nota nueva** ("<título> (conflict copy fecha)") y avisa en la tarjeta del botón de sync. Por
eso, con Cloud, las ediciones hechas con la **puerta de push cerrada** se apuntan en el journal (sin
subirse) en lugar de descartarse; en GitHub la puerta sigue sin apuntar nada (allí la detección no
depende del journal: es la comprobación de tres vías contra la caché de shas). Residuales de Cloud
(Cloud desactivado, CLI, formato YAML, alarmas duplicadas…) y detalle en `monetization.md` § 4
"Subidas condicionadas" → "Copias de conflicto". El **GitHub Sync** hace lo mismo desde QA B3 con su
propia regla (subida condicionada de tres vías + "camino de conflicto" del pull): ver "Subida
condicionada (QA B3)" abajo (allí, con base, **fusiona** en vez de copiar). Mismos helpers (`planConflictCopy`/`buildConflictCopy` de
`cloudSyncLogic.ts`, `writeConflictCopy` de `conflictCopy.ts`), misma etiqueta i18n
(`sync.conflictCopy`, inyectada con `githubSync.setConflictCopyLabel`) y mismo aviso.

📌 **Subir lo pendiente antes de una captura del historial (`flushPathForSnapshot`).** Antes de
restaurar una versión, el panel de historial pide guardar en el historial el texto **actual** de la
sección (IPC `cloud:versions-snapshot` → RPC `cloud_snapshot_file`, ver `monetization.md` § 4
"Historial de versiones"). La RPC copia la fila **del servidor**, así que antes
`cloudSync.flushPathForSnapshot(notesDir, relPath)` sube lo que este dispositivo tenga pendiente de
ese fichero. Decide la función pura `planSnapshotFlush` (`cloudSyncLogic.ts`, tests en
`tests/electron/cloudSnapshotFlush.test.ts`), que devuelve:
- `clean`: nada pendiente; la fila del servidor ya es el contenido local.
- `uploaded`: había subida pendiente (timer de debounce armado u `upsert` en el journal) y acaba de
  subirse con `pushPathsNow`.
- `disabled`: Cloud desactivado o sin configurar, o fichero `localOnly`.
- `gated`: la puerta de push sigue cerrada (primer pull sin terminar).
- `stale`: el servidor tiene una versión más nueva que este dispositivo no ha bajado (y no hay edición
  nueva desde que se rechazó).
- `forbidden`: subida rechazada por falta de suscripción.
- `failed`: error de red o servidor (queda en el journal), un borrado pendiente de esa ruta, o una
  subida en vuelo que no terminó en 30 s (si hay una en vuelo, primero la espera).

**La captura nunca fuerza una subida:** reutiliza `pushPathsNow` (journal, marca `stale` y la subida
**condicionada** normal por `cloud_upsert_file_v2`), sin camino propio; solo va forzada si la op del
journal ya lo era. Cualquier salida distinta de `clean`/`uploaded` se traduce en un error de la
captura (`sync-off`, `sync-pending`, `no-subscription`…) y el renderer **no** sustituye en silencio:
ofrece restaurar como sección nueva o sustituir igualmente.

**El CLI** (`cli/noteflow.js`) tiene su propio cliente Cloud headless (`noteflow cloud …`, con
sesión y cursor propios en `settings.cliAccount`/`cliCloud`, y la misma prioridad Cloud > GitHub):
ver `monetization.md` § 4 "Cliente CLI (headless)".

**El CLI con GitHub** (`noteflow login/push/pull`) escribe en `settings.githubSync` — en
Windows es el **mismo `settings.json`** que la app (en Linux/macOS el CLI usa
`~/.config/noteflow` y la app su userData `~/.config/NoteFlow` / `~/Library/Application
Support/NoteFlow`: ficheros distintos, ver `architecture.md` § Modelo de almacenamiento).
Por eso su `lastSync` obedece al mismo invariante que la regla de borrado del pull de la app
("ausente del remoto + `updated <= lastSync` ⇒ borrada"): `lastSync` solo avanza cuando el repo
tiene **todo** lo que hay en disco (`nextGithubLastSync`/`writeGithubLastSync`). En concreto:
- **Origen del dir de notas** (desde CLI 2.14.0; la regla de la app está en § "Origen del dir de
  notas" abajo): el CLI lee y escribe el mismo `settings.syncOrigin` (en Windows, el de la app). Lleva
  un espejo puro de `electron/syncOrigin.ts` (`sameIdentity`, `decideOrigin`, `originScope`,
  `readSyncOrigin`, `getStoredIdentity`, `withSyncOrigin`, `normalizeNotesDir`, `sameNotesDir`,
  `readSettingsStrict`, `hasSyncedLocalNotes`), incluidas las partes aditivas del contrato, que la app
  también implementa (§ "Origen del dir de notas"): `stale: true` (origen guardado `stale` + notas
  sincronizables ⇒ preguntar aunque la identidad coincida, con `stale: true` en la decisión; sin notas ⇒
  adoptar con reseteo, `stale-empty`; el CLI **nunca** lo escribe —solo la app, en su "usar solo lo
  remoto"— y toda adopción lo quita), `cloud.email` (etiqueta de los mensajes) y **`notesDir`** (abajo).
  **Paridad CLI ↔ app** (`tests/cli/syncOrigin.test.ts`): las mismas entradas pasan por los dos módulos
  y se comparan las respuestas — rejilla de identidades guardadas (con `stale` / `email` / `notesDir`) ×
  identidad que entra × notas en disco × dir actual/por defecto/plataforma; ajustes válidos y
  malformados; ida y vuelta (lo que adopta uno lo lee el otro sin preguntar ni reescribir; la marca
  `stale` de la app cierra la puerta del CLI y la adopción del CLI la limpia para la app); y las **dos
  puertas del CLI sobre un `settings.json` real** frente a la decisión de la app para ese mismo fichero
  y dir. Diferencias **deliberadas**, fijadas en ese test: (1) `withSyncOrigin` al readoptar la
  **misma** identidad — los dos conservan el `repoId` guardado si la identidad nueva no lo trae (no es
  diferencia: perderlo dejaría el repo comparándose solo por nombre) y ninguno conserva `stale`; el CLI
  conserva además el `email`, el `notesDir` y los campos desconocidos que falten, y la app escribe el
  resto del registro nuevo; (2) la app etiqueta la identidad con su dir
  (`next.notesDir`) y por eso reescribe un registro de la misma identidad **sin** `notesDir` para
  añadírselo, mientras que la puerta del CLI lo deja como está (ambos lo leen como del dir por defecto);
  (3) la regla del dir va **antes** de `decideOrigin` en el CLI (`originPlacement` → `other-dir`) y
  **dentro** en la app (`dirs` → `foreign-dir`): mismo resultado; (4) la siembra de Cloud del CLI conoce
  además su propio dueño (`cliCloud.userId`, y el de la sesión anterior en `cloud login`).
  **Seguridad de estos tests:** los que vacían, archivan o borran en un dir de notas
  (`tests/cli/syncOrigin.test.ts`, `tests/cli/originGate.test.ts`, `tests/electron/syncOriginGithub.test.ts`,
  `tests/electron/syncOriginCloud.test.ts`) derivan ese dir del temporal del test de forma **explícita**
  (`defaultNotesDir(home)`), nunca de `os.homedir()` — el mock del home solo sirve para que el módulo
  bajo prueba vea ese mismo dir como "por defecto" — y pasan por `assertInsideTmp`
  (`tests/helpers/tmpGuard.ts`) antes de cualquier `rmSync`/escritura: si el mock dejara de aplicar, el
  test falla en vez de tocar `~/noteflow-notes`.
  **A qué dir pertenece cada registro (`notesDir`, contrato compartido con la app):** `syncOrigin` vive
  en `settings.json`, que `NOTEFLOW_NOTES_DIR` no aísla, pero describe UN dir. Cada registro
  (`github`/`cloud`) lleva `notesDir` = `path.resolve` del dir con el que se adoptó (sin separador
  final; lo escribe **toda** adopción, también la siembra de Cloud); un registro sin él (anterior a esto)
  es del **dir por defecto** (el de sin `NOTEFLOW_NOTES_DIR`). Comparación `sameNotesDir`: resueltas,
  sin mayúsculas en win32/darwin, exacta en linux, sin `realpath`. Antes de `decideOrigin`
  (`originPlacement`): registro de **otro** dir ⇒ `proceed` **sin** adoptar, sin escribir, sin reseteo y
  sin elección pendiente (`origin merge` → nada que resolver; `origin` dice de qué dir es); **sin**
  registro y dir actual ≠ por defecto ⇒ igual, sin escribir (si no, un override vacío dejaría al dir real
  con un registro "ajeno", sin protección). Así un `NOTEFLOW_NOTES_DIR=<vacío> noteflow pull` ya no adopta
  B con reseteo para que luego el dir real, con las notas de A, suba a B sin preguntar. En la práctica
  solo el dir por defecto tiene registro. Efecto aceptado: con override se siguen compartiendo
  `githubSync`/`cliCloud`/`lastSync` (ya conocido). `withSyncOrigin` conserva las claves
  desconocidas de `syncOrigin` y de settings y, al readoptar la **misma** identidad, los campos extra
  del registro (y un `repoId`/`email` que la identidad nueva no traiga); otra identidad ⇒ registro
  nuevo solo con los campos conocidos.
  **Puerta** = `evaluateGithubOrigin()`, derivada en cada llamada (sin caché: ve lo que la app haya
  cambiado). Identidad = `settings.githubSync` (`owner`/`repo` + `repoId` si está guardado: `login`
  lo toma de la respuesta del `GET /repos/{o}/{r}` que ya hace `ensureRepo`, o del `POST /user/repos`
  si lo crea; push/pull no hacen GET extra). `settings.json` ilegible ⇒ `unreadable` (en la práctica un
  fichero corrupto ya hace que el CLI no vea la conexión — `readSettings` devuelve `{}` y sale `Not
  connected` —, así que cubre la carrera y `origin merge`); `cloudSync.enabled` (la app usa Cloud,
  GitHub es su espejo) ⇒ abierta **sin tocar** `syncOrigin.github`. Las decisiones `proceed` que adoptan
  se escriben ya, con `adoptGithubOrigin` (mismo orden estricto que la app: settings legible →
  `cli-github-state.json` reescrito `{}` con una escritura que propaga errores → **un** read-modify-write
  de settings que quita `lastSync`/`remoteFormatMigratedAt` del `githubSync` **leído del fichero** y fija
  el origen; rechaza si el `githubSync` releído ya no es la conexión evaluada); un fallo ⇒
  `unwritable`, cerrada. **Dónde se comprueba:** `cmdPush` y `cmdMigrate` (exit 1 antes de cualquier
  petición; `migrate` no migra ni en local), `cmdPull` (lanza `Error`, que `pullAfterLogin` captura),
  `syncPushNoteFiles` (no sube; una línea `Not synced to GitHub: … run 'noteflow origin' to resolve`, el
  comando no falla), `cmdDelete` (la puerta se evalúa **antes** de borrar la carpeta: borrar la última
  nota no puede convertir "notas de otro remoto" en "sin notas ⇒ adoptar"; cerrada ⇒ borrado solo local,
  `Not deleted on GitHub`) y `cmdSectionDelete` (no borra en remoto; ya avisó el push). `group/folder
  delete` solo tocan GitHub vía `syncPushNoteFiles`. Con el CLI enrutado a Cloud (`cloudActive()`)
  GitHub no se evalúa.
  **`login`** guarda la conexión y llama a `githubOriginAfterLogin`: con `cloudSync.enabled` adopta el
  repo sin preguntar (y limpia su `stale`, como el Device Flow de la app en ese estado); con el CLI en
  Cloud no evalúa; cerrada ⇒ **sin** pull, explica (`Sync with GitHub is on hold: the notes in <dir>
  come from <prev>, but this CLI is connected to <next>. Nothing was synced.` + opciones) y sale con 0
  (el login sí se hizo); `--merge` adopta y sigue con el pull (con `--no-wait` se guarda, igual que
  `noPull`, como `merge: true` en el grant pendiente `cliGithubLogin` y lo aplica `--finish`). **Resolver:** `noteflow origin merge` (backend activo, mismo enrutado que
  `push/pull`; si `githubSync` no tiene `repoId` lo pide antes con `GET /repos/{o}/{r}` — como
  `resolveOriginChoice` de la app — y lo guarda también en `githubSync.repoId`, reevaluando: con el id el
  repo puede resultar el mismo, renombrado ⇒ nada que resolver; si el GET falla, por nombre; adopta con
  reseteo y hace el pull best-effort, `--no-pull` lo omite; nada pendiente ⇒ lo dice y sale 0), `noteflow logout` para cancelar (`logout` no borra `syncOrigin`, igual que la app) o
  la app de escritorio para "usar solo lo remoto" (el CLI no archiva). `noteflow origin [--json]` y
  `status --json` (`github.origin`) enseñan el estado **sin** adoptar nada. Tests e2e (GitHub y Cloud
  simulados): `tests/cli/originGate.test.ts`.
  **En Windows** `origin merge` / `login --merge` escriben el origen en el `settings.json` compartido, así
  que resuelven **también** la elección pendiente de la app. El CLI no resetea el `sync-state.json` de la
  app (journal y shas del repo anterior); lo descarta la propia app: ese estado va estampado con su repo
  (`githubRemote`) y, si no coincide con la conexión viva, `ensureStateOfConnection` lo vacía antes de
  drenar nada (§ "Origen del dir de notas" → "El estado es de un repo"). Al revés no hace falta: el
  `cli-github-state.json` del CLI ya va por `owner`/`repo` (`loadGithubBases` ignora el de otro repo).
- `login` **no** escribe `lastSync` (re-login al mismo repo conserva el estado previo; otro repo
  empieza limpio) y hace un primer `pull` automático (salvo `--no-pull` o Cloud activo en el CLI).
- **Todo** `pull` de GitHub (`pull`, su alias `update`, `--force` y el de tras el login) lo escribe
  solo si no quedan **notas aún no subidas** (`localOnlyNoteDirs`: sin `note.md` en el remoto, aunque
  tenga secciones; desde CLI 2.12.0 cuenta sobre `listSyncedNoteDirs`, así que no incluye las notas
  `localOnly: true` de "Notas solo-locales" abajo — concepto distinto pese al nombre); si quedan, conserva el valor previo (o ninguno) y avisa con un texto neutro
  (`… not on GitHub (new here, or deleted on another device) — run 'noteflow push' … if new`): el
  pull del CLI no aplica borrados, así que una nota borrada en otro dispositivo también sale aquí.
- `push` (y `migrate`, que lo llama) lo escribe solo si **ningún** fichero falló al subir — un
  `note.md` fallido es una nota que el repo no tiene; con errores avisa `Last sync not updated`.
- El valor escrito es la hora **de inicio** del comando (`startedAt`, tomada antes de leer el disco,
  como `githubSync.ts`): una nota escrita mientras corre el push/pull queda con `updated > lastSync`.
- La escritura **relee** `settings.json` justo antes de guardar y solo parchea `lastSync` sobre la
  conexión actual (`githubSyncWithLastSync`): si `githubSync` desapareció o apunta a otro
  owner/repo (la app desconectó/reconectó mientras corría el comando), **no escribe nada** — antes
  reescribía la foto leída al empezar y deshacía ese cambio (incluido el token `safe:` en Windows).
  `push` avisa entonces `Last sync not updated (the GitHub connection changed while pushing)`.
- El push automático por comando (`syncPushNoteFiles`) **no** toca `lastSync`.
- **Subida condicionada (QA B3, espejo de la app):** `noteflow push` y el push automático de cada
  comando que edita (`syncPushNoteFiles`) hacen la misma comprobación de tres vías por fichero de
  nota (`planConditionalUpsert`), con una caché de bases **propia** del CLI
  (`cli-github-state.json` junto a su `settings.json`, `{owner, repo, shas}`; otra cuenta/repo ⇒
  vacía; `logout` y `login` a otro repo la borran — nunca se comparte con el `sync-state.json` de
  la app). Sin caché (primera ejecución, otro repo) ⇒ comportamiento histórico. Tampoco hace PUTs
  idénticos (antes sí: commits vacíos). Un fichero cuya copia en GitHub cambió desde su base **no se
  sube**: la carpeta se resuelve al final (`githubResolveConflictDir`), **con las mismas reglas que el
  camino de conflicto del pull de la app** (2026-11-06): baja la carpeta remota y la **fusiona fichero a
  fichero** (`githubMergeConflictDir` → `planGithubDirMerge`, espejo puro de `electron/githubMerge.ts`
  sobre el `planThreeWayDir`/`mergeSectionText`/`mergeAnchors` del CLI; base = la caché de shas del CLI,
  con el contenido de la base pedido por sha a `GET /repos/{o}/{r}/git/blobs/{sha}` solo para los
  ficheros en conflicto de tres vías y verificado con `gitBlobSha` — si falla, unión de dos vías). Las
  marcas ⚠️ nombran `os.hostname() + " (CLI)"` (`conflictMarkerLabels`). Escribe el resultado, toma los
  shas remotos como base y **sube por el camino normal** (`upsertRemoteFile` condicionado contra el sha
  remoto; secciones antes que el `note.md`; un fichero remoto que la fusión dejó borrado aquí se borra con
  `removeRemoteFile` condicionado, **solo si el `note.md` fusionado subió** — si no, el ancla recupera su
  base previa para que el siguiente push vuelva a encontrar el conflicto, refusione y borre entonces). Con marcas avisa `Merged with conflicts: "<título>" — both versions
  kept, look for the ⚠️ markers` (como el pull de Cloud del CLI); una fusión limpia no avisa (el push
  automático imprime `Synced to GitHub`; `noteflow push` la cuenta como `N merged with GitHub`, no como
  `changed on GitHub`). Sección borrada en GitHub y editada aquí → se aplica el borrado
  y la versión local va a una copia **con solo esas secciones** (`writeConflictCopyDir` con
  `onlySections`). **Copia de la carpeta entera** (camino histórico: `preserveConflictCopy`, escribe la
  remota encima, sube la copia, `Conflict: local changes kept as "…"`) solo donde no se fusiona: nota
  cifrada, ancla ilegible o ausente en un lado, un fichero local ilegible o fusión que lanza (red de
  seguridad). Paridad con la app fijada en `tests/cli/githubMerge.test.ts` (también e2e contra un GitHub
  simulado con `https.request` mockeado). `noteflow pull` en sí **no** fusiona: sigue siendo LWW por
  `updated:` (remota más nueva ⇒ sobrescribe la carpeta local, también una edición local sin subir;
  local igual o más nueva ⇒ la salta y conserva su base, así que el siguiente push ve el cambio remoto y
  fusiona).
  `noteflow pull` registra como base cada blob del tree **solo donde el fichero local ya es ese blob**
  tras el pull (`nextPulledBases`: una carpeta saltada por "local más nuevo" conserva su base vieja,
  para que el siguiente push vea el cambio remoto). Borrados: `noteflow delete` no borra nada en
  GitHub si algún fichero de la nota cambió allí desde su base (`remoteDirChangesSinceBase`; el
  siguiente `pull` la vuelve a bajar), y `noteflow section delete` no borra una sección cambiada en
  GitHub (ni ninguna si el push del ancla acaba de resolver un conflicto). Con `cloudSync.enabled` en
  el `settings.json` (la app usa Cloud) todo es incondicional, como en la app.
- **Metadatos en `noteflow pull`** (`METADATA_FILES`; desde CLI 2.11.0 — antes se sobrescribían
  siempre, también en el pull de tras el `login` a un repo con sus propios grupos/carpetas): con base
  en `cli-github-state.json` igual al sha del tree → **no se toca** si existe (puede llevar una edición
  local sin subir, como el skip por caché de la app; `--force` lo desactiva y vuelve a pisar) y se
  **restaura** del remoto si falta en local; con base distinta
  → gana el remoto; **sin base** → `planGithubMetadataPull` (espejo del de la app, paridad en
  `tests/electron/githubMetadata.test.ts`): copia de lo local en
  `<dir de ajustes del CLI>/github-metadata-backups/<ISO>/` y unión por `id` de groups/folders. El
  pull del CLI **no sube nada**: si lo local queda distinto del remoto avisa
  `<fichero> has local entries not on GitHub — run 'noteflow push' to upload` (el `push` sube todos los
  `METADATA_FILES`). Como la unión no es "el blob listado", la base no se fija hasta el `push`; un pull
  intermedio vuelve a unir, pero es idempotente (sale igual a lo local → sin escribir ni copiar).

⚠️ **Pendiente — CLI con Cloud + app con GitHub sobre el mismo `settings.json`:** un pull de Cloud
del CLI deja en disco notas con su `updated` original (antiguo) que no están en el repo de GitHub.
La app solo desactiva la regla de borrado si `cloudSync.enabled` (`isCloudSyncEnabledFailClosed` en
`electron/githubSync.ts`); no mira `cliCloud`, así que su siguiente pull de GitHub puede borrarlas
("ausente del remoto + `updated <= lastSync`"). Arreglo sugerido (no implementado):
`isCloudSyncEnabledFailClosed` devuelve true también con `cliCloud.enabled === true`, y el CLI marca
`githubSync.needsFullReconcile` en `cloud login` y `cloud logout` (espejo de
`enableCloudSync`/`disableCloudSync`).

### Catch-up en vivo de cambios externos (el CLI con la app abierta)

Ficheros de una carpeta de nota que **otro proceso** cambia en disco mientras la app corre — el CLI
`noteflow` sin sync propio: `task start` escribe `🤖id:running` en una sección, `task report` escribe
`agent.md`, `add`/`edit`… —. El watcher del dir de notas (`startNotesWatcher`, `main.ts`) solo recarga los
renderers; la subida la hace el catch-up en vivo. Lógica pura en `electron/liveCatchUpLogic.ts` (tests:
`tests/electron/liveCatchUp.test.ts`); E/S en `main.ts` (`noteExternalChange` / `runLiveCatchUp`) y en
cada backend (`planLiveCatchUp` de `cloudSync.ts` / `githubSync.ts`, expuesto en `SyncProvider`).

- **Qué entra:** cada evento del watcher que **no** es escritura propia (`recentInternalWrites`) sobre un
  `.md` directo de una carpeta de nota (`liveCatchUpTarget`: `note.md`, secciones, `agent.md`; nunca los
  json de la raíz, temporales de escrituras atómicas ni subcarpetas), y solo con el backend activo
  conectado. Se acumulan las rutas por carpeta y, a los `LIVE_CATCH_UP_DELAY_MS` (4 s) del **último**
  evento de esa carpeta, se evalúa una vez (una ráfaga del CLI = una pasada).
- **Qué sube** (`selectLiveCatchUpFiles`): solo los ficheros que el watcher **vio cambiar**, leídos de
  disco en ese momento. Con base (Cloud: `bases[rel].hash` vía `hashForBase`; GitHub: el sha cacheado vía
  `gitBlobSha`) solo si difieren de ella — un fichero igual a su base es el eco de un pull o algo ya
  sincronizado. **Sin base** (sección o `agent.md` recién creados, nota creada por el CLI) sube siempre,
  como un guardado de la app de un fichero nuevo: **sin** la compuerta de carpeta del catch-up post-pull
  (`updated` > `lastSync`), porque escribir `agent.md` no toca `note.md` y cada subida de la sesión mueve
  `lastSync` — la compuerta retendría justo lo que esto quiere subir. Un fichero que no se vio cambiar no
  entra aunque difiera de su base (eso es del journal o del pull: una op `stale`, una fusión pendiente).
- **Cómo sube:** por el `schedulePush` **guardado** del backend activo (con el indicador de
  `pendingPushFiles`): journal, debounce de 5 s, puerta de push, `localOnly`, puerta de origen y subida
  condicionada — no hay camino propio. Cloud con la puerta cerrada lo apunta en el journal (lo drena el
  primer pull). `planLiveCatchUp` devuelve `skip` si el backend está apagado, la elección de origen está
  pendiente, la nota ya no existe o es `localOnly`; en GitHub también con Cloud activo (el espejo pausado
  se pone al día en sus pulls). **GitHub con la puerta cerrada** (`githubLiveCatchUpGate`): su
  `schedulePush` guardado descarta la subida, y el catch-up del pull que abre la puerta solo toma un
  fichero sin base si el `updated` de `note.md` es posterior a `lastSync` — un cambio que solo toca
  `agent.md` no subiría nunca. Por eso, con el primer pull aún `pending`, la pasada devuelve **`retry`**
  y espera a que aterrice; con `failed` (sin red, token malo… hasta el siguiente pull, minutos después)
  devuelve `skip` en vez de sondear. Los aplazamientos (`retry` por pull en curso o primer pull pendiente,
  y el rearme por escritura propia) están acotados: tras `LIVE_CATCH_UP_MAX_RETRIES` (150, ~10 min) se
  descarta el conjunto de cambios de la carpeta; un cambio externo nuevo reinicia la cuenta.
- **Pulls:** los ficheros que escribe un pull de la app **no** van marcados como internos, así que el
  watcher los ve como externos. Mientras corre un pull (`pullsInFlight`, contador en el `pullNotes` de
  cada backend) la pasada devuelve `retry` y se rearma; al terminar, el pull ya registró sus bases y esos
  ficheros salen iguales a su base (no suben).
- **Guardados de la propia app:** si la app escribió esa carpeta en el último 1,5 s
  (`recentInternalWrites.has(dir)`), la pasada se rearma en vez de correr. No hace falta más: lo que se
  sube se lee de disco al disparar, y un `schedulePush` sobre una ruta con timer vivo lo **reemplaza** con
  el contenido de disco (lo último escrito gana; las subidas de un fichero van en serie y la segunda va
  contra la base que dejó la primera). Un editor con cambios aún no guardados no es asunto de main: su
  guardado posterior se sube por el camino normal.
- **Si el CLI sincroniza solo, no se hace** (`cliSyncsBackend`): evita subir dos veces lo mismo y la
  carrera entre las dos subidas. Se lee el `settings.json` **del CLI** (`cliConnect.readCliSettingsSnapshot`,
  ruta `cliSettingsPath`: en Windows `%APPDATA%\noteflow\settings.json`, que es el de la app instalada; en
  macOS/Linux `$XDG_CONFIG_HOME|~/.config/noteflow/settings.json`, distinto del de la app — se lee igual,
  es barato y así la regla es la misma en las tres plataformas). Espejo de cómo enruta el CLI:
  - **Cloud** = `cliCloud.enabled === true` + `cliAccount.refreshToken` (`cloudActive()` del CLI). Una
    sesión de **otra** cuenta (`cliAccount.userId` ≠ la cuenta de la app) no cuenta: su puerta de origen
    retendría las subidas.
  - **GitHub** = el CLI **no** está en Cloud y tiene `githubSync` habilitado con owner/repo y un token que
    puede leer (`resolveCliGithubToken`: su base64, o la copia `cliGithubToken` del mismo owner — el
    `safe:` de la app en el `settings.json` compartido de Windows no cuenta), y es el **mismo repo** que el
    de la app (sin distinguir mayúsculas).
  - Fichero ilegible ⇒ no se salta (mejor dos veces que ninguna).
- **Por qué la subida doble sería inocua de todos modos** (si el CLI subió primero y la base de la app
  sigue vieja): Cloud rechaza la subida como `stale` (base antigua), la op queda marcada y el pull la
  resuelve con `planFileReconcile` → `adopt` (local == remoto: se adopta como base, sin bloque ⚠️ ni
  copia); GitHub no hace el PUT (`upsertRemoteFileNow` → `identical`, mismo blob). Se salta igualmente
  para no generar esa ida y vuelta.
- **Límites:** (1) los **borrados** hechos por otro proceso (una sección borrada, `agent.md` quitado) no
  se propagan en vivo — la reescritura de `note.md` sí sube; el fichero huérfano remoto sigue las reglas
  de siempre. (2) Los **json de la raíz** escritos por el CLI (`groups.json`…) tampoco: solo recargan
  (`groups-updated`). (3) Un cambio externo dentro de la ventana de 1,5 s de una escritura propia de la
  misma carpeta lo ignora el watcher entero (ni recarga ni sube; ver `patterns.md` § "fs.watch de cambios
  externos"); sube en el siguiente cambio externo o en el catch-up del próximo arranque. (4) Si el CLI
  tiene sync configurado pero su propia puerta (origen, sesión caducada) le impide subir, la app tampoco
  sube: queda para el CLI (`noteflow push`). (5) El latido local de `noteflow task run` (cada 5 min solo
  `lastSignal` en `agent.md`, `patterns.md` § CLI) es un cambio externo más: con un CLI sin sync, la app lo
  sube también, así que `agent.md` sube cada ~5 min en vez de cada 10 mientras corre un agente.
  (6) **Linux:** no hay `fs.watch` recursivo; el watcher de una carpeta de nota recién creada (p. ej. por
  el CLI) se monta ~200 ms después del evento de la raíz (`refreshDirWatchers` en `main.ts`), así que las
  primeras escrituras de esa nota nueva pueden escaparse del catch-up en vivo: suben en el siguiente
  arranque de la app o con el siguiente guardado/cambio externo de la nota. (7) Cloud contra un servidor
  **sin la migración 0014** (filas sin `seq` ⇒ el pull no registra base): cada fichero que baja un pull
  sale "sin base" en el watcher y se vuelve a subir una vez.

### `agent.md` en el sync (tareas para agentes)

`agent.md` es el fichero **reservado** de una carpeta de nota con los informes de las tareas encargadas a
agentes (`note-format.md` § "Tareas para agentes"). Lo escriben sobre todo **otras máquinas** (el CLI de
un agente). **No es una sección**: ningún `note.md` lo lista. Sube y baja como un fichero de sección
porque los dos backends enumeran `<dir>/*.md` (`listLocalSyncPaths`, `flushPendingLocalChanges`,
`readLocalNoteFiles`, el espejo) y los planificadores trabajan por fichero. Lo específico — **toda
excepción cortocircuita por nombre** (`isAgentFilePath` / `AGENT_MD`, `electron/agentTasks.ts`): una nota
sin `agent.md` se sincroniza exactamente igual que antes. Espejo de las reglas del CLI (`patterns.md`
§ CLI). Tests: `tests/electron/agentTasksSync.test.ts` (planificadores puros).

- **Nunca entra en el índice.** `mergeAnchors` / `withKeptLocalSections` / `relistAnchorSections` solo
  añaden entradas que **ya lista** alguno de los dos anchors: aunque `agent.md` esté en disco, "conservado
  local" o "restaurado", no aparece en `sections:` (fijado con tests). El lector tampoco lo sintetiza como
  sección (`note-format.md`).
- **Sube** con `schedulePush('<dir>/agent.md')` cuando main lo escribe (`agent-tasks:dismiss` /
  `maintain`, vía `writeAgentFile` de `electron/agentTasksFile.ts`), y en los catch-ups como cualquier
  `.md`.
- **Un `agent.md` (o una sección) que escribió otro proceso** — el CLI de un agente en esta máquina —
  sube con el **catch-up en vivo** (§ "Catch-up en vivo de cambios externos", arriba) unos segundos
  después, si el sync de la app está activo y el CLI no sincroniza por su cuenta (si sincroniza, lo sube
  él). Sin base (`agent.md` nuevo) sube igual: no depende de la compuerta de carpeta. Con la app
  **cerrada**, lo sube el catch-up de después del primer pull al arrancar (`flushPendingLocalChanges`):
  con base, si difiere de ella; sin base, solo si el `updated` de `note.md` es posterior al último sync
  (un cambio que solo toca `agent.md` no abre esa compuerta: espera a la siguiente escritura de la nota).
  Hasta el 2026-11-21 no había catch-up en vivo, y este punto decía que «el estado de la tarea sí viaja
  (va en la línea)»: era falso con la app abierta — la línea `🤖id:running` que escribió el CLI se quedaba
  en local, y el servidor seguía en `queued` hasta reiniciar la app.
- **Pull de GitHub:**
  - *Refresco de la misma versión* (`planSectionRefresh`): `agent.md` se trata como **listado** aunque el
    anchor no lo liste (el filtro `isListedLocally` existe para no bajar secciones huérfanas de otra
    migración). Sin eso, un `agent.md` subido aparte (commit propio) no bajaba nunca mientras el anchor
    estuviera ya reconciliado.
  - *Carpeta entera* — los dos bucles que borran los `.md` locales que GitHub no tiene
    (`resolveRemoteDirConflict`, camino histórico, y el pull normal): un `agent.md` local **se queda**
    salvo que se hubiera **borrado allí** (`agentFileDeletedRemotely`: tenía base —sha cacheado— y el
    local no ha cambiado desde ella). En el camino de conflicto, además, se vuelve a subir
    (`schedulePushUnguarded`: sus ops se acaban de completar con las de la carpeta). En el pull normal no
    se sube desde ahí (ese camino también corre con GitHub como espejo de Cloud): lo sube su op pendiente
    o su siguiente escritura.
  - *Fusión de un conflicto* (`planGithubDirMerge`): `agent.md` se fusiona línea a línea como una sección.
    **Borrado en GitHub y cambiado aquí** → se trata como nuevo aquí (se queda y vuelve a subir); la regla
    de una sección en ese caso (borrado + copia de conflicto solo de ese fichero) crearía una nota-copia
    sin secciones. Borrado en GitHub y sin tocar aquí → se borra. Borrado aquí y cambiado en GitHub → vuelve
    la versión remota.
  - *Camino histórico (no fusionable)*: `agent.md` no cuenta como candidato a copia de conflicto.
- **Pull de Cloud:**
  - Tres vías (`planThreeWayDir`): como una sección. Si su fusión por líneas **falla** (nota cifrada, error
    del merge) el planificador pide copia de `agent.md`; `reconcileDirThreeWay` la filtra
    (`userFacingSectionFiles`): **la versión local de `agent.md` se pisa con la del servidor, sin copia**
    (se acepta: el estado de cada tarea vive en su línea; lo que se pierde es el informe/progreso local no
    subido de ese fichero).
  - Caminos sin base (carpeta entera más nueva / sección a sección): un `agent.md` con subida pendiente no
    dispara por sí solo una copia de conflicto de la carpeta (`preserveConflictCopy` lo saca de los
    candidatos).
  - Cloud no borra ficheros locales "que el remoto no tiene": solo aplica tombstones, así que un
    `agent.md` aún sin subir nunca corre peligro ahí.
- **Conflictos solo en `agent.md`: no se anuncian.** El aviso "merged with conflicts" (GitHub:
  `mergeGithubConflictDir`; Cloud: `reconcileDirThreeWay`) se calcula con `userFacingSectionFiles`: si el
  único fichero con marcas `> ⚠` es `agent.md`, no hay aviso (el usuario no ve ese fichero). El lector
  las resuelve solo y de forma determinista (`parseAgentDoc`: clave repetida → gana la última, la versión
  ya sincronizada) y se limpian en la siguiente escritura canónica (CLI, o `agent-tasks:maintain`).
- **Borrado remoto — nunca a ciegas** (otra máquina puede haber subido un `agent.md` con más bloques):
  - **Cloud** (`removeRemoteAgentFile`, usado por `scheduleDelete` y por el drenaje del journal cuando la
    ruta es un `agent.md`; las secciones siguen con el tombstone de siempre): compare-and-swap sobre el
    `seq` de la base — `PATCH files?path_key=eq.<k>&seq=eq.<seq>` con `Prefer: return=representation`
    (`conditionalDeleteQuery` / `conditionalDeleteOutcome`), mismo fallback 403 → `DELETE` físico **con la
    misma condición** y las mismas reglas de entitlement (`planRemoteDelete`). Fila devuelta → `deleted`
    (y se olvida la base: el nombre puede volver). Ninguna → `changed`: no se borra nada. **Sin base** →
    no se envía nada. En los tres casos la op del journal se completa.
  - Para que un borrado pendiente no esconda la fila que no pudo borrar: en el pull, si hay un `delete`
    pendiente de `agent.md` y llega una fila suya que el borrado condicionado no habría podido quitar
    (`agentDeleteYieldsToRow`: tombstone, sin base, o `seq` mayor que la base), la op **se retira** y la
    fila se aplica como cualquiera — una edición remota gana a un borrado local.
  - **GitHub**: el borrado de un fichero de nota ya era condicionado (`planConditionalDelete`): si cambió
    allí la op queda `stale` y el pull restaura la versión remota. Con base desconocida borra (regla
    histórica, igual que el CLI).
- **Espejo a GitHub con Cloud activo** (`mirrorPlan.ts`): `agent.md` es un fichero más de la carpeta — se
  sube si cambió y se borra del espejo si la nota ya no lo tiene (`isMirrorDeletable`).
- **Límites conocidos:** (1) una copia de conflicto de **carpeta entera** copia `agent.md` y las secciones
  con sus marcadores → los ids quedan en dos notas (el CLI lo detecta: `patterns.md` "Id repetido").
  (2) Cloud, nota **nueva** en este dispositivo cuyo `agent.md` llegó en un pull anterior al de su anchor
  (carrera entre subidas de otra máquina): el pull de carpeta entera solo va a buscar las secciones
  **listadas**, así que ese `agent.md` no baja hasta su siguiente cambio remoto (no se añadió una petición
  extra por nota para no cambiar el pull de las notas sin `agent.md`). (3) GitHub: `agent.md` sigue la
  regla de la carpeta cuando no hay bases (primera conexión): *último en escribir gana* por `updated`.
  (4) Los caminos de `githubSync.ts`/`cloudSync.ts` que ejecutan estos planes (disco + red) no tienen test
  propio: están cubiertos por lectura; lo testeado son los planificadores y los helpers puros.

### La línea de una tarea de agente en la fusión (`mergeSectionText`) y la subida de `noteflow task`

Caso real (2026-11-21): un agente hizo `task start` → `report` → `finish` con Cloud mientras la app de
escritorio, abierta sobre el mismo dir de notas, sincronizaba por su cuenta (su propio almacén de bases).
Varias subidas salieron `stale` y el `pull` tras el `finish` dejó la línea de la tarea **dos veces**
entre marcas ⚠️ (`- [x] … 🤖id:done` local, `- [ ] … 🤖id:running` remoto), con lo que
`resolveAgentTask` fallaba ("Task id … is on 2 lines"). Desde CLI v2.18.2:

- **Regla de fusión** (`unionPieces` → `settleAgentTaskHunk` → `pickAgentTaskLine`; fuente
  `electron/cloudSyncLogic.ts` + `electron/agentTasks.ts` ≡ `src/lib/agentTasks.ts`, espejo en
  `cli/noteflow.js`; vale para Cloud y para la fusión de GitHub, que reutilizan `mergeSectionText`): un
  trozo con líneas de los dos lados **no es conflicto** si empareja línea a línea (mismo nº de líneas) y
  cada par es idéntico o **la misma tarea de agente** — las dos son ítems de tarea, marcador con el
  mismo id, e iguales quitando el estado de la casilla y el del marcador (sangría, viñeta, texto y
  anotaciones cuentan). De cada par gana la **línea entera** (casilla incluida), en este orden:
  **(1) la base manda** — en el camino diff3, si una de las dos líneas es literalmente una línea de la
  base de ese trozo y la otra no, ese lado **no tocó** la tarea y gana la **otra**, sean cuales sean los
  estados (bajar de rango es normal: `task start` reinicia una tarea `interrupted`/`failed`/`review`,
  y el rango nunca debe deshacerlo); **(2) el rango**, solo si los dos lados la cambiaron respecto a la
  base o no hay contenido de base: `queued` < `running` = `waiting` < `interrupted` < `review` <
  `done` = `failed` (`AGENT_STATE_RANK`; `interrupted` lo escribe el envoltorio de `run` sobre una
  tarea viva cuando su agente ya salió, por eso va después); **(3) empate** de rango (o mismo estado con
  otra casilla) → la línea **local** (el dispositivo que fusiona). Un estado que esta versión no conoce
  no se juzga por rango (conflicto, como antes), igual que cualquier otro caso: texto distinto, ids
  distintos, un lado sin marcador, nº de líneas distinto. También se aplica cuando los dos lados
  **añadieron** la línea (la base no la tenía): queda una vez, no dos. **Límite conocido:** sin
  contenido de base (unión de dos vías: blob ausente, base sintetizada) no se sabe qué lado cambió, así
  que decide el rango: un `task start` que **reinicia** una tarea `interrupted`/`failed`/`review` pierde
  ahí contra el estado viejo del otro lado (la línea vuelve a ese estado y el siguiente `task report`
  lo rechaza; se arregla con otro `task start`). Con base, el reinicio gana. Tests: `tests/electron/agentTaskMerge.test.ts` (app y CLI, mismos casos + paridad).
- **Por qué chocaba aun con la base correcta:** el diff3 solo deja "estables" las líneas de la base que
  siguen en los **dos** lados. Si la línea contigua a la tarea también cambió en remoto (la app la
  reescribió en el disco compartido y la subió) no hay línea estable entre los dos cambios: es un único
  trozo "cambiado en los dos lados", se refina con la unión de dos vías y esta ve dos versiones de la
  línea de la tarea aunque el remoto no la tocara. Las otras dos vías a lo mismo son una base sin
  contenido guardado (unión directa) y una base anterior (`queued`).
- **`noteflow task …` no deja la subida a medias** (`syncAgentWrite` →
  `pushNoteFiles(…, { healStale: true })` → `cloudHealStaleUploads`): ante ficheros `stale` hace **un**
  `cloudPullNow` (fusiona y resube lo pendiente; lo que imprime va a stderr) y, si aún queda algo
  pendiente de esa carpeta, **un** reintento de subida (no si la carpeta está en `pullRetry`: puede
  estar a medio aplicar). `Synced to NoteFlow Cloud` solo si no queda nada pendiente; si no, la pista de
  siempre con el recuento. Sin bucles y sin reescribir nada de la tarea: sube los ficheros tal como
  los dejó el pull. El resto de comandos (`add`, `set`, `touch`…) y GitHub, sin cambios. **El pull no
  toma el lock de la nota** (igual que `noteflow pull` o el pull previo de `task start`): que su
  lectura-plan-escritura por carpeta sea síncrona solo evita intercalados **dentro de ese proceso**, no
  frente a otro proceso del CLI que escriba la misma nota a la vez (un `task report` bajo lock podría
  pisar lo recién fusionado, o al revés). Por eso el **latido de `noteflow run` no usa la cura**: correría
  un pull completo en paralelo con los comandos del agente; ante un `stale` deja la pista, como antes.
- **Bases entre procesos del CLI:** `refreshCliCloudBases` relee `cli-cloud-state.json` al empezar cada
  push de comando y cada pull (un `noteflow run` vive horas y sus latidos subían contra los seqs que
  leyó al arrancar → `stale` espurios en cuanto el agente sincronizaba). La poda de
  `cli-cloud-base-content/` (`pruneCliBaseContents`) juzga contra el fichero **actual**, no borra
  contenidos de menos de 10 min (un proceso guarda el contenido **antes** de guardar la base que lo
  referencia; volver a guardar un contenido que ya estaba renueva su fecha) y no poda si no conoce ninguna base de sección. Tests: `tests/cli/agentTasksCloud.test.ts`,
  `tests/cli/cloudThreeWayPull.test.ts`.

### Notas solo-locales (`localOnly: true`) — nunca se sincronizan

Una nota cuyo `note.md` lleva `localOnly: true` (clave de primer nivel; ver `note-format.md`) **no sale
nunca de este dispositivo**. Hoy solo la tiene la **nota de bienvenida** de la primera ejecución
(`electron/welcomeNote.ts`, ver `architecture.md` § `welcomeNoteSeeded`): si el usuario instala en un
segundo equipo que ya sincroniza con su cuenta o su repo, esa nota no aparece en los demás ni en el remoto.
Sigue siendo local **aunque se edite** (los tres espejos del formato conservan la clave); no hay UI para
"convertirla en normal" — el propio texto de la nota lo explica y basta con copiar lo que interese a otra.

La marca vive **en la nota** (sobrevive reinicios y la ve el CLI). Módulo `electron/localOnlyNotes.ts`
(testeado en `tests/electron/localOnlyNotes.test.ts`): `isLocalOnlyNoteMd` (puro, solo mira el
frontmatter; solo cuenta el booleano **sin comillas** `true`/`True`/`TRUE`, igual que los parsers, que
descartan `"true"` como string), `isLocalOnlyDir`/`isLocalOnlySyncPath` (leen el ancla) y
`listSyncedNoteDirs` = `listNoteDirs` menos las solo-locales. **Borrados:** cuando llega el `scheduleDeleteDir` la carpeta ya no
existe en disco (`applyNoteDelete` la borra antes), así que `isLocalOnlyDir` **recuerda en memoria** cada
carpeta que vio con la marca y responde por ella; `main.ts` la ceba al arrancar
(`primeLocalOnlyDirs(NOTES_DIR)`, justo tras crear la de bienvenida y antes de cualquier código de sync).

Dónde se aplica la exclusión (sin journal, sin request, `onComplete` inmediato):
- **GitHub (`githubSync.ts`):** `schedulePush`, `pushPathsNow` (salta esas rutas), `scheduleDelete`,
  `scheduleDeleteDir`; `listLocalSyncPaths` usa `listSyncedNoteDirs` (→ `pushAllNotes`, migración remota
  v2 y **espejo** `mirrorToGitHub`); el catch-up del pull (`flushPendingLocalChanges`) y la **regla de
  borrado del pull** comprueban `isLocalOnlyNoteMd` sobre el ancla que **ya leen** (sin I/O extra; en la
  regla, solo para las carpetas ausentes del remoto). Sin esto la regla la borraría: está ausente del
  repo por diseño y su `updated` acaba siendo `<= lastSync`. Cubierto e2e contra un GitHub simulado en
  `tests/electron/localOnlySync.test.ts`.
- **Cloud (`cloudSync.ts`):** `schedulePush` (tampoco se journala con la puerta cerrada), `pushPathsNow`,
  `scheduleDelete`, `scheduleDeleteDir` y el catch-up `flushPendingLocalChanges` (primera subida de todo
  el corpus; mismo chequeo sobre el ancla ya leída). El pull no toca carpetas que el servidor no tiene,
  así que no necesita nada más. Test: `tests/electron/localOnlyCloud.test.ts`.
- **Metadatos de raíz** (sí se sincronizan): `note-order.json` puede llevar el **id** de la nota de
  bienvenida si el usuario la reordena, y `section-colors.json` los **nombres** de sus secciones si les
  pone color. En los demás dispositivos son referencias colgantes inofensivas (un id de orden sin nota se
  ignora; un color por nombre solo se aplica a secciones que se llamen así).
- **`main.ts`** no filtra nada: todo pasa por esas funciones (escrituras del editor, imports, tools del
  chat con push durable, borrados, caducidad de temporales).
- **CLI (`cli/noteflow.js`, desde 2.12.0):** espejo `isLocalOnlyNoteMd`/`isLocalOnlyNoteDir`;
  `syncPushNoteFiles` no sube nada de esas notas (imprime `Local-only note — not synced` si hay backend),
  `push` (GitHub) y `cloud push` las excluyen (`listSyncedNoteDirs`), `delete` y `section delete` no
  borran en remoto, y el aviso del `pull` de GitHub "N local notes are not on GitHub" no las cuenta (si
  no, `lastSync` no avanzaría nunca). ⚠️ Un CLI **anterior a 2.12.0** sí la subiría con `noteflow push`.
- **IA:** sin excepción — se indexa y la ve el chat como cualquier nota (es contenido del usuario en
  cuanto la edita, y el agente puede usarla para responder "¿cómo hago…?"). Con la IA desactivada por
  defecto, en la primera ejecución no se indexa nada.

> **Notas vinculadas ≠ solo-locales.** Una nota vinculada (un archivo de texto externo editado en su sitio, ver
> `patterns.md` § "Notas vinculadas") tampoco se sincroniza nunca, pero por otra vía: **no está en el dir de
> notas** (archivo del usuario + registro en `userData/linked-notes.json`), así que ningún camino de sync,
> export, import, CLI ni el watcher del dir de notas la ve, sin flags ni filtros (su grupo/carpeta también
> van en el registro local). Ni siquiera su **id** sale: `note-order:set` quita los ids `lnk:…` de
> `note-order.json` y guarda su posición en el orden local del registro (`note-order:get` lo recombina), y
> los que una build previa llegara a escribir se limpian del fichero al leerlo.

### Origen del dir de notas (`settings.syncOrigin`) — preguntar antes de mezclar remotos

**Problema que resuelve.** El dir de notas no sabía de qué remoto venía: conectar GitHub al repo A,
desconectar (`disconnectGitHub` deja las notas en disco) y conectar al repo B hacía `pullNotes` +
`pushAllNotes` y **subía las notas de A a B sin preguntar**; en NoteFlow Cloud, cerrar sesión con la
cuenta A y entrar con B (con la auto-activación de lo pagado) subía las notas de A a B. Ahora cada backend
recuerda la identidad con la que este dispositivo reconcilió el dir y, si la identidad **cambia (o el
registro está `stale`) y hay notas sincronizables en disco**, no sincroniza nada hasta que el usuario
elige.

**Dato** (`userData/settings.json`, local, nunca en el dir de notas; forma estable — la app y el CLI la
leen y escriben): `syncOrigin: { github?: { repoId?: number; owner: string; repo: string; stale?: true;
notesDir?: string }, cloud?: { userId: string; email?: string; stale?: true; notesDir?: string } }`.
- `cloud.email` = email de la cuenta al registrarla: **solo etiqueta** del diálogo, nunca se compara.
- `stale` (solo se escribe `true`; ausente = vigente): las notas en disco **ya no vienen** de ese remoto —
  el "usar solo las de…" del **otro** backend las sustituyó (ver "Cruce entre backends"). Toda adopción
  (`withSyncOrigin`) escribe el registro sin él. El CLI nunca lo escribe (solo lo lee).
- `notesDir` = el dir de notas que describe el registro (`path.resolve`, sin separador final), escrito en
  toda adopción/resolución; ausente = el **dir por defecto** (ver "Un registro por dir de notas").
`repoId` = `id` numérico de la API de GitHub (sobrevive a renombrar/transferir el repo);
se escribe siempre que se conoce — la app lo obtiene **antes** de adoptar (Device Flow: `ensureRepo`;
pull: el mismo `GET /repos/{o}/{r}` de la rama por defecto, cacheado **por repo**, sin request extra) —,
así que solo falta si ese GET falló en ese momento (el siguiente pull OK lo rellena). Readoptar el
**mismo** repo con una identidad que aún no lo trae (p. ej. para añadir el `notesDir` a un registro
anterior) **conserva el `repoId` ya guardado** (`withSyncOrigin`; el resto del registro se escribe
nuevo y `stale` nunca se conserva). También se guarda en `settings.githubSync.repoId`. **Comparación:** por `repoId` si ambos lados lo tienen; si no,
`owner/repo` sin distinguir mayúsculas. Escrituras con read-modify-write sobre el fichero, que
rechazan escribir si el fichero existe y no parsea: GitHub escribe el origen con `withSyncOrigin` dentro
de `adoptGithubOrigin` (la misma escritura que limpia `githubSync`, ver abajo); `writeSyncOriginFile`
queda exportado para los backends que solo necesiten fijar el origen (Cloud, CLI). `disconnectGitHub` **no** lo
borra: las notas en disco siguen viniendo de ese repo.

**Decisión pura** (`electron/syncOrigin.ts`, sin Electron, agnóstica del backend; tests en
`tests/electron/syncOrigin.test.ts`): `decideOrigin({ stored, next, hasLocalNotes, dirs? })` →
- con `dirs` (`{current, default}`) y el registro de **otro** dir — o sin registro fuera del dir por
  defecto → `proceed` **sin** adoptar (`foreign-dir`): nada se usa, escribe ni resetea;
- sin origen guardado → `proceed` + adoptar, **sin diálogo** (primera conexión, o instalación previa a
  esta feature con conexión viva — mismo criterio que el "Dueño desconocido" de Cloud en
  `monetization.md`);
- registro `stale` **con** notas → `ask` (con `stale: true`, **aunque la identidad coincida**); **sin**
  notas → `proceed` + adoptar (`stale-empty`, con el mismo reset del estado del remoto que `changed-empty`);
- misma identidad → `proceed` (adopta solo para refrescar un renombrado, un `repoId` o un `email` que
  faltaba o cambió, o el `notesDir` de un registro anterior a él);
- distinta **sin** notas sincronizables → `proceed` + adoptar (`changed-empty`);
- distinta **con** notas → `ask`.
"Notas sincronizables" = `listSyncedNoteDirs(notesDir)` no vacío (las `localOnly` no cuentan; las
vinculadas no están en el dir). `hasLocalNotes` es perezoso (solo se lista si la identidad cambió o el registro está `stale`) y
**fail-closed** (`hasSyncedLocalNotes`: dir ilegible o desconocido = "hay notas"; dir inexistente = no).
Helpers: `sameIdentity`, `identityLabel` (`owner/repo`; Cloud: email o userId), `identityArchiveLabel`
(`github-owner-repo` / `cloud-<8 chars del userId>`, saneado para nombre de carpeta), `readSyncOrigin`,
`getStoredIdentity`, `withSyncOrigin`, `withOriginMarkedStale`, `withSeededOrigin`,
`resolveStoredCloudOrigin` (puros sobre un objeto settings), `defaultNotesDir`, `normalizeNotesDir`,
`sameNotesDir`, `originScope`, `readSettingsStrict`, `writeSyncOriginFile`, `markSyncOriginStaleFile`.

**Un registro por dir de notas (`notesDir`).** `settings.json` lo comparten todos los dirs a los que un
proceso puede apuntar (`NOTEFLOW_NOTES_DIR`, y el CLI en Windows), pero el origen describe UN dir. Antes
de esto, un override vacío conectado a B daba `changed-empty`, adoptaba B, y el dir real —con notas de A—
veía luego "misma identidad" y sincronizaba con B sin preguntar. Regla (la aplican las dos puertas de la
app y el CLI): el registro de un backend solo cuenta si `sameNotesDir(record.notesDir ?? defaultNotesDir(),
dirActual)`. `sameNotesDir`: `path.resolve` de ambos, sin separadores finales; sin distinguir mayúsculas
en win32 y darwin, exacto en linux; **sin** `realpath`. `defaultNotesDir()` (en `syncOrigin.ts`, sin
Electron; `main.ts` lo usa para `NOTES_DIR`, así que no hay dos copias de la ruta) = linux
`~/.local/share/noteflow-notes`, resto `~/noteflow-notes`.
- Registro del dir actual → todo como siempre (y la adopción escribe `notesDir`).
- Registro de **otro** dir → no se usa ni se reescribe: `foreign-dir` (`proceed` sin adoptar, sin el reset
  de `changed-empty`, sin elección pendiente — `resolveOriginChoice`/`resolveCloudOriginChoice` →
  `not-pending`). Al volver al dir real, registro A vs conexión B con notas → `ask`.
- **Sin registro y dir actual ≠ dir por defecto** → `proceed` sin escribir: si no, un override vacío
  registraría el remoto nuevo y el dir real quedaría sin protección. En la práctica solo el dir por defecto
  tiene registros.
- `stale` solo se marca en el registro del otro backend si es del mismo dir que el `replace`; la siembra de
  Cloud desde `cloudSync.userId` al evaluar la puerta (abajo) y la de GitHub desde `githubSync` solo
  ocurren en el dir por defecto. Excepción deliberada: la siembra **previa a un reset de dueño**
  (`bindCloudSyncToAccount`) graba siempre el dueño que se va **para el dir por defecto**, también desde un
  override — allí ese registro es ajeno y no cambia nada, pero al volver al dir por defecto protege sus
  notas (peor caso, una pregunta de más; nunca una subida).
- Efecto aceptado: con override se siguen compartiendo `githubSync`/`cloudSync`/`lastSync`/journal
  (`NOTEFLOW_NOTES_DIR` no aísla los ajustes); el origen solo protege el dir al que pertenece. Las puertas
  toman el dir actual de `setNotesDir`/`initCloudSync` (antes de eso asumen el por defecto).

**La puerta de GitHub es un ESTADO derivado, no un flag** (`refreshOriginGate()` en `githubSync.ts`):
se calcula de (conexión `settings.githubSync`, `syncOrigin.github`, notas en disco, `cloudSync.enabled`,
el dir de notas)
→ `'clear' | 'ask' | 'unreadable'`. Una sola fuente de verdad, sobrevive a un reinicio sola y detecta
la conexión cambiada **por el CLI** (en Windows comparte `settings.json` y su `login` puede dejar
`githubSync` en otro repo sin pasar por la app). Se cachea en memoria y se recalcula en
`loadSyncSettings` (arranque — `main.ts` llama antes a `setNotesDir`), al final del Device Flow, al
activar/desactivar Cloud (`enableCloudSync`/`disableCloudSync`), en la resolución, en `disconnectGitHub`
y al inicio de `pullNotes`, `retrySyncJournal` (el tick drena **antes** de hacer pull) y `pushAllNotes`.
Las rutas calientes usan el valor cacheado (`originGateBlocked()`).
- **Bloqueada** (`ask` o `unreadable`): ni pull, ni push (`schedulePush`, `schedulePushUnguarded`,
  `pushPathsNow`, `pushAllNotes`), ni borrados (`scheduleDelete`/`scheduleDeleteDir`: no-op **sin
  journal** — la resolución resetea el journal), ni drain, ni espejo (`error: 'origin-choice-pending'`),
  ni `migrateRemoteToV2IfNeeded`. Chequeo **dentro del motor** (defensa en profundidad) además de los call
  sites de `main.ts`. Al pasar a bloqueada se cancelan los timers de push y `initialPullStatus` vuelve a
  `'pending'` (se queda ahí: el timeout del arranque en modo startup **no** la pone en `'failed'` si la
  causa es la puerta). Un `pullNotes` bloqueado devuelve un resultado vacío con `incomplete: true` (no
  cuenta como pull limpio para la caducidad de notas temporales). `SyncStatus.originChoice` =
  `{previous: {owner, repo}, next: {owner, repo}}` solo en `ask`; el cambio se emite por el
  `statusListener` (→ `sync:status-changed`).
- **`unreadable`** (`settings.json` existe y no parsea, **o** una adopción no se pudo escribir — EPERM,
  disco lleno, un `rename` que Windows sigue rechazando): bloquea sin diálogo y
  se reintenta en la siguiente evaluación; un error de lectura o escritura nunca "abre" la puerta (vale
  para `changed-empty` y también para `no-origin`).
- **Con NoteFlow Cloud habilitado** GitHub es espejo de solo escritura y el dueño del dir es la cuenta de
  Cloud: la puerta es `clear` y un refresco **no toca** `syncOrigin.github`. Excepción: el **Device Flow
  explícito** (conectar GitHub desde la app con Cloud activo, `adoptConnectedRepoUnderCloud`) adopta el
  repo conectado y le quita el `stale` (con reset del estado del remoto si el registro guardado era otro
  repo o estaba `stale`); un registro de otro dir no se toca.
- **El estado es de un repo (`sync-state.json` → `githubRemote`).** El CLI comparte `settings.json` en
  Windows y su `noteflow origin merge` / `login --merge` puede cambiar a la vez la conexión y
  `syncOrigin.github` **sin pasar por `adoptGithubOrigin`**: la puerta vería "misma identidad" con el
  journal (subidas/borrados pendientes) y los shas del repo ANTERIOR, y la app abierta con su `lastSync`
  viejo en memoria. Por eso `sync-state.json` lleva estampado el repo que describe (`{repoId?, owner,
  repo}`, como el `cli-github-state.json` del CLI): `persistState` lo rellena si falta (con la conexión
  viva) y completa uno del **mismo** repo según `sameIdentity` (el `repoId` que le faltaba, el
  owner/repo nuevo de un renombrado con el mismo `repoId`) — así un renombrado posterior no descarta un
  journal legítimo —, pero **nunca** relabela uno de otro repo; la adopción con reset lo escribe y la sin
  reset lo completa. Al principio de
  `refreshOriginGate` (y por tanto de `pullNotes`, `retrySyncJournal`, `pushAllNotes`),
  `ensureStateOfConnection` compara la marca con la conexión viva (`sameIdentity`) y, si no coincide,
  **descarta** el estado en el orden estricto de `adoptGithubOrigin`: (1) journal y shas vacíos con
  escritura que propaga errores (todavía marcados con el repo VIEJO, para que un fallo posterior se
  rehaga), (2) un solo read-modify-write que quita `lastSync`/`remoteFormatMigratedAt` del `githubSync`
  leído del fichero, (3) memoria: `syncSettings` recargado del disco y la marca pasa al repo vivo. Si falla
  → la puerta queda `unreadable`. Un estado **sin** marca (de una build anterior) pertenece a la conexión
  viva y se estampa al persistir. (Cloud no lo necesita: su journal va ligado a `cloudSync.userId` y
  `bindCloudSyncToAccount` lo compara con la sesión **de la app**; el CLI usa su propia sesión y estado.)
- **Adopciones `proceed` se escriben YA** (en la decisión, antes del pull): un crash a mitad no puede
  parecer luego un cambio de identidad. `changed-empty` y la resolución **resetean el estado del remoto
  anterior**: journal + caché de shas (`sync-state.json` — un `deleteDir` pendiente de A nunca debe
  ejecutarse contra B, y los shas de A no son base para B), timers de push, avisos de conflicto,
  `lastSync` (con el `lastSync` de B que dejó el CLI, la regla de borrado del pull **borraría** las notas
  locales que B no tiene) y `remoteFormatMigratedAt`. Todo en `adoptGithubOrigin`, **estricto** y en este
  orden: (1) `sync-state.json` se reescribe vacío (estampado con el repo nuevo) y la escritura **tiene que**
  salir bien (no usa `persistState`, que se traga el error); (2) **un solo read-modify-write** de
  `settings.json` quita `lastSync`/`remoteFormatMigratedAt` del `githubSync` **leído del fichero** y
  escribe `syncOrigin.github` a la vez (sin estado intermedio; token y claves ajenas intactos — y, en un
  `replace`, marca `syncOrigin.cloud` `stale` en esa misma escritura); (3) solo entonces
  se actualiza la memoria. Cualquier fallo (fichero ilegible o no escribible, también en el primer paso) →
  `false` → la puerta queda `unreadable` y se reintenta desde lo que diga el disco. Así el disco nunca
  tiene "origen = B" junto al journal, los shas o el `lastSync` de A. Si el paso 1 sale bien y el 2
  falla, el journal de A ya se perdió pero el origen sigue siendo A y la puerta cerrada (se rehace en el
  siguiente intento). `pullNotes` relee `syncSettings` tras evaluar la puerta (si esta adoptó dentro del
  propio pull, `lastSync`/`needsFullReconcile` ya son los reseteados, no los del remoto anterior).

**Flujo del Device Flow** (`schedulePoll`): token → `validateToken` → `ensureRepo` (devuelve el
`repoId`) → guarda `settings.githubSync` → evalúa la puerta. Si no es `clear` →
`onComplete({ ok: true, owner, repo, pendingOriginChoice: true })` **sin** pull ni push; `sync:initiate`
emite `sync:status-changed`, arranca el autosync (el tick se salta solo) y **no** lanza la migración v2.
Si es `clear`, el flujo de siempre (pull + `pushAllNotes` en segundo plano).

**Resolución** (IPC `sync:resolve-origin`, `choice: 'merge' | 'replace' | 'cancel'`; guarda de
reentrada):
- `merge` → `githubSync.resolveOriginChoice('merge')`: adopta el origen (el usuario consintió), resetea
  el estado del remoto anterior, abre la puerta, `pullNotes` y `pushAllNotes` en segundo plano (el
  connect de siempre); `main.ts` hace `broadcastPullResult`, autosync, drain y migración v2.
- `replace` → primero `archiveLocalNotesForOriginSwitch(label, origin, {stillValid})` en `main.ts`
  (abajo). Tras las esperas (ventanas, guardados pendientes: hasta ~3,5 s) y justo antes del archivo
  síncrono, `stillValid` re-comprueba que la elección sigue pendiente y es la misma (mismo
  `previous`/`next`, conectado, Cloud apagado); si no → `error: 'not-pending'` sin mover nada. Si el
  archivo falla →
  `{ok:false, error:'archive-failed', detail}` **sin pull** y la puerta sigue pendiente. Si va bien,
  `resolveOriginChoice('replace')` = lo mismo que `merge` **sin** `pushAllNotes`. `resolveOriginChoice`
  comprueba el estado **cacheado** (re-derivarlo tras archivar daría "sin notas" → `changed-empty`) y
  acepta también que la puerta ya se resolviera sola con el repo conectado adoptado.
- `cancel` → `disconnectGithubSync()` (lo mismo que `sync:disconnect`, incluido
  `cliConnect.cleanupAfterAppGithubDisconnect()`); notas y origen intactos.
- El IPC acepta un segundo argumento `backend?: 'github' | 'cloud'` (por defecto `'github'`; la guarda de
  reentrada es común): si ese backend no tiene elección pendiente → `not-pending` (también `cancel`). Y un
  tercero, `key`: la clave opaca de la elección que el usuario tiene en pantalla
  (`ActiveSyncStatus.originChoice.key`, `electron/originChoiceKey.ts` — GitHub: los dos repos y `stale`;
  Cloud: las dos cuentas, `stale` y `staleFrom`); si la elección pendiente ya no es esa (otra cuenta, el
  CLI cambió el repo…) → `not-pending` y no se aplica nada. Sin `key` (llamadas antiguas) no se comprueba.
  Con un registro `stale` del mismo repo, `resolveOriginChoice` no lo da por adoptado
  (`alreadyAdopted` exige `!stale` y que el registro sea de este dir): lo adopta con reset.

**Puerta de NoteFlow Cloud** (`refreshCloudOriginGate()` en `cloudSync.ts`, mismo modelo que GitHub;
tests e2e en `tests/electron/syncOriginCloud.test.ts` con un Cloud simulado de dos cuentas):
- **Estado derivado y cacheado** `'clear' | 'ask' | 'unreadable'` de (`cloudSync.enabled`,
  `account.getUserId()` de la app, `syncOrigin.cloud`, notas en disco, dir de notas). Cloud apagado, no
  configurado o sin sesión → `clear`. Se recalcula en `initCloudSync` (arranque),
  `bindCloudSyncToAccount` (cada cambio de cuenta), `enableCloudSync`/`disableCloudSync`, la resolución y
  al inicio de `pullNotes`/`retrySyncJournal`; las rutas calientes usan el cacheado
  (`cloudOriginBlocked()`, que lo re-deriva si se calculó para otra cuenta). Guarda de reentrada: el
  `statusListener` que emite una adopción no vuelve a derivarla.
- **Siembra** (instalaciones previas): sin `syncOrigin.cloud` pero con `settings.cloudSync.userId` (el
  dueño del journal/`pullSeq`), el origen guardado ES ese userId y se persiste (estricto) antes de decidir
  (`resolveStoredCloudOrigin`). `bindCloudSyncToAccount` siembra **antes** de que `resetCloudSyncState`
  sobrescriba `cloudSync.userId` (si no, quien cerró sesión con A antes de actualizar y entra con B
  adoptaría B sin preguntar). Si la siembra no se puede escribir, **no resetea**: el dueño sigue siendo A y
  todo queda bloqueado (`ownerMismatch()`: estado de otra cuenta = puerta cerrada; `enableCloudSync` no
  fija `userId` en ese caso) hasta que se pueda. Sin origen y sin `cloudSync.userId` → `no-origin`,
  adopta sin preguntar (= "Dueño desconocido"). Al evaluar la puerta solo se siembra en el dir por
  defecto; la siembra previa al reset de dueño graba siempre para el dir por defecto (ver "Un registro por
  dir de notas").
- **Bloqueada** (`ask`, `unreadable` o `ownerMismatch`): nada de Cloud se mueve. `pullNotes` devuelve un
  resultado vacío con `incomplete: true` (sin tocar `lastSync` ni poner `initialPullStatus = 'ok'`, así
  que tampoco hay catch-up); `retrySyncJournal` no drena; `schedulePush` (`onComplete('sync-gated:origin-choice')`),
  `schedulePushUnguarded`, `pushPathsNow`, los timers al dispararse, `scheduleDelete`/`scheduleDeleteDir`
  son no-op **sin journal** (la resolución resetea el journal); `flushPathForSnapshot` → `'gated'` (el
  snapshot del historial de versiones responde error, sin RPC); y, como defensa en profundidad,
  `uploadFileRow`/`removeRemoteByPathKeys` comprueban la puerta justo antes de enviar. Al pasar a bloqueada
  se cancelan los timers de push y `initialPullStatus` vuelve a `'pending'`. En `main.ts`:
  `runCloudSyncCycleOnce` re-deriva la puerta y sale pronto (emite estado, ni unlock ni pull ni drain), el
  tiempo real no arranca (`syncCloudRealtimeState`), "Mirror to GitHub" → `'origin-choice-pending'` y el
  pull manual (`cloud:pull`/`sync:pull-active`) → `error: 'origin-choice-pending'`.
  `CloudSyncStatus.originChoice` = `{previous:{userId,email?}, next:{userId,email?}, stale?, staleFrom?:
  {owner,repo}, githubConnected?}` solo en `ask` (`githubConnected` se calcula al leer, no se cachea).
- **Adopción estricta** (`adoptCloudOrigin`), mismo orden que GitHub: (1) settings legible; (2) con reset:
  `cloud-sync-state.json` reescrito vacío con escritura que propaga errores (journal + bases), base
  contents (`clearBaseBlobs`), caché de claves de nota, timers, avisos de conflicto, `stateGeneration++`
  (lo que estuviera en vuelo no persiste nada); (3) **una** read-modify-write de `settings.json` que quita
  `pullSeq/pullCursor/lastSync/pullRetry/basesBootstrapped/basesBootstrapPending` del `cloudSync` leído
  del fichero, fija `cloudSync.userId` y escribe `syncOrigin.cloud = {userId, email, notesDir}` sin
  `stale` — en un `replace`, marcando además `syncOrigin.github` `stale` en esa misma escritura —;
  (4) memoria e `initialPullStatus = 'pending'`. Fallo → `false` → `unreadable`. Reset siempre, salvo
  `same` no-stale y `no-origin` (que tampoco tocan `cloudSync.userId`: eso es de `bindStateOwner`).
  Encaja con el reset por cambio de cuenta de `bindCloudSyncToAccount` (ver `monetization.md` "Dueño de la
  cuenta"): la adopción es idempotente con él.
- **Resolución** (`sync:resolve-origin(choice, 'cloud')` → `resolveCloudOrigin` en `main.ts`):
  `merge` → `resolveCloudOriginChoice('merge')` (adopta con reset) + ciclo manual: unlock → pull (primer
  sync de la cuenta) → el catch-up sube todo lo local → drain. `replace` →
  `archiveLocalNotesForOriginSwitch` con etiqueta `identityArchiveLabel` de donde venían las notas (la
  cuenta anterior; con `stale`, el repo `staleFrom`) y `stillValid` = Cloud encendido, misma sesión y
  misma elección pendiente; error → `archive-failed`, nada adoptado ni bajado; OK → adopta (marca GitHub
  `stale`), `disconnectGithubSync()` si GitHub estaba conectado (su repo tiene las notas apartadas; incluye
  la limpieza del CLI) y ciclo (solo baja: no queda nada sincronizable que subir). `cancel` →
  `disableCloudSync()` + `stopCloudAutoSync()` + `dropRestoreSurface('cloud')`: sesión, notas y origen
  intactos; no vuelve a preguntar hasta que el usuario encienda Cloud a mano (o un login nuevo reactive lo
  pagado, ver `monetization.md`).
- **"Connect the CLI too"** (`cli-connect:*`) se rechaza con `originChoicePending` mientras la elección del
  backend correspondiente está pendiente (GitHub: también con su puerta cerrada); la UI deshabilita el botón
  con la explicación.

**Cruce entre backends (`stale`).** El "usar solo las notas de…" de un backend sustituye las notas en
disco, así que el origen del **otro** deja de ser verdad: `replace` de GitHub marca `syncOrigin.cloud`
`stale` y `replace` de Cloud marca `syncOrigin.github` `stale`, siempre en la misma escritura que la
adopción (sembrando antes el registro implícito de una instalación previa — `withSeededOrigin` —, y solo
si es del mismo dir). `merge` no marca nada. Después, ese backend pregunta con notas en disco **aunque
la identidad sea la misma** (encender Cloud con la cuenta de siempre, reconectar el mismo repo), y sin
notas se re-adopta con reset (`stale-empty`: sin él, el `pullSeq` de la cuenta saltaría sus notas, que ya
no están en disco). Las etiquetas del diálogo nombran de dónde vienen las notas: GitHub `stale` →
`staleFrom.email` (la cuenta de Cloud); Cloud `stale` → `staleFrom` = `owner/repo` del `syncOrigin.github`
vigente. Desconocido → `''` y el renderer pone un texto genérico ("another sync" / "another NoteFlow
account").

**Archivo local** (`electron/notesArchive.ts`, sin Electron, root inyectado — `main.ts` usa
`userData/notes-archive`; tests en `tests/electron/notesArchive.test.ts`):
`archiveSyncedNotes({ notesDir, archiveRoot, label, origin?, keep?, now? })` →
`{ archiveDir, movedDirs, movedNoteIds, movedFiles, filteredFiles, copiedFiles }` (lanza
`NotesArchiveError` con `rolledBack`/`stranded`/`archiveDir`), `listArchives(root)` (más reciente
primero), `hasArchives(root)`. Mueve a `<root>/<label>-<ISO ':'→'-'>/notes/` las carpetas de
`listSyncedNoteDirs` y los json `groups`, `folders`, `section-colors`, `note-order`, `templates`,
`snippets` (`ARCHIVED_METADATA_FILES`), y escribe `manifest.json` (versión, fecha, etiqueta, origen, dir
de notas, qué se movió/filtró/copió — para un futuro "restaurar"). **`ui-settings.json` se copia y se
queda** (apariencia del dispositivo). Las `localOnly` y las vinculadas no se tocan.
- **Metadatos que también describen notas que se quedan:** los grupos/carpetas de una nota `localOnly`
  o de una **vinculada** (su `group`/`folder` va en `linked-notes.json` pero el id apunta a
  `groups.json`/`folders.json`), su sitio en `note-order.json` o los colores de sus secciones (en una
  vinculada, su única sección = nombre del fichero, `sectionName`). Mover el
  fichero entero los dejaría colgando, así que se **archiva el original completo** y se deja en su sitio
  una **versión filtrada** con solo las entradas que usan las notas que se quedan (una carpeta conservada
  arrastra su grupo; `filterMetadataForKept`/`collectKeptRefs`, puros). Nada usado → no queda fichero.
  Efecto aceptado: en el primer pull del repo nuevo (sin base) esas entradas se **unen** con las del repo
  y se suben (son solo nombres/colores de grupo — el mismo tipo de referencia inofensiva que ya se
  documenta para la nota de bienvenida en "Notas solo-locales").
- **Antipérdida:** síncrono (nada más del proceso main escribe el dir mientras corre). Por elemento,
  `rename`; si `EXDEV` (otro volumen) → copia recursiva + verificación byte a byte + borrar el origen (si
  ese borrado falla a medias, restaura el origen desde la copia verificada). Cualquier fallo (EBUSY/EPERM
  de Windows…) **deshace todo** en orden inverso (un fichero filtrado se sustituye al devolver el original:
  `rename` de fichero reemplaza) y lanza; con el rollback completo se retiran las carpetas vacías del
  archivo. Si el propio rollback falla, no se borra nada más: el error lista "original → copia en el
  archivo" y lo movido queda en el archivo.
- **Orquestación en `main.ts`** (`archiveLocalNotesForOriginSwitch(label, origin)`, reutilizable por
  backend): cierra las stickies y ventanas de sección de esas notas (con `close()`, su `beforeunload`
  vuelca lo pendiente) y espera, vuelca los guardados pendientes de la ventana principal
  (`flushMainWindowEdits`; el renderer además hace `settleNoteWrites()` antes de invocar), marca los
  movimientos como escrituras internas para el watcher, pasa los `group`/`folder`/`sectionName` de las vinculadas
  como `keep` (`KeepRefs.groupIds/folderIds/sectionNames`), archiva, quita cada carpeta del índice semántico (`aiIndex.removeFromIndex`; metadatos →
  `markStaleUnknown`), emite **`notes-archived`** (abajo) y después `notes-updated` sin ruta (recarga
  notas, grupos, alarmas). **Un guardado
  tardío no recrea una nota archivada:** `applyNoteWrite` rechaza escribir en una carpeta archivada en
  esta sesión mientras no exista (si un pull la trae de vuelta, se escribe normal). Notas temporales:
  `checkExpiredNotes` solo recorre el dir; las archivadas ya no están. Journal/timers/caché de shas: los
  resetea la resolución.
- **Las notas archivadas salen de la memoria de cada ventana (`notes-archived`).** La recarga sin ruta
  no basta: `loadNotes` ignora a propósito un resultado **vacío** mientras el store tiene notas (un
  `readdir` vacío transitorio en Windows; además `fs:read-all-notes` reintenta 6×800 ms antes de dar
  vacío), y un dir vacío es justo lo que deja el archivo cuando el remoto nuevo no trae nada (repo o
  cuenta nuevos) o el pull falla — la barra lateral seguía mostrando las notas archivadas y el editor
  la que estaba abierta. Por eso `forgetArchivedNoteDirs` (`main.ts`) emite a **todas** las ventanas
  `notes-archived` `{noteIds, dirs}` (ids de `ArchiveResult.movedNoteIds` + los leídos antes de archivar;
  `dirs` = nombres de carpeta, por si un id no se pudo leer) **antes** del `notes-updated`, y cada ventana
  que carga notas (`bindArchivedNotes()` de `notesStore`, enlazado en `MainApp` — principal y sticky —,
  `SectionWindowApp` y `AiChatWindowApp`) llama a
  `removeArchivedNotes`: lógica pura en `src/lib/archivedNotes.ts` (`withoutArchivedNotes`, tests en
  `tests/lib/archivedNotes.test.ts` y `tests/stores/notesStoreArchived.test.ts`) — quita las notas por
  id o por nombre de carpeta (nunca una vinculada; las `localOnly` no vienen en el evento), cierra sus
  paneles (los demás se quedan; sin ninguno, depende del rol de la ventana — `fallbackToAnotherNote:
  windowRole !== 'section'` en `removeArchivedNotes` —: la principal abre la primera nota que queda, no
  archivada si la hay, y una sticky también, si su cierre previo — `closeWindowsShowingNotes` — no llegó
  a tiempo; solo las de rol `section`, la ventana de sección y la del chat, se quedan vacías), suelta
  sus desbloqueos de sesión, **descarta** sus guardados con debounce
  (`discardPendingEdits`: no se intenta escribir, así que no hay error) y reprograma las alarmas. Es
  **solo memoria**: no pasa por `deleteNote` ni toca disco o remoto; cualquier escritura posterior de
  esas notas es un no-op porque todos los caminos de escritura buscan antes la nota en el store. No
  queda ninguna lista de ids vetados: si el pull trae una nota con el mismo id, la recarga normal la
  vuelve a añadir. También se emite si el archivo falla **sin** poder deshacerse del todo (las carpetas
  que quedaron en el archivo ya no están en el dir). Y si el archivo dejó el dir **sin ninguna nota**,
  `fs:read-all-notes` no reintenta (`notesDirEmptiedByArchive`: vacío es la respuesta real) — sin eso,
  con el store ya vacío, la ventana mostraría "Loading notes…" ~4 s. El flag se limpia en cuanto el dir
  vuelve a tener notas, por cualquiera de tres caminos: un guardado (`applyNoteWrite`), un pull de
  cualquiera de los dos backends que escriba alguna carpeta de nota (`broadcastPulledNotes`, si
  `updatedFiles` no viene vacío — por ahí pasan los pulls de GitHub, también el manual, y los de Cloud;
  el primer pull del Device Flow no, pero emite una recarga completa) o un `fs:read-all-notes` que
  encuentre notas. El del pull hace falta porque, cuando no hay
  borrados ni cambios de metadatos, las notas bajadas se recargan una a una (`notes-updated` con ruta →
  `syncNote`, que no pasa por `fs:read-all-notes`): sin él el flag seguiría puesto y un `readdir` vacío
  transitorio posterior (vuelta de suspensión) ya no se reintentaría.
- **UI de las copias:** Ajustes → Sync muestra "Open local copies" cuando `sync:archives-status` dice que
  hay alguna (`sync:open-archives` → `shell.openPath`; `SyncOriginNotices.tsx`): con un backend activo es
  la fila **"Local copies"** de la lista de datos de la vista general (`LocalCopiesRow`, antes de la fila
  del CLI); sin vista general (selector inicial, detalle de Cloud o de GitHub) es una línea al pie
  (`LocalCopies`) — las copias sobreviven a la conexión que las creó. Se relee con cada
  `sync:status-changed` / `cloud:status-changed`. Restaurar desde la app **no existe** todavía (el
  manifest lo permitirá).

**Renderer:** `OriginChoiceDialog.tsx` (genérico: `{ backend: 'github'|'cloud', previousLabel,
nextLabel, stale?, disconnectsGithub?, onResolve(choice) → Promise<{ok, error?}>, onClose, busy? }`),
montado por `TitleBar.tsx`, que resuelve con `resolveGithubOrigin` o `resolveCloudOrigin` según
`syncStatus.backend`: se abre solo cuando aparece una elección nueva en `ActiveSyncStatus.originChoice`
(`{previous, next, key, stale?, disconnectsGithub?}` — `key` vuelve con la respuesta —, etiquetas — GitHub `owner/repo`, Cloud el email; `''` =
desconocida → texto genérico de `src/lib/originChoiceLabels.ts`; la clave de "Decide later" incluye
backend, `stale` y etiquetas), se reabre desde el botón de sync (estado `choice` de
`src/lib/syncStatus.ts`, prioridad justo tras `syncing` y antes de "locked": icono de aviso ámbar, píldora
"Action needed", nunca "Synced"; el clic abre el diálogo; vale para los dos backends) o desde Ajustes
(evento `noteflow:open-origin-choice`). **En Ajustes → Sync** la elección pendiente es siempre la del
backend activo, así que vive en la vista general (`SyncOverview.tsx`, que lee el mismo
`ActiveSyncStatus` que la titlebar): la insignia de la tarjeta de estado dice "Action needed" (`choice`
pasa tal cual por `overviewBadge`; tono `warn`; `isLinkActive` = false → el mapa pinta todos los enlaces
discontinuos — `src/lib/syncOverview.ts`, testeado), **"Sync now" queda deshabilitado** y justo debajo de
la tarjeta sale el aviso ámbar con el botón "Choose…" (`OriginPendingNotice` en `SyncOriginNotices.tsx`,
texto `settings.sync.originPending` para los dos backends). Con la elección de **Cloud** pendiente, el
"Mirror to GitHub" de la fila de GitHub en pausa (`GitHubPausedRow`, que lee el mismo
`ActiveSyncStatus.originChoice`) también queda deshabilitado, con ese texto como tooltip — antes abría
la confirmación y main lo rechazaba. Un pull o un espejo que se cuelen igualmente
responden `origin-choice-pending` y se muestran como error (`pullOriginPending` / `mirrorOriginPending`).
La fila "noteflow CLI" deshabilita "Connect the CLI too" (`useCliConnect.originPending`, leído de
`getCloudStatus()` / `getSyncStatus()` y sus eventos) con `settings.sync.cli.originPending` como tooltip
y como línea bajo la fila. `useGitHubSync` escucha `sync:status-changed` y avisa a `SyncPanel` si GitHub
quedó desconectado desde fuera (el "Cancel" del diálogo, o el `replace` de Cloud).
Tres opciones sin preselección ni foco en ninguna (el foco va al propio diálogo) +
"Continue"; Escape / "Decide later" solo cierran (la elección sigue pendiente). Con `archive-failed` muestra
el error y no se cierra. Con Cloud: "Cancel" explica que apaga NoteFlow Cloud en este dispositivo (la
sesión sigue), "Use only the notes from …" avisa si desconectará GitHub Sync, y con `stale` la intro dice
que las notas vienen ahora de otra sincronización.

**Estado y fuera de alcance.** Cubiertos: GitHub Sync y NoteFlow Cloud en la app (las dos puertas de
arriba) y el CLI (2.14.0, GitHub y Cloud, con su propio espejo de la decisión y la misma forma de
`syncOrigin`: ver "El CLI con GitHub" arriba y `monetization.md` § "Cliente CLI (headless)"). En el CLI
**no existe** "usar solo lo remoto" (ni archivo local): solo `noteflow origin merge` / `--merge`, o
cancelar con `logout` / `cloud logout`; esa opción es de la app. **Fuera de v1 (pendiente):** restaurar una
copia desde la app y preguntar al desconectar.

### GitHub Sync (`electron/githubSync.ts`)
- **Auth:** Device Flow OAuth — sin client secret; el usuario autoriza en
  `github.com/login/device`. Client ID `Ov23liut9QOJ2pJFF0KR` (público por diseño).
- **Token:** `safeStorage.encryptString()` (cifrado a nivel OS) con fallback a base64, en
  `settings.json`.
- **Modelo de rutas:** el remoto espeja el local — `<dir>/note.md`, `<dir>/<secId>.md`; los json
  de metadatos y README en la raíz. Las rutas relativas se codifican **por segmento**
  (`encodeRemotePath`). Push/delete por archivo siguen usando la **Contents API** (acepta rutas
  con `/`); el **listado** usa la **Git Trees API** (`GET /git/trees/{branch}?recursive=1`,
  `default_branch` cacheado **por repo** junto con el `id` numérico — `getRepoInfo`; antes era un
  valor global que sobrevivía a un cambio de repo hecho por el CLI).
- **Push:** `schedulePush(relPath, content, onStart?, onEnd?)` — debounce 5s **keyed por ruta
  relativa** (dos archivos de la misma nota debouncen independientes); llamado desde
  `fs:write-note` (por cada archivo escrito), `groups:set`, `folders:set`, `section-colors:set`,
  `note-order:set`. Los callbacks alimentan `pendingPushFiles` → evento `sync:push-state`.
  Cada push se apunta en el **journal** (abajo) al armar el timer y se da de baja al completar;
  un push fallido setea `syncError` y queda journaled para que `retrySyncJournal` lo reintente
  (antes se perdía hasta que el usuario reeditara). Con GitHub como backend activo cada subida de un
  fichero de nota es **condicionada** (tres vías contra la base cacheada, ver "Subida condicionada
  (QA B3)"): si el fichero cambió en GitHub desde que este dispositivo lo vio, **no** se sube — no es
  un error (sin `syncError`, sin bump de `lastSync`): el op queda `stale` y se pide un pull.
  **Push durable por lotes:** `pushPathsNow(notesDir, relPaths)` sube un set de archivos **ya**
  (awaited, sin debounce, leyendo de disco) y **NO bumpea `lastSync`**. Lo usa `notes:write-imported`:
  cada `schedulePush` que completa adelanta `lastSync` a "ahora", así que durante un import grande un
  pull de auto-sync vería las notas aún no subidas como `updated <= lastSync` y **las borraría**
  (regla de borrado del pull); subirlas al remoto por adelantado las hace inmunes (el pull conserva
  toda carpeta presente en remoto). No-op si el gate de push está cerrado (`initialPullStatus!=='ok'`)
  — ahí `flushPendingLocalChanges` las sube tras el primer pull.
- **⚠️ INVARIANTE — un PUT solo ocurre si el contenido DIFIERE del remoto.** La Contents API
  **commitea un PUT idéntico igualmente** (un commit cuyo tree es el del padre), así que reenviar un
  fichero sin cambios ensucia el historial sin cambiar nada: el repo del usuario llegó a tener un
  **23,8 % de commits vacíos** (ráfagas de 170+ sobre 309 ficheros). Dos guardas, ninguna con
  requests extra:
  1. **`upsertRemoteFileNow`:** el GET que ya hace para obtener el `sha` (token de concurrencia que
     la Contents API exige) devuelve **el git blob sha** del fichero → si coincide con
     `gitBlobSha(content)` **no hay PUT** y la función retorna OK. Los llamantes que cuentan
     `pushed++` y limpian el journal **siguen siendo correctos**: el remoto ya tiene exactamente ese
     contenido, la intención está satisfecha. Defensivo: si la respuesta no trae un `sha` string (un
     directorio responde con un array) no se salta nada. El reintento por conflicto (`_retrying`)
     reentra por la misma función y hereda la guarda.
  2. **Catch-up del pull** (`flushPendingLocalChanges`): ver abajo.
- **Pull:** `pullNotes(notesDir)` — agrupa los blobs del árbol por carpeta de nota; la **carpeta
  es la unidad de conflicto**: compara `updated:` de `note.md` y si el remoto es más nuevo
  escribe la carpeta ENTERA (y borra secciones locales que ya no existan en remoto). Borrado de
  notas a nivel carpeta con la regla de seguridad de siempre (`updated <= lastSync`), y **solo
  si el remoto es v2** (marcador presente y sin planos) — guard de transición. `updatedFiles`
  lleva paths de DIRECTORIOS. **No hay cursor:** cada pull lista el árbol completo
  (`git/trees?recursive=1`), así que el problema del cursor por fecha de Cloud no existe aquí;
  `lastSync` solo alimenta la regla de borrado y el catch-up. **Coste:** el pull NO hace un GET por
  nota — si el blob-sha del `note.md` en el tree coincide con el último reconciliado (sha cache,
  abajo) **y** también los de sus secciones, la carpeta se salta sin ninguna request; solo las
  carpetas con sha nuevo pagan el GET del ancla + comparación de `updated`. Si ese GET falla (`getRemoteFile` se traga el error y devuelve `null`; también si no logra los bytes de un fichero de más de 1 MB, ver "Ficheros de más de 1 MB") o el tree viene
  truncado, el pull no añade nada a `errors` pero devuelve `incomplete: true` (no se muestra; solo
  frena la caducidad de notas temporales, ver `patterns.md`).
  **Camino de conflicto (QA B3, antes de la caché):** con GitHub como backend activo, una carpeta
  con un op `stale` o con algún fichero en conflicto de tres vías no pasa por la regla de `updated`
  sino por `resolveRemoteDirConflict` (fusión por fichero; copia solo si no se puede fusionar) — ver
  "Subida condicionada (QA B3)".
  **Repo existente VACÍO (sin commits):** la Git Trees API responde **409 "Git Repository is
  empty."**; `fetchRemoteTree` (único listado: pull, espejo, `deleteRemoteDirNow`, migración v2) lo
  trata como listado **vacío y completo** — `isGitHubEmptyRepoError(status, message)` en
  `syncState.ts` (puro y testeado; exige status 409/404 **y** el mensaje de repo vacío, cualquier otro
  error sigue propagándose). El pull inicial termina OK (`initialPullStatus: 'ok'`, sin `syncError`) y
  el catch-up sube las notas locales; antes quedaba `failed` con el error visible hasta un "Sync now"
  manual. Sin riesgo para la regla de borrado: sin marcador v2 el remoto no es v2. `githubRequest`
  rechaza con `GitHubApiError` (mensaje de GitHub + `status` HTTP) para poder distinguirlo.
  **Secciones que llegan después de su ancla (arreglado):** el push sube `note.md` y las secciones
  en commits **separados** (cola serializada, debounce por fichero). Un pull entre medias aplicaba el
  ancla nueva con las secciones viejas y cacheaba el sha del ancla; como la caché solo miraba el ancla
  (y, sin caché, `remoto <= local` también salta), la carpeta se saltaba para siempre y las secciones
  nuevas no se bajaban nunca (reproducido con un GitHub simulado). Ahora la caché guarda también el
  sha de cada **sección** y `planSectionRefresh` (`syncState.ts`, puro y testeado) separa las
  secciones del tree no reconciliadas: si el fichero local ya es ese blob (`gitBlobSha`) se cachea
  sin request (cubre los pushes propios y las cachés de builds anteriores — la primera pasada tras
  actualizar solo lee disco); las demás pasan a "cambiadas". Con secciones cambiadas se hace el GET
  del ancla: **misma versión** (`updated` igual) → se bajan solo esas secciones (regla de secciones
  sueltas de Cloud); **local estrictamente más nuevo** → se respeta y **no** se cachea (cuando aterrice
  el push propio vuelven a ser la misma versión y se bajan las secciones que este dispositivo no
  tocó); timestamps ilegibles → salto histórico, cacheado. Se ignoran las secciones con `upsert` o
  `delete` pendiente en el journal, y las que el **ancla local no lista** (`listAnchorSectionFiles`
  de `cloudSyncLogic.ts`: p. ej. dos dispositivos que migraron la misma nota v1→v2 tienen el mismo
  `updated` pero ids de sección aleatorios distintos — se bajarían como huérfanas).
  ⚠️ **Nunca con GitHub como espejo obsoleto:** con **Cloud habilitado** (leído fail-closed con
  `isCloudSyncEnabledFailClosed()`, como la regla de borrado) o con **`needsFullReconcile`**
  pendiente, no hay refresco de secciones (ni GET del ancla por ellas, ni se cachean las
  "cambiadas"; solo se adoptan las idénticas) — `shouldRefreshSections`, puro en `syncState.ts`. En
  ese estado el repo puede tener "ancla t2 + sección X vieja" mientras Cloud ya trajo X' con el mismo
  t2 (el catch-up subió el ancla pero no la sección); refrescar escribiría X encima de X' y el
  catch-up, que compara con el tree ya leído, descartaría la subida de X': X' perdida. Se decide
  antes del bucle y se re-comprueba justo antes de escribir. Una carpeta con ancla cacheada que ya **no existe en local** se
  sigue saltando (nunca se resucita desde aquí). En el estado estable no hay GETs nuevos.
  ⚠️ Caso límite no cubierto: si el ancla nueva lista una sección que aún no está en el tree, el
  pull intermedio no la crea (sí llega luego por lo anterior); si en ese hueco el usuario edita la
  nota, el editor puede recrearla vacía y subirla (Cloud lo evita bajando las secciones listadas).
  El **journal** (abajo) además guarda al pull de los agujeros de datos: se salta dirs remotos con `deleteDir` pendiente y ficheros con `delete` pendiente (no resucitar borrados que
  aún no aterrizaron), y la regla de borrado local se salta cualquier dir con `upsert` pendiente
  (su push no aterrizó; borrarlo sería pérdida de datos — el upsert se apunta al **armar** el timer,
  así que también cubre la ventana de debounce de 5 s).
- **⚠️ Con Cloud habilitado, GitHub NO borra nada en local (espejo de solo-escritura).** La regla de
  borrado del pull asume que `lastSync` significa "el remoto conocía TODO lo que había en disco en
  ese instante", y esa premisa se rompe en cuanto GitHub queda **pausado por NoteFlow Cloud**: no
  recibe pushes y su `lastSync` deja de describir lo que el repo contiene, así que las notas que
  llegan por Cloud están ausentes del repo **y** con `updated <= lastSync` → la regla las borraba
  (bug de pérdida de datos real: un usuario perdió 42 notas al pulsar Sincronizar en Settings → Sync
  → GitHub). La decisión vive en `shouldRunDeletionRule(lastSyncTime, needsFullReconcile,
  cloudEnabled, remoteIsV2, treeTruncated)` (`syncState.ts`, puro y testeado): solo se borra con
  `lastSync` válido (no nulo ni NaN), remoto v2, **Cloud deshabilitado**, sin reconcile pendiente y
  con el **listado del tree completo** — si GitHub lo trunca (`truncated: true`, repos enormes), una
  carpeta ausente del listado puede seguir existiendo en remoto, así que ese pull no borra nada en
  local (además marca el resultado `incomplete`, ver arriba). `pullNotes` lee
  `cloudEnabled` de `settings.json` **plano y fail-closed** (`isCloudSyncEnabledFailClosed()`: si el
  fichero no se puede leer o parsear responde "Cloud activo" ⇒ no borrar; solo la ausencia de sección
  `cloudSync` — el usuario solo-GitHub — responde false), y lo más tarde posible dentro del pull.
  No usa `readSettings()` porque ese degrada cualquier fallo a `{}` = fail-**open** en un guard
  antipérdida. Importar `cloudSync.ts` sería un ciclo: ahora es él quien importa `githubSync.ts`.
- **`needsFullReconcile` (flag one-shot en `settings.githubSync`, ausente = false):** gobierna el
  **catch-up completo de subida**. Lo pone `markNeedsFullReconcile()` (setter en `githubSync.ts`:
  escribe la variable en memoria **y** `settings.json` a la vez, porque cada push hace
  `settings.githubSync = syncSettings` y machacaría un write externo; no-op sin repo conectado), y lo
  llaman **`enableCloudSync()` Y `disableCloudSync()`** — marcar también a la **salida** es lo que
  protege a) a los usuarios que ya tenían Cloud activo de builds anteriores (nunca recibieron el flag
  al entrar y no hay backfill en el arranque) y b) a las notas que Cloud trajo de otro dispositivo con
  un `updated` viejo, que el flush normal nunca sube. Cerrar sesión (y el apagado por suscripción
  caducada) pasa por `disableCloudSync()`, así que también marca. El **primer pull que termine OK** lo consume y corre `flushPendingLocalChanges`
  con `previousLastSync = undefined`, que re-encola todas las carpetas de nota **cuyo `updated` sea
  parseable** (las que no lo sea se saltan, igual que en el flush normal) — y dentro de cada una,
  solo los ficheros que **difieran** del remoto (filtro por blob sha, abajo: es justo el caso que
  producía las ráfagas de 170+ commits vacíos). Solo se limpia en el camino
  de éxito, nunca en el `catch`. Mientras Cloud siga habilitado, los pulls posteriores corren el flush
  **normal** (desde `previousLastSync`): mantiene el repo razonablemente fresco sin re-subir el corpus
  entero, pero ⚠️ **filtra por el `updated` del `note.md`, no por el momento de llegada**, así que una
  nota que Cloud traiga con `updated` anterior a `previousLastSync` NO se sube — de ahí que el flag se
  vuelva a poner al apagar Cloud, que es cuando el borrado se rehabilita.
  ⚠️ Al tocar cualquier `syncSettings = { ...s, … }` usar como base `syncSettings ?? s` (patrón de
  `persistMigratedAt`): las closures del push debounced viven minutos (debounce + cola de mutaciones
  serializada) y escribir sobre el snapshot viejo borraría un `needsFullReconcile` puesto entretanto,
  re-armando la regla de borrado.
- **Espejo local → repo (`mirrorToGitHub(notesDir)`), acción manual solo-Cloud:** deja el repo como
  **copia exacta** del dir de notas — sube lo que falte o difiera, **borra del remoto** lo que ya no
  exista en local y reafirma el marcador v2. Botón "Mirror to GitHub"/"Espejar en GitHub" en
  Settings → Sync → GitHub, **junto a "Desconectar" y solo si Cloud está
  habilitado** (con diálogo de confirmación: el repo se sobrescribe y se borran ficheros de él).
  Existe porque con Cloud activo GitHub es un espejo de **solo escritura**: no recibe borrados y el
  flush del pull filtra por el `updated` del `note.md`, así que una nota que Cloud trajo de otro
  dispositivo con `updated` viejo nunca sube. "Sincronizar ahora" (`sync:pull`) queda oculto y rechazado con Cloud activo.
  - **Gate de Cloud en `main.ts`** (`sync:mirror-to-github` → `{ok:false, error:'cloud-required'}`
    si Cloud está apagado, y `{ok:false, error:'cloud-initial-pull-pending'}` si el pull inicial de
    Cloud de este dispositivo aún no está en `'ok'` **o** quedan filas en el set de reintento del
    pull (`hasPendingPullRetries()`): en un dispositivo recién activado, o con carpetas que no se
    pudieron aplicar, el disco todavía no es el estado de la cuenta y el espejo borraría del repo
    todo lo no descargado): `githubSync.ts` no puede importar `cloudSync.ts` (ciclo). El handler no
    emite `notes-updated` (el disco no cambia), solo `sync:status-changed`.
  - **Decisión pura y testeada en `electron/mirrorPlan.ts`** (sin imports de Electron, patrón
    `syncState.ts`): `planMirror(localFiles, remoteBlobs, metadataFilenames)` → `{toUpload, toDelete,
    unchanged}`. Los idénticos se saltan **sin ninguna request** comparando el **git blob sha
    calculado en local** (`gitBlobSha` = `sha1("blob <bytes>\0<content>")`) con el sha del tree.
  - ⚠️ **Dos condiciones más para borrar, ambas antipérdida:**
    1. **Solo se toca lo que hay dentro de una carpeta de nota REAL del remoto**, es decir anclada
       por `<dir>/note.md` (misma regla que `groupRemoteNoteDirs`). Una carpeta remota **sin ancla**
       se deja **intacta por completo** (ni `deleteDir` ni `delete` por fichero): no es una nota para
       ninguna parte de la app y el pull ni la mira, así que dejarla no resucita nada, mientras que
       journalar un `deleteDir` sobre ella sería peligroso — si luego se apaga Cloud,
       `retrySyncJournal` la drena con `deleteRemoteDirNow`, que barre **todo** lo que cuelgue de
       `<dir>/` sin allowlist (un `docs/` del usuario perdería `docs/logo.png` y sus subcarpetas).
       *Efecto colateral aceptado:* secciones huérfanas de una carpeta cuyo `note.md` nunca se subió
       no se limpian; el pull las ignora igual.
    2. **Si falló la lectura de CUALQUIER fichero local, la fase de borrado se salta entera.** Con
       la foto local incompleta, "no existe en local" no significa nada: un `note.md` ilegible
       (EACCES, lock de antivirus) parecería una nota borrada y se llevaría su carpeta del repo. El
       resultado lo comunica con un **código** en `warnings` (`'deletions-skipped-unreadable'`) que
       el renderer traduce, separado de `errors` — ahí van los mensajes crudos de la API de GitHub,
       que no son copy nuestro.
       En la misma línea, el espejo empieza con un `readdirSync(notesDir)` explícito: `listNoteDirs`
       traga el fallo y devuelve `[]` (tolerancia intencionada que usan otros sitios), lo que aquí
       sería indistinguible de "el usuario borró todas las notas" — vaciaría el repo **y** el run
       parecería limpio. Un dir **vacío pero legible** sí espeja (vaciar el repo es justo lo que se
       pide, y el diálogo lo avisa).
  - ⚠️ **`toDelete` viene AGRUPADO en entradas de journal (`MirrorDeletion`)**, no como lista plana:
    una carpeta de nota que ya no existe en local se borra como **un solo `deleteDir` con clave
    `<dir>`** (como `scheduleDeleteDir`), y el `delete` por fichero queda solo para secciones sueltas
    de una nota que SÍ sigue en local y para ficheros de raíz. Es una **cuestión de pérdida de
    datos**, no de estética: si el DELETE de `<dir>/note.md` falla y estaba journalado como `delete`
    de fichero, el pull **no lo respeta** — `shouldPullSkipDir` solo mira `deleteDir`, y el ancla se
    reescribe sin pasar por `shouldPullSkipFile` (esa guarda solo cubre las secciones) → la nota
    borrada resucita en disco y Cloud la propaga a todos los dispositivos.
  - ⚠️ **Allowlist de borrado (`isMirrorDeletable`) — lo crítico:** solo se borra (a) `<dir>/*.md`
    dentro de una carpeta de nota, (b) un `METADATA_FILENAMES` de raíz, (c) un `.md` plano de raíz
    (restos de v1). **Nunca** `README.md` (lo escribe NoteFlow y no existe en local), nunca nada con
    un segmento que empiece por `.` (marcador `.noteflow-format`, `.github/`, `.gitignore`), nunca
    otras extensiones de raíz (LICENSE…) ni anidamiento más profundo. La lista de metadatos se
    **pasa como parámetro** para no crear un 5º espejo de `METADATA_FILENAMES`.
  - **Durabilidad:** toda subida/borrado pasa por `upsertRemoteFile`/`removeRemoteFile` (la cola
    serializada) y se journala con las mismas claves que el push/delete normales, **persistiendo
    `sync-state.json` en el acto** al journalar cada borrado (como `scheduleDelete`/
    `scheduleDeleteDir`): si se persistiera solo al final, cerrar la app a media pasada dejaría la
    carpeta a medio borrar en el repo y **sin** entrada en el journal → el siguiente pull manual
    resucitaría la nota desde el `note.md` que quedó. ⚠️ **Pero aquí el
    journal NO significa reintento automático:** el espejo solo corre con Cloud activo, y en ese
    estado **nada drena el journal de GitHub** (el tick del autosync sale antes — `main.ts` — y
    `retrySyncJournal` está gateado por `initialPullStatus === 'ok'`). El journal sirve de red ante
    crash y de **guarda del pull manual** (un `deleteDir` pendiente impide que "Sincronizar ahora"
    resucite la nota); la recuperación real de un fallo es **volver a lanzar el espejo**, y la única
    señal son `syncError` y los `errors` que devuelve la acción. Si más tarde se apaga Cloud, un
    `deleteDir` journalado sí se reintenta vía `deleteRemoteDirNow`, que barre **todos** los blobs
    bajo la carpeta (igual que borrar una nota normalmente).
    Tras cada subida/skip se cachea el sha de los anclas `<dir>/note.md` y de los metadatos, y se
    poda con `pruneShas` a lo que queda en el remoto. Los ficheros que resultan **idénticos** también
    dan de baja su `upsert` journalado (un timer de push cancelado al empezar): dejarlo colgado
    desarmaría para siempre la regla de borrado local de ese dir (`shouldDeletionRuleSkipDir`).
  - **Al terminar SIN errores** bumpea `lastSync` (al instante **previo** a leer el disco, para no
    exponer a la regla de borrado una nota escrita durante el espejo) y **consume
    `needsFullReconcile`**: tras un espejo exacto el repo sí conoce todo lo que hay en disco. Con
    cualquier error no toca ninguno de los dos. Guarda de reentrada `mirrorInFlight` (doble clic) y
    cancelación de los `pushTimers` al empezar (como `pushAllNotes`).
- **Metadata:** `METADATA_FILENAMES` = groups.json, **folders.json**, section-colors.json,
  **note-order.json**, templates.json, snippets.json, ui-settings.json (los dos en negrita se pusheaban
  pero NO se pulleaban — bug arreglado con el cambio de formato). `templates.json` (plantillas),
  `snippets.json` (fragmentos del toolbar) y `ui-settings.json` (apariencia + ajustes del editor, ver
  `architecture.md`) siguen el mismo patrón simple que note-order: push debounced + pull. ⚠️ La lista
  tiene espejos en `CLOUD_METADATA_FILENAMES` (`cloudSyncLogic.ts`; si el JSON es un array de objetos
  con `id`, valorar también `CLOUD_MERGEABLE_METADATA`), en `RESERVED_ROOT_NAMES` (`main.ts`) y en el
  CLI (`cli/noteflow.js`: `CLOUD_METADATA_FILES` — un test de interop lo compara con el de escritorio —
  y `CLOUD_MERGEABLE_METADATA`; su `METADATA_FILES` de GitHub es más corto: no lleva templates ni
  snippets) — mantenerlas en sync al añadir un JSON raíz.
  **Clientes antiguos:** un desktop/CLI anterior que reciba de Cloud un JSON raíz que no conoce lo salta
  como `unsafe remote path skipped` (error de ese pull, no se reintenta); por GitHub lo ignora (ni lo
  pullea ni lo borra en el espejo).
  **Pull de metadatos (`planGithubMetadataPull`, puro en `electron/githubMetadata.ts`, testeado en
  `tests/electron/githubMetadata.test.ts` + e2e en `githubConditionalSync.test.ts`).** El pull solo
  hace GET de un json cuyo sha del tree difiere del cacheado — o, con el sha igual, si el fichero
  **falta en local** (la app nunca los borra: se restaura desde el remoto; antes se saltaba para
  siempre y las notas quedaban con ids de grupo/carpeta colgando). Entonces decide según haya
  **base** (sha cacheado en `SyncState.shas`):
  - **Con base (estado estable):** gana el remoto si el contenido difiere (LWW; los metadatos no
    tienen versión ni timestamp). Comportamiento histórico, sin cambios.
  - **Sin base** — este dispositivo nunca reconcilió ese fichero con este repo: **primer connect**
    (`initiateDeviceFlow` → `pullNotes`, también a un repo que ya usó otro dispositivo), tras
    `disconnectGitHub` + reconectar, `sync-state.json` perdido/corrupto, o un json que reaparece en
    el remoto tras `pruneShas`. Antes también ganaba el remoto y se perdían **en silencio** los
    grupos/carpetas/plantillas locales (las notas quedaban con ids colgando → "sin grupo"), y el
    `pushAllNotes` del connect propagaba la pérdida. Ahora sigue **la regla del primer pull de
    Cloud reutilizando su mismo `planMetadataPull`** (`firstPull: true`, sin espejo nuevo): copia de
    lo local que se vaya a sobrescribir en `userData/github-metadata-backups/<ISO con ':'→'-'>/`
    (fuera del dir de notas; si la copia falla, `console.error` y **no se sobrescribe** ni se cachea:
    el siguiente pull lo reintenta), los `CLOUD_MERGEABLE_METADATA`
    (groups, folders, templates, snippets) reciben la **unión por `id` prefiriendo el remoto**
    (`mergeMetadataById`), y los que no son arrays con `id` (`ui-settings.json`,
    `section-colors.json`, `note-order.json`) toman el remoto (con copia) — igual que Cloud: no tienen
    una unión segura (una apariencia mezclada o un orden parcial no es mejor que el del repo) y la
    pérdida es recuperable de la copia. Si lo que queda en disco **difiere del remoto** (la unión
    aporta entradas locales, o lo local ya contenía todo lo remoto), el pull lo **sube**
    (`schedulePushUnguarded`, journalado; el catch-up `flushPendingLocalChanges` solo mira carpetas de
    nota). Se cachea el sha remoto como base igualmente: un pull antes de que aterrice esa subida
    salta el fichero en vez de volver a fusionar/copiar, y la subida cachea luego su propio sha. Sin
    tombstones, una entrada borrada solo en un lado sin sincronizar vuelve desde el otro (asumido,
    como en Cloud). Se loguean solo recuentos. Aplica también con Cloud activo (el pull inicial del
    connect de GitHub): unir es estrictamente mejor que sobrescribir.
  ⚠️ **Residual (preexistente, no arreglado): edición local de metadatos aún sin subir + cambio
  remoto.** Las subidas de metadatos son **incondicionales** (`isConditionalMutation` exige
  `isNoteFilePath`), así que no tienen la comprobación de disco ni la de tres vías → nunca quedan
  `superseded` ni `stale`. Secuencia: se edita `groups.json` (L en disco, timer de 5 s armado con L) y
  otro dispositivo sube R; un pull que cae **dentro del debounce** (`hasPendingRemoteMutations` solo
  cuenta mutaciones ya encoladas, no timers) escribe R en disco y cachea R; luego el timer dispara y
  hace PUT de **L** igualmente, y `recordPushedBase` cachea L. Resultado: disco = R, remoto = L, y el
  siguiente pull lo salta (caché = tree) → **divergen** hasta la siguiente edición local de ese
  fichero (que sube lo que haya en disco y pisa L). Ninguna de las dos versiones se fusiona. La acción
  de **espejo** (arriba) deja el repo exactamente como lo local.
- **Autosync:** cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado: primero drena el
  journal (`retrySyncJournal`), luego pull (que se pospone si quedan mutaciones en vuelo). El **sync
  manual** (`githubManualPull`: "Sync now" de Settings y el botón de la titlebar) hace lo mismo — drena
  y luego pull — pero el pull no se pospone por mutaciones en vuelo.
- **Delete:** `scheduleDelete(relPath)` (sección suelta) y `scheduleDeleteDir(dir)` (lista el
  árbol y borra cada blob bajo `<dir>/` — si el listado viene **truncado** (`truncated: true`, repos
  enormes) `deleteRemoteDirNow` **lanza antes de borrar nada** (`planRemoteDirDelete`, puro): con
  ficheros de la carpeta fuera del listado se borraría a medias y se daría el journal por completado;
  así el `deleteDir` sigue en el journal y la nota queda entera en remoto; usado por borrar nota y
  notas expiradas — estas últimas
  solo justo tras un pull limpio del backend activo, ver `patterns.md` § "Motor de alarmas y notas
  temporales", porque el borrado es incondicional). Ambos se
  journalan antes de ejecutarse y en fallo setean `syncError` y QUEDAN en el journal para retry
  (sin tope de intentos: un borrado remoto perdido = nota que resucita en el siguiente pull). Con
  GitHub activo ambos son **condicionados** (ver "Subida condicionada (QA B3)"): una sección que
  cambió en GitHub no se borra (op `delete` `stale`), y un `deleteDir` sobre una nota cambiada allí no
  borra **nada** — gana la edición remota y la nota vuelve en el siguiente pull.
- **Journal + sha cache (`electron/syncState.ts` + `userData/sync-state.json`):** estado LOCAL de
  durabilidad (deliberadamente fuera del dir de notas — no debe sincronizarse; se limpia en
  `disconnectGitHub()` y cuando el dir cambia de origen (`adoptGithubOrigin`, ver "Origen del dir de notas"); corrupto/ausente degrada a estado vacío, nunca bloquea el sync). Dos mapas y un flag:
  - **`ops` (journal de mutaciones remotas pendientes):** cada push debounced se apunta como
    `upsert` **al armar el timer** (sobrevive a cerrar la app durante el debounce) — keyed por
    relPath; `scheduleDelete`/`scheduleDeleteDir` como `delete`/`deleteDir` (este último descarta
    los ops de fichero bajo el dir). Baja al completar con éxito; en fallo queda (`attempts++`).
    `retrySyncJournal(notesDir)` lo drena: upserts releen el contenido ACTUAL de disco (si el
    fichero local ya no existe, se descarta la entrada — el borrado lo cubre su propia entrada),
    deletes se re-ejecutan; **no bumpea `lastSync`** (mismo motivo que `pushPathsNow`). Lo llama
    `main.ts` en cada tick del autosync y en el sync manual ANTES de `pullNotes`, y tras el pull
    inicial OK; gated por
    `initialPullStatus === 'ok'`. Se **salta los ops `stale`** (subida/borrado ya retenidos por la
    comprobación de tres vías — los resuelve el pull) y los que ya no son el op del snapshot
    (completados o sustituidos mientras drenaba). Un dir con upsert pendiente que **también** cambió en
    GitHub ya no se sobrescribe por LWW y luego se re-sube encima (eso perdía la edición remota, QA B3):
    lo resuelve el camino de conflicto del pull (versión remota + copia de conflicto de la local). Si
    solo cambió el remoto (lo local sigue en su base) el pull lo aplica por **avance rápido**
    (fast-forward, mismo camino, sin copia) **diga lo que diga `updated:`** — antes, con el `updated`
    remoto no más nuevo (reloj desfasado, edición en la web de GitHub que no lo toca), la regla de
    timestamps conservaba lo local, cacheaba el sha remoto como reconciliado y la siguiente edición
    local lo pisaba. La regla de `updated` (LWW por carpeta) sigue rigiendo cuando la base es
    desconocida.
    Flags del op en GitHub: `stale` (upserts **y** deletes de sección) y `conflictCopied` (dedupe de
    copias); `force` es solo de Cloud.
  - **`shas` (cache de blobs reconciliados):** relPath del ancla (`<dir>/note.md`), de cada
    sección (`<dir>/<sec>.md`) o del metadata → blob-sha ya reconciliado por **este** dispositivo. Se
    escribe tras cada decisión del pull (tanto si pulleó como si ganó lo local — salvo secciones con el
    local estrictamente más nuevo, ver "Pull") **y tras cada subida propia** (PUT o salto por idéntico:
    `recordPushedBase`; un DELETE la borra, `forgetRemoteBase`). Permite el skip sin GET y es la
    **BASE** de la subida condicionada (abajo). Se poda a los paths presentes en el tree (más los que
    este dispositivo subió después del listado). El espejo (`mirrorToGitHub`) cachea sin request las
    anclas y metadatos que encuentra idénticos; lo que sube lo cachea la propia subida.
    Los `METADATA_FILENAMES` usan el mismo cache (solo GET cuando el sha del tree difiere); que un
    json **no tenga** entrada aquí es lo que activa su fusión con copia en el pull (ver "Metadata").
    La lógica de transiciones/decisiones es pura en `syncState.ts` (sin imports de Electron, patrón
    `entitlements.ts`) y está cubierta por `tests/electron/syncState.test.ts`.
  - **`emptyFileRepairDone` (flag one-shot, ausente = pendiente):** la reparación única de ficheros
    vaciados por el bug de 1 MB ya corrió y restauró todo — ver "Ficheros de más de 1 MB".
- **⚠️ Ficheros de más de 1 MB — la Contents API no los trae (bug de pérdida de datos real,
  arreglado 2026-11).** `GET /repos/{o}/{r}/contents/{path}` (media type por defecto) solo incluye el
  contenido hasta 1 MB: entre 1 MB y 100 MB responde **200 con `content: ""`, `encoding: "none"`** y
  el `sha`/`size` reales (verificado en vivo). Las secciones llevan las imágenes como data URIs
  base64, así que pasan de 1 MB. Antes se decodificaba `content` como base64 → `''`: el pull escribía
  la sección **vacía** y cacheaba el sha real como base, y el siguiente push (base == remoto → `put`)
  subía la versión vacía a todos los dispositivos (le pasó a un usuario).
  - **Lectura:** `getRemoteFile` (app) / `getRemoteFile` (CLI, espejo) devuelve el texto **completo**
    o `null`. Usa el contenido inline solo si es base64 y su longitud en bytes coincide con `size`
    (`decodeContentsApiFile`, puro en `electron/githubContents.ts`); si no, baja los bytes por la
    **Git Blobs API** (`GET git/blobs/{sha}`, base64 hasta 100 MB — `getRemoteBlobContent`) y exige
    que **los bytes** den ese sha (`decodeGitBlob`). Un fichero realmente vacío (`size: 0`) es `''`.
  - **Fail-closed (regla):** nunca se escribe texto vacío/parcial de un fichero remoto no vacío; todo
    `null` es "no reconciliado": el pull no escribe ni cachea. La escritura completa de una carpeta
    (remoto más nuevo) baja **todas** las secciones **antes** de escribir nada; si una falla, la
    carpeta queda intacta e `incomplete` (antes se saltaba la sección en silencio y se cacheaba el
    ancla). Tras las descargas (pueden tardar), re-comprobación síncrona antes de escribir: si este
    dispositivo subió algo a la carpeta desde el listado (`dirMutatedSince`) o el `note.md` local cambió
    desde la decisión (un guardado entre medias), no escribe ni cachea nada e `incomplete`. La
    migración remota v1→v2 no borra un plano que no pudo leer (ver `note-format.md`). El
    CLI: `noteflow pull` igual (baja todo antes de escribir; si falla, error para esa nota) y
    `githubResolveConflictDir` ya devolvía `null` sin tocar nada.
  - **Reparación única (app):** `planEmptyFileRepair` (`syncState.ts`) — en el pull, antes del bucle
    de carpetas y solo con GitHub activo: ficheros del tree (de nota y metadatos) con el local de **0
    bytes**, base cacheada **no vacía** y blob remoto no vacío se re-bajan (por `getRemoteFile`,
    exigiendo el sha del listado), se cachean y se **completa su `upsert` pendiente** (el pull viejo
    podía haber journalado el vacío). Una sección vaciada a propósito y aún sin subir reaparece una
    vez — aceptable frente a perder imágenes. El flag `emptyFileRepairDone` solo se pone con listado
    completo y todos los candidatos restaurados. Mientras falte, **red de seguridad en el push**
    (`shouldHoldBackEmptyUpload` en `upsertRemoteFileNow`): una subida condicionada de contenido vacío
    sobre un remoto no vacío que **sigue siendo la base** se retiene como `RemoteChangedError` (op
    `stale`, se pide pull, que repara). **CLI:** `repairEmptiedFiles` en `noteflow pull` (flag en
    `cli-github-state.json`; **sin** condición de base, porque el pull del CLI nunca guardó base para
    el fichero vaciado) y, hasta que corra, `upsertRemoteFile` **rechaza** subir un fichero vacío
    sobre contenido no vacío en GitHub (`… run 'noteflow pull' once …`, que avisa de que el pull
    restaura el contenido de GitHub y, si el vaciado era intencionado, hay que volver a vaciarlo); el
    CLI tampoco repara con Cloud activo (`githubConditionalActive`, como la app). Lo que ya se subió
    vacío no se recupera solo: el blob anterior sigue en el historial de git (por su sha).
    Tampoco se detecta un dispositivo envenenado cuyo usuario **ya editó** la sección vaciada (local
    no vacío, sin las imágenes): esa edición se sube sin obstáculo — recuperación desde el historial
    de git por el sha del blob anterior.
  - **Timeout:** `githubRequest` (app y CLI) usa un timeout de inactividad de socket
    **escalado con el cuerpo enviado** (`githubRequestTimeoutMs`: 15 s + 1 s por 32 KB, tope 10 min) —
    un PUT de varios MB se escribe de golpe y GitHub tarda en commitearlo. Las descargas siguen en 15 s
    (cada `data` reinicia el temporizador). `githubAuthPost` y las requests de Cloud no cambian.
  - Comparaciones por sha (salto por idéntico del catch-up, `planGithubDirMerge`, base por blob) no
    dependen del tamaño: con el contenido correcto funcionan igual. Tests:
    `tests/electron/githubLargeFiles.test.ts` y `tests/cli/githubMerge.test.ts` (fakes con umbral
    configurable).
- **⚠️ Serialización de mutaciones remotas (INVARIANTE — leer antes de tocar el sync):** la
  Contents API de GitHub **commitea de una en una por rama** (cada PUT/DELETE mueve el HEAD), así
  que dos escrituras/borrados **concurrentes** chocan con un `409/422` por SHA obsoleto. Por eso
  **TODA** mutación remota pasa por una **única cola** (`enqueueMutation` en `githubSync.ts`):
  `upsertRemoteFile`/`removeRemoteFile` son wrappers finos que encolan su trabajo real (`*Now`) y se
  ejecutan **estrictamente secuencialmente**. **Cualquier write/delete remoto nuevo DEBE ir por
  estos dos puntos** (nunca llamar a `githubRequest` con PUT/DELETE en paralelo ni saltarse la
  cola). Ambos **reintentan una vez** ante conflicto (re-fetch del SHA) y tratan `404` como "ya no
  está" (éxito); **nunca traguen un error de borrado en silencio** — si falla, registrar `syncError`
  Y dejarlo en el **journal** para retry (un borrado remoto perdido hace que la nota **reaparezca**
  en el siguiente pull). Además el
  auto-sync pull **se pospone** si `hasPendingRemoteMutations()` (no rehace una nota cuyo borrado
  remoto aún está en cola). Histórico: un borrado/edición múltiple (p. ej. batch en la group
  overview) disparaba N mutaciones concurrentes → 409s silenciosos → notas restauradas; de ahí la
  cola. Mantener este patrón al añadir operaciones que toquen el remoto (notas, grupos, carpetas,
  metadatos).
- **Subida condicionada (QA B3 — resuelto; antes "las subidas pisan sin condiciones").** El bug:
  `upsertRemoteFileNow` hacía GET del sha actual y PUT con él — ese sha es solo el **token de
  concurrencia** de la Contents API, no "la versión que este dispositivo vio" —, así que A (con X
  sincronizada) editaba X sin haber bajado una edición de X subida por otro dispositivo y su push
  debounced la **pisaba en todas partes**, sin copia ni aviso. Variante: si un pull caía entre la
  edición remota y el push, veía "local estrictamente más nuevo", cacheaba el sha remoto y el push
  pisaba igual. Diseño (lógica pura en `syncState.ts`, testeada en `tests/electron/githubConflict.test.ts`;
  flujo completo contra un GitHub simulado en `tests/electron/githubConditionalSync.test.ts`):
  - **Tres vías por fichero de nota** (`<dir>/<file>.md`): **B** = base = `state.shas[p]` (lo último
    que este dispositivo reconcilió: bajado, adoptado o **subido**; `undefined` = desconocida), **R** =
    sha en GitHub ahora (GET de la Contents API en el push, tree en el pull; `null` = ausente), **L** =
    sha del contenido local. Conflicto = `B definida && R≠B && L≠B && L≠R` (`isThreeWayConflict`).
    **Base desconocida ⇒ comportamiento histórico** (sin copias espurias tras perder la caché, en el
    primer connect o con ficheros de antes de la actualización).
  - **Solo con GitHub como backend activo** (`isConditionalMutation`: no forzado, fichero de nota y
    `!isCloudSyncEnabledFailClosed()`, evaluado al **ejecutar** la mutación). Metadatos, README y
    marcador: incondicionales (como Cloud: los metadatos no tienen versión). Con Cloud activo GitHub es
    el espejo de solo escritura: subidas incondicionales, `mirrorToGitHub` forzado (`force: true`) y el
    pull sin camino de conflicto (`conflictsAllowed = shouldRefreshSections(...)`) — comportamiento
    histórico, sin copias.
  - **Push** (`upsertRemoteFileNow`, dentro de la cola serializada): (1) **comprobación de disco**: si
    el fichero en disco ya no es el contenido capturado (o no existe) → `'superseded'`: sin PUT, sin
    tocar el journal, sin error (una edición posterior arma su propio timer; un pull que resolvió la
    carpeta escribió la versión remota). Verificado: todos los llamantes de `schedulePush`
    (`applyNoteWrite`, metadatos de `main.ts`, catch-up, copias de conflicto) escriben el fichero
    **antes** de programar. (2) `R === L` → `'identical'` (sin PUT, guarda de siempre). (3)
    `planConditionalUpsert(B, R, L)`: `R` nulo → PUT (crear; también con base conocida: una edición
    local gana a un borrado remoto); base desconocida o `R === B` → PUT; si no → **`RemoteChangedError`**
    (sin PUT). (4) Tras cada PUT o salto idéntico se cachea la base (`recordPushedBase`). El reintento
    por 409/422 re-entra y re-evalúa.
  - **Al retenerse** (`holdBackForRemoteChange`): el op se marca `stale` (`journalMarkStale(…, op)`; se
    re-crea si faltaba, con `journalRecordIfAbsent`), **sin** `syncError` ni bump de `lastSync`, y se
    avisa a `main.ts` (`onRemoteConflict`) que lanza un **pull de GitHub en ~3 s** (debounced; solo con
    GitHub activo y el pull inicial OK; se re-arma mientras haya mutaciones en vuelo — la misma espera
    del tick). El tick de 5 min (drain → pull) también lo resuelve. Lo manejan el push debounced, el
    drain, `pushPathsNow`, `pushAllNotes` (no cuenta como error) y `scheduleDelete`. El drain **se salta**
    los ops `stale`. Una nueva edición local re-registra el op y le quita el `stale`.
  - **Borrados**: sección (`removeRemoteFileNow`) con `planConditionalDelete` → `stale` en el op
    `delete`; `deleteDir` (`deleteRemoteDirNow`) lanza **antes de borrar nada** si algún blob de la
    carpeta tiene base y su sha del tree es otro (`remoteDirChangesSinceBase`) → `handleDeleteDirConflict`
    completa el `deleteDir` y **borra las bases de la carpeta**, así que el siguiente pull (pedido al
    momento) la vuelve a bajar entera: **la edición remota gana al borrado local** (solo log, sin aviso
    en la UI). Los blobs se borran luego forzados (la comprobación ya se hizo por carpeta). Los borrados
    del espejo siguen forzados.
  - **Pull — camino de conflicto** (por carpeta remota, tras `shouldPullSkipDir` y **antes** del skip
    por caché; solo si la carpeta existe en local): se evalúa solo cuando algún blob listado difiere de
    su base (o una base cacheada desapareció del tree) o hay un op `stale` bajo la carpeta — cero
    lecturas de disco en el estado estable. Se toman todos los ficheros (tree ∪ bases ∪ disco) con sus
    tres shas (`dirThreeWayShas`); los que en local ya **son** el blob listado se **adoptan** como base
    sin request (cubre pushes propios de builds anteriores); `planGithubDirConflict` decide:
    **conflicto** = op `stale` **o** algún conflicto de tres vías (no necesita journal: cubre ediciones
    del CLI con la app cerrada y el caso "local estrictamente más nuevo"); **fast-forward** (sin
    conflicto) = algún fichero con base conocida cambió en remoto y **todo** fichero local sigue en su
    base, ya es igual al remoto o no existe y no tiene base (sección añadida en remoto) — la carpeta
    remota se aplica por el mismo camino, sin copia, **ignorando `updated:`**. Ninguno de los dos →
    rama histórica, donde además, con GitHub activo, un blob remoto que **no** se aplicó nunca se cachea
    sobre una base conocida si el local no es ese blob (`cacheKeptLocal`): la siguiente edición local
    se retiene en vez de pisar el cambio remoto. `resolveRemoteDirConflict`: (0) si hay mutaciones propias
    en vuelo → aplaza (`incomplete`); (1) GET del ancla y de cada sección remota (un fallo → aplaza, sin
    tocar nada); (2) **todo síncrono desde aquí** (ningún guardado, timer ni mutación puede colarse):
    re-comprueba (mutaciones, pushes propios desde el listado, Cloud activado a mitad → aplaza), relee
    la carpeta local y **re-planifica** (si ya no es conflicto ni fast-forward → aplaza, sin escribir);
    **(2b) fusión por fichero (2026-11-06, en vez de la copia):** si es **conflicto**,
    `mergeGithubConflictDir` → `planGithubDirMerge` (puro, `electron/githubMerge.ts`) adapta la vista de
    shas al **mismo planificador que Cloud** (`planThreeWayDir`, con seqs sintéticas: 1 = "sigue en la
    base", 2 = "se movió"; base = hash del contenido de la base si se conoce, si no el del lado que sigue
    en la base, si no `UNKNOWN_BASE_HASH`): sección cambiada en los dos lados → `mergeSectionText`
    (diff3 con el **contenido de la base pedido a GitHub por su sha**, `GET
    /repos/{o}/{r}/git/blobs/{sha}` — `getRemoteBlobContent`, en la fase asíncrona, solo para los
    ficheros en conflicto de tres vías; inmutable y siempre disponible, así que GitHub no necesita
    almacén local; contenido verificado con `gitBlobSha`; si falla → unión de dos vías, nunca aplaza),
    marcas ⚠️ dentro de la nota si chocan las mismas líneas, nunca nota aparte; el `note.md` con
    `mergeAnchors` (como Cloud: un lado → ese lado; los dos → ancla remota + secciones locales nuevas,
    OR de `aiHidden`/`favorited`, unión de `tags`); sección solo cambiada en un lado → ese lado; borrada
    aquí y sin cambios allí → sigue borrada (op `delete` journalado, el drain la borra contra la nueva
    base); borrada aquí y editada allí → vuelve. Ejecución síncrona: escrituras/borrados locales, shas
    remotos como base, timers cancelados y `journalCompleteDir`, y **todo lo que acaba distinto de
    GitHub se re-sube** por `schedulePushUnguarded` (secciones antes que el `note.md`; subida
    condicionada normal contra el sha remoto, ya base). Una sección borrada aquí (op `delete`
    pendiente, o borrada por el CLI con la app cerrada) que sigue en GitHub como en su base no vuelve:
    el ancla fusionada deja de listarla, queda un op `delete` (no `stale`) contra el sha remoto, un pull
    antes del drain no la resucita (blob = base cacheada) y el drain la borra en GitHub (test en
    `githubConditionalSync.test.ts`) — el drain **no** ejecuta el `delete` de una sección mientras el
    `note.md` de su carpeta tenga un `upsert` journalado, pendiente o `stale`
    (`sectionDeleteWaitsForAnchor`): el ancla de GitHub aún la listaría. **Sin huérfanas:** una sección
    que lista el `note.md` local y cuyo fichero sigue en la carpeta tras la fusión **se vuelve a listar** si
    el ancla fusionada no la lista (`relistAnchorSections` en `cloudSyncLogic.ts`, espejo en el CLI). Caso:
    borrada en GitHub, editada aquí y re-creada allí por el PUT incondicional propio (fichero ausente en
    remoto ⇒ `put`) antes de que el ancla entre en conflicto — el planificador la ve "sin cambios" (local =
    base = remoto) y el ancla elegida es la de GitHub; sin esto quedaría en un fichero que ninguna ancla
    lista y la siguiente escritura de la carpeta la borraría. Si un ancla es ilegible/cifrada → `null`
    (copia). **Fichero local que existe pero no se lee** (EBUSY de OneDrive/antivirus): `null` → camino
    histórico, nunca "borrado aquí" (que lo deslistaría y journalaría su `delete`). Con marcas → aviso `SyncStatus.conflictMerges` (mismo `{count,
    titles, at}` y *Dismiss* que las copias). Las marcas nombran al **equipo que fusiona** y la hora
    (`> ⚠️ Sync conflict (YYYY-MM-DD HH:mm) — version from <hostname>:` / `> ⚠️ Sync conflict —
    version already synced:` / `> ⚠️ End of sync conflict`; nunca "este dispositivo", el texto se
    sincroniza), inyectadas con `githubSync.setConflictMarkerLabels` (ver `monetization.md` "Fusión de
    líneas de una sección"). **Sigue la copia (paso de abajo) solo donde
    no se fusiona:** ancla cifrada o ilegible en conflicto (`whole`), ancla ausente en un lado, sección
    no fusionable o fusión que lanza (red de seguridad) → `null` → camino histórico. **Sección borrada
    en GitHub y editada aquí** (lo que hoy copiaba, decisión explícita): se aplica el borrado y la
    versión local va a una copia **con solo esas secciones** (`writeConflictCopy` con `onlySections`,
    `journalMarkConflictCopied`); el resto de la carpeta se fusiona igual. (Cloud, en cambio, conserva
    la edición local sobre el tombstone y la re-sube — asimetría asumida.) El **fast-forward** no cambia.
    Camino histórico (sin fusión): candidatos a copia = ficheros locales cambiados desde su base (o sin base), ninguno solo si **todos**
    los upserts pendientes de la carpeta ya están `conflictCopied` (dedupe por op: un upsert pendiente
    sin el flag — una edición hecha después de una copia cuyo aplicado falló a medias — vuelve a
    provocar copia; una copia de más es aceptable, perder esa edición no); `planConflictCopy` contra el contenido
    remoto (ancla sin `updated:`); si hace falta, `writeConflictCopy` (si falla, lanza → catch por
    carpeta, la carpeta no se toca), `journalMarkDirConflictCopied`, la copia se sube por
    `schedulePushUnguarded` y se acumula el aviso; (3) escribe la carpeta remota entera (ancla primero),
    borra las secciones locales que el remoto no tiene y cachea los shas remotos (del GET, no del tree)
    como base; (4) cancela los timers bajo la carpeta y completa **todos** sus ops
    (`journalCompleteDir`). El caso "remoto más nuevo con lo local en su base" con base conocida va
    ahora por el fast-forward; sin base sigue por la rama wholesale de siempre. Un op `stale` de una carpeta que ya **no existe** en el remoto (listado
    completo) pierde el flag (`journalClearStale`): el drain la re-sube (la edición local gana al
    borrado remoto) en vez de quedar atascado para siempre.
  - **Pushes propios durante un pull:** el pull lista el tree una vez y trabaja un rato; un PUT propio
    que aterriza entretanto cachea su base mientras el listado aún muestra el blob anterior. Si el pull
    comparase con él (o lo cachease) el siguiente push vería "remoto ≠ base" → conflicto espurio. Cada
    mutación propia sube un contador por ruta y por carpeta (`noteOwnRemoteMutation`); el pull (y
    `deleteRemoteDirNow`) captura el contador antes del listado y **no evalúa conflictos ni cachea**
    nada mutado después (`cachePulled`, `dirMutatedSince`). Cubierto por un test que falla sin la guarda.
    Los mapas se podan al soltar cada listado (`beginListing`/`endListing`): las entradas con número
    ≤ el del listado vivo más antiguo ya no pueden responder "mutado después".
  - **Aviso**: el mismo que Cloud (ver "Botón de sync de la titlebar"); `SyncStatus.conflictCopies` y
    `SyncStatus.conflictMerges` (notas fusionadas con marcas), solo en memoria, acumulados hasta
    *Dismiss*, se limpian en `disconnectGitHub()`.
  - **Residuales (asumidos):** base desconocida (caché perdida, `disconnectGitHub`, ficheros nunca
    reconciliados) ⇒ LWW histórico; las ediciones **no** apuntadas en el journal (CLI con la app
    cerrada) **sí** quedan cubiertas por las tres vías del pull; una edición en la app justo después
    de un push del CLI de la misma nota (antes de un pull de la app) da una fusión de más (cachés de base
    separadas; segura — en el caso típico la unión de líneas es limpia); ventana de actualización: un push de un build anterior no cacheado +
    una edición pendiente nueva ⇒ posible copia espuria en el primer pull; una sección borrada en remoto
    mientras se edita en local puede re-crearse como fichero huérfano (oculto) **fuera** del camino de
    conflicto (en la fusión se vuelve a listar, ver arriba); Cloud no cae en ese caso con la subida
    condicionada v2 (la re-subida sobre el tombstone es `stale` → `keep-local` → `withKeptLocalSections`),
    pero sí podría con el fallback v1 (`cloud_upsert_file`, sin compare-and-swap) contra un servidor sin la
    migración 0014 — asumido; `settings.json`
    ilegible ⇒ `isCloudSyncEnabledFailClosed` = true ⇒ subidas incondicionales; la fusión de un
    aplicado que falla a medias se rehace en el siguiente pull sin perder nada (las bases y el journal
    solo cambian tras escribir); en el camino histórico (copias), si el aplicado
    falla a medias sin ops en el journal (edición del CLI), el reintento puede hacer
    una segunda copia (el dedupe va por `conflictCopied` de los ops, y una edición posterior sin el flag
    también provoca otra copia — solapada, pero sin perder nada); el ancla y las secciones se suben
    en commits separados, así que si el ancla pasa la comprobación y una sección no, el remoto queda con
    el ancla local + la sección remota (nada se pierde); el camino de conflicto no mira `updated:`. El
    **CLI con GitHub** fusiona igual en su push (`githubResolveConflictDir`, mismo planificador; ver "El
    CLI con GitHub" arriba).
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito. Se
  queda en `pending` mientras haya una elección de origen pendiente (ver "Origen del dir de notas").
- **Catch-up de subida (`flushPendingLocalChanges`) — dos niveles de filtro:**
  1. **Puerta por carpeta:** se salta la nota cuyo `note.md updated <= lastSync` (o cuyo `updated` no
     sea parseable). Es lo único que distingue "hay algo que subir": el timestamp **no dice qué
     sección cambió**, así que selecciona la carpeta ENTERA.
  2. **Filtro por fichero (blob sha):** dentro de la carpeta se salta cada `.md` cuyo
     `gitBlobSha(contenido en disco)` coincida con el sha del **tree que el pull ya trajo** — se le
     pasa el `treeShaByPath` de `pullNotes` (`remoteHasContent` en `mirrorPlan.ts`, puro y testeado),
     así que **cero requests extra**. Sin él, editar el título de una nota de 8 secciones encolaba 9
     pushes de los que 8 eran no-ops (y, antes de la guarda de `upsertRemoteFileNow`, 8 commits
     vacíos). ⚠️ **Nunca se salta por falta de datos**: sin mapa de shas, con el path ausente del
     tree o si falla la lectura ⇒ se encola (saltar sería perder un push).
     Al saltar un fichero se **da de baja su `upsert` journalado** (mismo razonamiento que la pasada
     `unchanged` de `mirrorToGitHub`): la intención está satisfecha y dejarla colgada desarmaría para
     siempre la regla de borrado local de ese dir (`shouldDeletionRuleSkipDir`). La función devuelve
     si el journal cambió y `pullNotes` lo persiste con el resto del estado.

  Con esto un guardado real sigue costando **2 commits** (`note.md` + la sección tocada): el push por
  la Git Data API (blobs→tree→commit, 1 commit por guardado) está **descartado por ahora**.
- **Migración remota:** `migrateRemoteToV2IfNeeded(notesDir)` — ver "Migración v1 → v2".

### Lado renderer: un pull con la nota abierta

Un pull (GitHub o Cloud) escribe el disco y emite `notes-updated` → `loadNotes()`/`syncNote()` en
cada ventana. Dos invariantes del renderer (detalle en `patterns.md`, "Sync entre ventanas" y "Sync
de contenido externo en los editores"):

- **El store nunca retrocede por una recarga:** `loadNotes` conserva la copia en memoria de toda nota
  escrita localmente mientras leía/descifraba y luego le hace `syncNote`
  (`keepNotesChangedDuringLoad`, `src/lib/reloadGuard.ts`) — igual que `syncNote` con su snapshot.
- **Un editor enfocado aplica o fusiona el contenido remoto** (outbox de ecos + `merge3`,
  `src/lib/externalContentSync.ts`): antes lo saltaba y la siguiente pulsación subía el texto viejo
  encima del remoto a todos los dispositivos (bug B1).
