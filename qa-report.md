# Informe QA pre-release — NoteFlow desktop (`main` @ 94bdfa2)

**Fecha:** 2026-10-21 · **Entorno:** Windows 11, `npm run dev` equivalente (Vite + Electron 35 dev),
conducido con Playwright `_electron`. Cuenta real `yago.igle@gmail.com` (Bundle comp).
**Montaje:** dos instancias dev aisladas (userData propio cada una, dirs de notas vacíos
`%USERPROFILE%\NoteFlow-QA` y `NoteFlow-QA-2`), más la app real instalada (**v2.0.0**, en marcha
durante todo el QA) como tercer dispositivo observado solo por disco. GitHub probado contra el repo
de pruebas privado `yagoid/noteflow-qa-test`.

**Evidencias** (capturas + logs main/renderer): `C:\Users\yagoi\NoteFlow-QA-backups\qa-evidence-20261021\`
(las capturas `d2-*` son de la instancia 2).

---

## 1. Resumen

| Severidad | # | Bugs |
|---|---|---|
| **Importante (pérdida de datos)** | 3 | B1 editor con foco pisa cambios remotos · B2 edición offline descartada en silencio · B3 GitHub sube sin condiciones |
| Menor | 7 | B4–B10 (copy, mensajes engañosos, UX) |

**Veredicto:** la cuenta, NoteFlow AI, Cloud (pull inicial, push, realtime, borrados, reconexión,
arranque offline, exclusión con GitHub, espejo) y los fixes del editor **funcionan**. El riesgo
real para la release es **B1**: es fácil de provocar (una nota abierta con el cursor dentro mientras
llega un cambio de otro dispositivo; basta con pulsar el botón de sync de la titlebar) y pierde la
edición del otro dispositivo **sin aviso**. Recomiendo decidir sobre B1 antes de publicar. B2 y B3 son
decisiones de diseño ya documentadas, pero conviene que el usuario sepa que existen.

---

## 2. Tabla de pruebas

### 2.1 Cuenta NoteFlow
| Prueba | Resultado | Notas |
|---|---|---|
| Login OTP (instancia 1 y 2) | OK | Códigos de **8 dígitos**; la UI dice "6" (B5) |
| Reenviar código | OK* | A los 30 s (cooldown de la UI) → "Demasiados intentos" (B6). A los 62 s → OK |
| Código antiguo tras reenvío | OK | Rechazado ("no coincide o ha caducado"); el nuevo entra |
| Entitlements Bundle | OK | AI **Activo**, Cloud **Activo** |
| Actualizar | OK* | Funciona; ~3 de ~10 refrescos agotaron el timeout de 15 s (latencia del servidor, B10) |
| Cerrar sesión (solo este dispositivo) | OK | Instancia 2 fuera → Cloud off, GitHub se reanuda, IA vuelve a BYO. Instancia 1 siguió refrescando y la app real siguió sincronizando (edición llegó en 7,5 s). `scope=local` verificado |
| Tarjetas de planes: "Precios con IVA incluido" | OK | Visible en Sync→Cloud y en IA con sesión cerrada |
| Sin "Suscribirse" para lo que ya se tiene | OK | Con Bundle activo no se muestra ninguna oferta; con sesión cerrada no hay botón de compra (remite a iniciar sesión) |
| Enlaces Términos / Privacidad | OK | ES → `/noteflow/es/terms` y `/es/privacy`; EN → `/terms`, `/privacy`. Las 4 URLs devuelven 200 |
| Arranque sin red: entitlements desde caché + reintento | OK | Sin red: `signedIn`, AI+Cloud conocidos desde caché, **IA gestionada sigue activa y configurada**. Al volver la red: entitlements refrescados en ≤10 s, sin acción del usuario |

### 2.2 NoteFlow AI
| Prueba | Resultado | Notas |
|---|---|---|
| Probar conexión (preset gestionado) | OK | "✓ Conectado" |
| Chat con deepseek-v4-flash | OK | Respuesta correcta |
| Barra de uso | OK | 97k → 110k / 3M tokens tras 3 mensajes cortos |
| Detener a mitad de respuesta | OK | El stream se cortó en "41," y no creció más |
| Cambio NoteFlow AI ↔ BYO sin perder claves | OK* | La clave de DeepSeek (dummy de pruebas) se conserva ("Clave guardada") y el modelo gestionado elegido también. Matiz B9: al volver a BYO preselecciona Anthropic, no el último BYO |
| Login en dispositivo nuevo con entitlement AI | Observación | No se activa NoteFlow AI solo (decisión de diseño: baseline por identidad). El usuario debe elegirlo a mano |

### 2.3 NoteFlow Cloud (managed)
| Prueba | Resultado | Notas |
|---|---|---|
| Primer enable en dir nuevo (pull completo) | OK | <1 s; 262 ficheros; contenido idéntico (md5) entre las dos instancias `main` |
| Merge de metadatos con backup | OK | `QA-Group` local creado antes de activar → backup en `userData/cloud-metadata-backups/<ISO>/groups.json` + unión subida; llegó a la app real |
| Crear/editar nota `QA-` → servidor | OK | Verificado consultando las filas del servidor (`updated_at`, `deleted`) |
| Realtime A→B y B→A | OK | ~7 s (incluye el debounce de 5 s) en ambos sentidos |
| Realtime con la nota **abierta y con foco** en el receptor | **FAIL** | **B1** |
| Borrado de nota `QA-` y propagación | OK | Desapareció de la otra instancia y de la app real en ~3 s |
| Edición offline y reconexión | OK* | Journal con el upsert pendiente, titlebar "Error"; al reconectar se resuelve solo. Si otro dispositivo editó la misma nota mientras tanto, la edición offline se **pierde sin aviso** (**B2**) |
| Arranque offline + "Espejar en GitHub" debe negarse | OK | `cloud-initial-pull-pending` con pull inicial fallido. Con pull OK y sin GitHub → `not-connected` (no toca nada). Mensaje de Cloud offline engañoso (**B4**) |
| Lock/unlock | N/A | En modo managed no hay botón de bloquear |
| Exclusión mutua Cloud ⟂ GitHub | OK | Con Cloud activo: GitHub "En pausa", sin "Sincronizar ahora", `pullNotes()` → `cloud-enabled`; aviso en el panel de Cloud |
| Espejar en GitHub (repo de pruebas, pull limpio) | OK | Diálogo de confirmación claro; repo == dir local (diff de listados vacío) |

### 2.4 GitHub Sync (repo `yagoid/noteflow-qa-test`)
| Prueba | Resultado | Notas |
|---|---|---|
| Conectar (Device Flow) a repo existente vacío | OK* | Sube todo (140/140 ficheros, ~2,5 min), pero mientras tanto y hasta un "Sincronizar ahora" manual muestra "Git Repository is empty." + pull inicial fallido (**B7**) |
| Push | OK | ~12 s |
| Pull (edición remota) | OK | El fichero se actualizó en disco (el editor abierto no, por B1) |
| Conflicto (edición remota + local sin pull previo) | **FAIL (conocido)** | La subida local pisó la remota (**B3**) |
| No activo a la vez que Cloud | OK | Ver 2.3 |

### 2.5 Editor (fixes recientes)
| Prueba | Resultado | Notas |
|---|---|---|
| `C++`, `` `i++` ``, `a ++ b ++ c` intactos tras editar y guardar | OK | Tecleado en raw y en WYSIWYG; el fichero conserva el texto exacto |
| `++underline++` real | OK | Se renderiza `<u>`. Matiz: `++x++` tecleado en WYSIWYG se ve literal y al reabrir pasa a subrayado (ambigüedad documentada en `patterns.md`) |
| Split: escribir en nota nueva y clicar el otro panel al instante | OK | Texto conservado; la nota no se podó |
| Cerrar ventana de sección justo tras teclear | OK | Último texto guardado |
| Tareas multilínea con 📅 | OK | 📅/🔺 de continuación recuperados si faltaban; el 📅 duplicado se queda como texto; al guardar, las anotaciones van a la 1ª línea |
| Kanban | OK | Tablero insertado, tarjetas, check → columna "Hecho"; markdown correcto |
| Índice flotante (TOC) | OK | Raíl → panel al hover → salto al encabezado |
| Nota temporal → "Hacer permanente" | OK | `expiresAt` eliminado y propagado. El disparador es solo el chevron de 11 px (la fecha no es clicable) |

### 2.6 Varios
| Prueba | Resultado | Notas |
|---|---|---|
| Buscar actualizaciones | OK* | Latest = 2.0.0 = versión actual → "Estás al día" (3 s). Con error de red también dice "al día" (**B8**). ⚠️ `package.json` sigue en **2.0.0**: hay que subir versión antes de publicar |
| Cambio EN/ES en caliente | OK | Cuenta, Sync, IA y Acerca de, sin claves sin traducir |
| Errores de consola / log main | OK | 0 `pageerror`; renderer sin errores propios (solo ruido de DevTools `Autofill.enable`). Main: solo los errores esperados de las simulaciones sin red y los timeouts de B10 |
| Compras | NO PROBADO | Por instrucción (las hace el usuario) |
| E2EE / modo de cifrado | NO PROBADO | Por instrucción (prohibido tocarlo) |
| CLI como 2º dispositivo | NO USADO | Se usó una 2ª instancia dev para no mover el cursor `cliCloud` del `settings.json` real |
| Edición de una nota real | NO HECHO | No fue necesario: todo se cubrió con notas `QA-` |

---

## 3. Bugs

### B1 — Un editor con foco ignora el cambio remoto y la siguiente pulsación lo pisa · **Importante (pérdida de datos silenciosa)**
- **Pasos:** dispositivos A y B con Cloud (o B con GitHub). En A, abrir la nota X con el cursor dentro
  del editor. En B, editar X y esperar a que llegue (realtime ~7 s, o pulsar el botón de sync de la
  titlebar en GitHub). Ver el editor de A y teclear algo.
- **Esperado:** A muestra la versión remota (o avisa del conflicto) antes de aceptar nuevas ediciones.
- **Real:** el fichero en disco de A se actualiza, pero el editor sigue mostrando el texto viejo. La
  siguiente edición en A guarda *texto viejo + lo tecleado* y lo sube. La edición de B desaparece de
  todos los dispositivos, sin copia ni aviso.
- **Evidencia:** `RT-B-6602` (de B) perdido al teclear `LOCAL-C-7703` en A (`27-stale-overwrite.png`;
  fichero final `…RT-A-5501 LOCAL-C-7703`). Reproducido otra vez a la inversa (`LOCAL-C-7703` perdido
  por `BG-D-8804`) y con un pull de GitHub (`d2-62-gh-pulled.png`: disco con `GH-REMOTE-4242`, editor
  sin él). Pulsar el botón de sync de la titlebar **no quita el foco** al editor, así que el caso
  "teclear → sincronizar → seguir tecleando" cae siempre en el bug.
- **Causa probable:** `src/components/Editor/Editor.tsx:314`: el efecto de `content` externo hace
  `return` si `editorOwnsFocus(...)` y no se vuelve a aplicar al perder el foco. `editor.isFocused`
  (ProseMirror) sigue siendo `true` aunque la ventana esté en segundo plano. No verificado si es
  regresión o si ya pasaba en 2.0.0.

### B2 — Una edición offline se descarta en silencio si otro dispositivo editó la misma nota · **Importante (diseño)**
- **Pasos:** A sin red edita X (queda en el journal). B edita X. A recupera la red y sincroniza.
- **Real:** gana B (LWW por carpeta). La edición offline de A (`OFFLINE-E-9905`) no está en ningún
  sitio: ni copia de conflicto ni aviso.
- **Nota:** es la regla documentada en `monetization.md` ("Subidas condicionadas"). No es un fallo de
  implementación, pero para el usuario es pérdida de datos. Sugerencia: crear una copia de conflicto
  `"<título> (conflicto)"` o, como mínimo, avisar.

### B3 — GitHub Sync pisa ediciones remotas que no ha traído · **Importante (conocido)**
- **Pasos:** editar X directamente en el repo (otro dispositivo), sin hacer pull en A, editar X en A.
- **Real:** el push de A sobrescribe la versión remota (`REMOTE-H-2121` perdido; ver los commits del
  repo de pruebas `QA remote edit H` → `update: …w9yadR`).
- **Nota:** documentado como "pendiente solo en GitHub" en `monetization.md`.

### B4 — Sin red, Cloud dice "Inicia sesión en tu cuenta…" estando con sesión · Menor
- **Pasos:** arrancar con sesión y sin red → Ajustes/estado de Cloud.
- **Real:** `error: "Sign in to your NoteFlow account to use NoteFlow Cloud."`, con `signedIn: true`.
- **Causa:** `electron/cloudKeys.ts` `supabaseRest` lanza `not-signed-in` siempre que
  `getAccessToken()` devuelve `null`, y eso incluye un fallo de red. `cloudSync.ts:1540` lo traduce
  a `NOT_SIGNED_IN_ERROR`.
- **Esperado:** "Sin conexión / no se pudo contactar…".

### B5 — El copy del OTP dice "6 dígitos" y el código tiene 8 · Menor
- `src/i18n/{en,es}/settings.ts` (`codeSentPrefix`, `emptyCode`) + placeholder `123456`. Los dos correos
  recibidos traían códigos de 8 dígitos (el input los acepta). Ajustar el copy o la config de Supabase.

### B6 — "Reenviar código" se habilita a los 30 s y el servidor exige ~60 s · Menor
- `AccountPanel.tsx` `RESEND_COOLDOWN_S = 30`. Al primer reenvío (30 s): "Demasiados intentos. Espera
  un momento…" (`06-otp-resent.png`). A los 62 s funciona. Subir el cooldown a 60 s.

### B7 — Conectar GitHub a un repo existente vacío deja un error persistente · Menor
- **Pasos:** crear un repo privado vacío (sin README) → Conectar con GitHub.
- **Real:** "Git Repository is empty." + `initialPullStatus: failed`. La subida inicial sí ocurre (140
  ficheros, ~2,5 min), pero el error no se limpia hasta pulsar "Sincronizar ahora" (`d2-60-gh-sync-now.png`).
- **Esperado:** tratar el repo vacío como pull OK vacío.

### B8 — "Buscar actualizaciones" dice "Estás al día" si falla la red · Menor
- `electron/main.ts` `app:check-update`: `req.on('error')` y el timeout resuelven `{hasUpdate:false}`
  → la UI muestra "al día". Debería mostrar "no se pudo comprobar".
- **Recordatorio de release:** `package.json` = 2.0.0 = última release publicada. Sin subir versión,
  los usuarios de 2.0.0 no verán la actualización.

### B9 — Al volver a "Tu proveedor" se preselecciona Anthropic y no el último BYO · Menor
- Con `lastByoProvider = deepseek` (clave guardada), la tarjeta BYO abre con "Anthropic (Claude)"
  seleccionado. Hay que cambiar el desplegable a DeepSeek a mano antes de "Usar este proveedor".

### B10 — Picos de latencia de Supabase REST (intermitente) · Menor / infra
- 3 `refreshEntitlements failed: TimeoutError` (15 s) en la sesión. Con `curl` medí un GET a
  `/rest/v1/subscriptions` de **13,4 s**; el resto, ~0,1 s. Puede ser red local o el plan de
  Supabase. Si se repite, "Actualizar" falla de forma intermitente.

---

## 4. Observaciones (no son bugs de `main`)

- **O1 — La app instalada v2.0.0 reproduce el bug del cursor `updated_at`** que `main` corrige con
  `pullSeq` (126cd21): recibió el `note.md` de `QA-Cloud-1` pero su sección se quedó vacía unos 10 min,
  hasta la siguiente edición. Esto refuerza la necesidad de la release; el "full reconcile único" al
  actualizar debería curarlo (no probado sobre la app real).
- **O2 — Divergencia en tus datos reales:** la nota **"FAT Web"** (`17092026-ZWkzKsXo`, grupo
  `_IIImbmd`) existe en `~/noteflow-notes` pero en el servidor está **borrada (tombstone del
  2026-10-14 08:20)**. No llega a ningún otro dispositivo. Es el "caso residual asumido" de
  `monetization.md`. **No la he tocado.** Decide tú: si la quieres, edítala (se re-sube); si no,
  bórrala.
- **O3 —** En una sesión nueva con entitlement AI, el asistente no pasa solo a NoteFlow AI (diseño).
- **O4 —** "Nueva nota" con el botón enfoca un título vacío; con `Ctrl+N` la nota sale titulada con la
  fecha y el foco va al cuerpo. Comportamiento distinto; no sé si es intencionado.
- **O5 —** El texto del panel de Cloud en modo **estándar/managed** dice "Las notas se cifran en este
  dispositivo… el servidor solo almacena texto cifrado". Es cierto, pero en managed el operador
  custodia la KEK. Conviene revisar que el copy sea coherente con la política de privacidad.
- **O6 —** "Desactivar sincronización" de Cloud no pide confirmación (no borra nada; solo informativo).

---

## 5. Integridad de los datos del usuario

- **Backup previo** (antes de tocar nada): `C:\Users\yagoi\NoteFlow-QA-backups\20261021-085407\`
  - `noteflow-notes\` (copia completa: 34 entradas, 131 ficheros) + `manifest-md5.txt`
  - `userData\settings.json`, `sync-state.json`, `cloud-sync-state.json`, `ai-chats.json`
- **Notas `QA-` creadas y borradas** (todas con tombstone verificado en el servidor): `QA-Cloud-1`,
  `QA-Del-1`, `QA-Editor-1`, `QA-Split-1`, `QA-Split-2`, `QA-Tasks-1`, `QA-Temp-1`. `QA-Del-1` y
  `QA-Split-2` nacieron con título por defecto (fecha) y se renombraron a `QA-…` al momento.
- **Grupo `QA-Group`:** creado (con tu permiso) y borrado; `groups.json` del servidor ya no lo tiene.
- **Verificación final del dir real `~/noteflow-notes`:** listado idéntico al backup y **los 131
  ficheros idénticos byte a byte** (md5) al manifiesto previo. Los 6 JSON de metadatos, idénticos.
- **Nota real editada:** ninguna.
- **`settings.json` real:** sin diferencias no volátiles respecto al backup. La sesión del CLI
  (`cliAccount`) y su cursor (`cliCloud`) no han cambiado; la app real solo rotó su propio refresh
  token (normal).
- **Limpieza:** las dos instancias dev cerraron sesión (scope local) y se desconectó GitHub. Se
  borraron sus userData (`.electron-dev`, `.electron-dev-2`) y los dirs `NoteFlow-QA` / `NoteFlow-QA-2`
  (copias). No queda ningún proceso dev ni Vite. La app real (v2.0.0) siguió funcionando todo el rato
  y no se tocó.
- **Pendiente para ti:**
  - borrar el repo de pruebas `yagoid/noteflow-qa-test` (contiene una copia de tus notas);
  - cuando estés conforme, borrar `C:\Users\yagoi\NoteFlow-QA-backups\` (backup + evidencias).

  No revoques la autorización OAuth de NoteFlow en GitHub: es la misma app que usa tu instalación
  real. El token de la prueba se borró con el userData dev.
- **Coste de IA:** unos 13k tokens de la cuota gestionada (97k → 110k).
