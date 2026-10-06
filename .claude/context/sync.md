# NoteFlow — GitHub Sync

### Interfaz `SyncProvider` (`electron/syncProvider.ts`) — fase 4.2, tramo 2

`main.ts` **no llama a `githubSync` en duro** en el flujo de escritura de notas: enruta por
`getActiveSyncProvider()`, que devuelve el backend activo — **NoteFlow Cloud si
`settings.cloudSync.enabled` (prioridad), GitHub en caso contrario**. Son **mutuamente
excluyentes**: esta función es la única fuente de verdad (el tick del autosync de GitHub se salta
si Cloud está habilitado), y la página Settings → Sync lo comunica visualmente (selector de dos
tarjetas con badges de estado + aviso "paused" en el panel de GitHub con Cloud activo — tramo 4,
ver `monetization.md` § 4 "Settings UI").
⚠️ Exclusión mutua = **enrutado**, no "GitHub no escribe nunca": el pull manual de GitHub
(`sync:pull`, botón de Settings → Sync → GitHub) sigue disponible con Cloud activo y su catch-up
(`flushPendingLocalChanges`) empuja ficheros al repo **sin pasar por el router** — es lo que evita
que el espejo pausado se quede obsoleto (ver la regla de borrado más abajo). Ese catch-up es
parcial (filtra por `updated` y nunca borra): para dejar el repo **exacto** está la acción
**"Espejar en GitHub"** (`mirrorToGitHub`, abajo), que solo se ofrece con Cloud activo.

**Cerrar sesión de la cuenta NoteFlow apaga Cloud** (`enabled = false` vía `disableCloudSync()`,
que conserva `lastSync`/`pullCursor`/journal) → se **libera la exclusión mutua** y GitHub Sync
vuelve a sincronizar solo en su siguiente tick si estaba conectado. Sin ese apagado la app se
quedaba sin ningún backend activo (Cloud sin sesión no puede sincronizar y GitHub seguía "Paused").
Lógica pura de la transición: `electron/accountTransition.ts` (ver `monetization.md` § 4 "Cerrar
sesión").

Superficie (extraída de lo que `main.ts` consumía de `githubSync.ts`; ambos adapters son finos y
delegan 1:1 sin cambiar comportamiento): `isConnected()`, `schedulePush(relPath, content,
onStart?, onComplete?)`, `pushPathsNow(notesDir, relPaths)`, `scheduleDelete(relPath)`,
`scheduleDeleteDir(dir)`, `pullNotes(notesDir)` (mismo shape de resultado en ambos),
`retrySyncJournal(notesDir)`, `hasPendingRemoteMutations()`. Lo específico de cada backend
(Device Flow, migración remota v2, claves E2EE/unlock) queda FUERA de la interfaz — sus IPC
propios llaman a los módulos directamente.

**Botón de sync de la titlebar** (`TitleBar.tsx`): NO está cableado a GitHub. Consume
`sync:get-active-status` (helper `getActiveSyncStatus()` en `syncProvider.ts`, espejo de
`getActiveSyncProvider()`) → status normalizado y etiquetado con `backend` (`'github'|'cloud'|'none'`),
y su pull manual va por `sync:pull-active` (Cloud si `enabled`, GitHub si no). El botón se muestra
cuando CUALQUIER backend está `active` (antes solo con GitHub conectado → un usuario solo-Cloud se
quedaba sin sync manual) y se suscribe a `sync:status-changed`, `cloud:status-changed`,
`notes-updated` y `sync:push-state` (refresca en **cada** cambio de push-state, no solo en `idle`,
para que el contador de pendientes vaya al día). El botón y su **tarjeta de estado al hover** viven
en `SyncStatusButton.tsx` (sin `title` nativo; `aria-label` con resumen); la prioridad del estado
mostrado (syncing → uploading → locked → blocked → error → pending → synced) es lógica pura en
`src/lib/syncStatus.ts` (testeada). Además de lo normalizado, el status lleva `pendingUploads`
(tamaño de `pendingPushFiles` de `main.ts`, que se lo pasa a `getActiveSyncStatus(pendingUploads)`:
ficheros con push **en vuelo** — las ediciones aún dentro del debounce de 5 s no cuentan),
`autoSyncIntervalMs` (`GITHUB_AUTO_SYNC_INTERVAL_MS` en `githubSync.ts` /
`CLOUD_AUTO_SYNC_INTERVAL_MS` en `cloudSync.ts`) y, en Cloud, `cloud.realtimeConnected` (sin
evento propio: se lee al refrescar; la tarjeta re-lee el status al abrirse y cada 30 s).
El indicador "pushing" (`sync:push-state`) vale para **ambos** backends: `applyNoteWrite` en
`main.ts` engancha los callbacks `onStart/onComplete` de `schedulePush` del proveedor activo (y el
push durable de las tools del chat) a `pendingPushFiles`. Los deletes no pasan por ese set.
`sync:pull` (GitHub puro) se mantiene intacto para Settings → Sync.

**Cloud Sync** (`electron/cloudSync.ts`, mismo modelo y regla de conflicto que GitHub pero
contra Supabase con E2EE, tombstones en vez de borrado por ausencia, sin cola de mutaciones y
con pull incremental por `updated_at`): detalle completo en `monetization.md` § 4. Su journal
reutiliza las transiciones puras de `syncState.ts` en un fichero PROPIO
(`userData/cloud-sync-state.json`) — nunca el `sync-state.json` de GitHub.
📌 **Problema conocido (preexistente, sin arreglar) — integridad del pull incremental de Cloud:**
`pullNotes` avanza el cursor con `nextPullCursor(s.pullCursor, entries)` (`cloudSyncLogic.ts`), y
`entries` solo contiene las filas que **descifraron** bien (incluidas las de carpetas cuyo aplicado
falló después). Una fila que falla al descifrar y es más antigua que otra del mismo lote queda
**por debajo del cursor para siempre** (`updated_at=gt.cursor`): no se reintenta nunca y se pierde
esa edición en este dispositivo. Ese pull sí reporta el error; los siguientes salen "limpios" sin
haberla aplicado (afecta también al gate de caducidad de notas temporales, ver `patterns.md`).

**El CLI** (`cli/noteflow.js`) tiene su propio cliente Cloud headless (`noteflow cloud …`, con
sesión y cursor propios en `settings.cliAccount`/`cliCloud`, y la misma prioridad Cloud > GitHub):
ver `monetization.md` § 4 "Cliente CLI (headless)".

### GitHub Sync (`electron/githubSync.ts`)
- **Auth:** Device Flow OAuth — sin client secret; el usuario autoriza en
  `github.com/login/device`. Client ID `Ov23liut9QOJ2pJFF0KR` (público por diseño).
- **Token:** `safeStorage.encryptString()` (cifrado a nivel OS) con fallback a base64, en
  `settings.json`.
- **Modelo de rutas:** el remoto espeja el local — `<dir>/note.md`, `<dir>/<secId>.md`; los json
  de metadatos y README en la raíz. Las rutas relativas se codifican **por segmento**
  (`encodeRemotePath`). Push/delete por archivo siguen usando la **Contents API** (acepta rutas
  con `/`); el **listado** usa la **Git Trees API** (`GET /git/trees/{branch}?recursive=1`,
  `default_branch` cacheado).
- **Push:** `schedulePush(relPath, content, onStart?, onEnd?)` — debounce 5s **keyed por ruta
  relativa** (dos archivos de la misma nota debouncen independientes); llamado desde
  `fs:write-note` (por cada archivo escrito), `groups:set`, `folders:set`, `section-colors:set`,
  `note-order:set`. Los callbacks alimentan `pendingPushFiles` → evento `sync:push-state`.
  Cada push se apunta en el **journal** (abajo) al armar el timer y se da de baja al completar;
  un push fallido setea `syncError` y queda journaled para que `retrySyncJournal` lo reintente
  (antes se perdía hasta que el usuario reeditara).
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
  lleva paths de DIRECTORIOS. **Coste:** el pull NO hace un GET por nota — si el blob-sha del
  `note.md` en el tree coincide con el último reconciliado (sha cache, abajo) la carpeta se salta
  sin ninguna request; solo las carpetas con sha nuevo pagan el GET del ancla + comparación de
  `updated`. Si ese GET falla (`getRemoteFile` se traga el error y devuelve `null`) o el tree viene
  truncado, el pull no añade nada a `errors` pero devuelve `incomplete: true` (no se muestra; solo
  frena la caducidad de notas temporales, ver `patterns.md`). El **journal** (abajo) además guarda al pull de los agujeros de datos: se salta dirs
  remotos con `deleteDir` pendiente y ficheros con `delete` pendiente (no resucitar borrados que
  aún no aterrizaron), y la regla de borrado local se salta cualquier dir con `upsert` pendiente
  (su push no aterrizó; borrarlo sería pérdida de datos).
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
  un `updated` viejo, que el flush normal nunca sube. Cerrar sesión pasa por `disableCloudSync()`, así
  que también marca. El **primer pull que termine OK** lo consume y corre `flushPendingLocalChanges`
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
  Settings → Sync → GitHub, **entre "Sincronizar ahora" y "Desconectar" y solo si Cloud está
  habilitado** (con diálogo de confirmación: el repo se sobrescribe y se borran ficheros de él).
  Existe porque con Cloud activo GitHub es un espejo de **solo escritura**: no recibe borrados y el
  flush del pull filtra por el `updated` del `note.md`, así que una nota que Cloud trajo de otro
  dispositivo con `updated` viejo nunca sube. "Sincronizar ahora" (`sync:pull`) NO cambia.
  - **Gate de Cloud en `main.ts`** (`sync:mirror-to-github` → `{ok:false, error:'cloud-required'}`
    si Cloud está apagado): `githubSync.ts` no puede importar `cloudSync.ts` (ciclo). El handler no
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
  **note-order.json**, templates.json, ui-settings.json (los dos en negrita se pusheaban pero NO
  se pulleaban — bug arreglado con el cambio de formato). `templates.json` (plantillas) y
  `ui-settings.json` (apariencia + ajustes del editor, ver `architecture.md`) siguen el mismo
  patrón simple que note-order: push debounced + pull. ⚠️ La lista tiene un espejo en
  `CLOUD_METADATA_FILENAMES` (`cloudSyncLogic.ts`), en `RESERVED_ROOT_NAMES` (`main.ts`) y en
  `METADATA_FILES` del CLI (`cli/noteflow.js`) — mantener las cuatro en sync al añadir un JSON raíz.
  📌 **Pendiente (no implementado):** el pull de metadatos **no arbitra por timestamp** — si el
  contenido difiere gana el remoto. Lo único que hoy evita que un repo con metadatos obsoletos pise
  `groups.json`/`folders.json`/`note-order.json` locales es la caché de SHAs; si esa caché se vacía
  (`sync-state.json` perdido o corrupto, `disconnectGitHub`, `pruneShas`), el primer pull tras una
  pausa larga de Cloud sobrescribe los metadatos locales con los viejos. Las notas sobreviven (la
  regla de borrado ya no corre en ese escenario), pero pierden carpeta/grupo/orden.
  👉 Lo que **hoy resuelve** ese escenario es la acción de **espejo** (arriba): sube los metadatos
  locales al repo y re-cachea sus SHAs, así que el siguiente pull ya no tiene nada viejo que pisar.
- **Autosync:** cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado: primero drena el
  journal (`retrySyncJournal`), luego pull (que se pospone si quedan mutaciones en vuelo).
- **Delete:** `scheduleDelete(relPath)` (sección suelta) y `scheduleDeleteDir(dir)` (lista el
  árbol y borra cada blob bajo `<dir>/`; usado por borrar nota y notas expiradas — estas últimas
  solo justo tras un pull limpio del backend activo, ver `patterns.md` § "Motor de alarmas y notas
  temporales", porque el borrado es incondicional). Ambos se
  journalan antes de ejecutarse y en fallo setean `syncError` y QUEDAN en el journal para retry
  (sin tope de intentos: un borrado remoto perdido = nota que resucita en el siguiente pull).
- **Journal + sha cache (`electron/syncState.ts` + `userData/sync-state.json`):** estado LOCAL de
  durabilidad (deliberadamente fuera del dir de notas — no debe sincronizarse; se limpia en
  `disconnectGitHub()`; corrupto/ausente degrada a estado vacío, nunca bloquea el sync). Dos mapas:
  - **`ops` (journal de mutaciones remotas pendientes):** cada push debounced se apunta como
    `upsert` **al armar el timer** (sobrevive a cerrar la app durante el debounce) — keyed por
    relPath; `scheduleDelete`/`scheduleDeleteDir` como `delete`/`deleteDir` (este último descarta
    los ops de fichero bajo el dir). Baja al completar con éxito; en fallo queda (`attempts++`).
    `retrySyncJournal(notesDir)` lo drena: upserts releen el contenido ACTUAL de disco (si el
    fichero local ya no existe, se descarta la entrada — el borrado lo cubre su propia entrada),
    deletes se re-ejecutan; **no bumpea `lastSync`** (mismo motivo que `pushPathsNow`). Lo llama
    `main.ts` en cada tick del autosync ANTES de `pullNotes` y tras el pull inicial OK; gated por
    `initialPullStatus === 'ok'`. Semántica LWW conservada: si un dir con upsert pendiente viene
    MÁS NUEVO del remoto, el pull lo sobrescribe entero y el retry sube después lo que haya en disco.
  - **`shas` (cache de blobs reconciliados):** relPath del ancla (`<dir>/note.md`) o del metadata →
    blob-sha del tree ya reconciliado. Se escribe tras cada decisión del pull (tanto si pulleó como
    si ganó lo local) y permite el skip sin GET; se poda a los paths presentes en el tree.
    Los `METADATA_FILENAMES` usan el mismo cache (solo GET cuando el sha del tree difiere).
    La lógica de transiciones/decisiones es pura en `syncState.ts` (sin imports de Electron, patrón
    `entitlements.ts`) y está cubierta por `tests/electron/syncState.test.ts`.
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
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito.
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
