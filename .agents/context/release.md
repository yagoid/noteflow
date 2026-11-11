# NoteFlow — Release, build y CI/CD

## Proceso de release

### Checklist completo (en orden)

Un release es **todo o nada**: el updater in-app de las versiones ya instaladas lee
`/releases/latest` y construye la URL del asset por **nombre de fichero**, así que un nombre mal o un
release publicado antes de tiempo rompe la actualización de todos los usuarios de esa plataforma.

1. **Migraciones de Supabase antes que el cliente:** si la versión usa una migración nueva de
   `supabase/migrations/`, aplicarla al proyecto real (`supabase db push`) **antes** de publicar.
   Caso concreto: la app/CLI que pide `files.seq` (cursor del pull de Cloud) necesita la **0008** —
   contra un servidor sin ella el pull de Cloud responde 400 (error visible, sin pérdida de datos).
   Ver `supabase/README.md` § 7.
2. **Bump de versión** (actualiza `package.json` **y** `package-lock.json`, sin crear commit ni tag):
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```
   (`npm pkg set version=...` solo toca `package.json` y deja el lock desfasado.)
3. **README:** bumpear la versión en las líneas del AppImage (`wget …/NoteFlow-X.Y.Z.AppImage`,
   `chmod +x NoteFlow-X.Y.Z.AppImage`, `./NoteFlow-X.Y.Z.AppImage`, sección Arch) — llevan el
   número en el nombre del fichero y `releases/latest/download/<nombre>` exige el nombre exacto (404 si
   no casa).
4. **PKGBUILD:** bumpear `pkgver` **a mano** (no se sincroniza solo). Ojo: el PKGBUILD está
   **roto/no soportado** ahora mismo (ver "Artefactos"); se mantiene el bump para no desincronizarlo.
   **Tour "What's new":** si la versión trae features visibles, añadir sus diapositivas nuevas al tour
   (`src/components/WhatsNew/whatsNewSlides.ts`, antes de `more`, con `since` = X.Y.Z) + su copy EN/ES
   + sus clips `src/assets/whats-new/<id>.<lang>.webm`; los usuarios que actualicen verán solo esas
   (ver `patterns.md` → "Tour What's new").
5. **Compilar y verificar:**
   ```bash
   npm run build      # type-check + recompila dist-electron/
   npm test           # batería Vitest (la CI NO la corre)
   npm run lint       # la CI tampoco; no añadir errores nuevos
   ```
   Commitear **todo `dist-electron/`** si cambió (está versionado — no solo `main.js`/`preload.js`:
   también los módulos puros, `ai/`, `importers/`…). Aun así la CI **recompila `electron/` desde
   fuentes** (`npm run dist` ejecuta `npm run build`), así que el instalador nunca usa el
   `dist-electron/` commiteado; lo versionado sirve al checkout y a quien arranca sin compilar.
   **Gotcha Windows (`core.autocrlf=true`):** `dist-electron/**` es `-text` (ver `.gitattributes`), y
   tsc copia los CRLF del `.ts` del checkout dentro de los template literals. Si
   `dist-electron/githubSync.js` sale modificado sin haber tocado `electron/githubSync.ts`, son esos
   CRLF en `README_CONTENT`: **no commitearlo** (dejarlo igual que en HEAD).
6. **Docs:** `.agents/context/` (y la skill `noteflow-features`) al día si procede; `docs/` y
   `README.md` si el cambio es visible. Commits en inglés.
7. **Commit + push a `main`, luego tag + push del tag** (el tag es lo único que dispara `release.yml`):
   ```bash
   git add -A && git commit -m "chore: release vX.Y.Z"
   git push origin main
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
8. **Esperar a la CI** (`gh run list --limit 5`, `gh run watch <id>`). El job `release` crea el
   release como **draft** (`draft: true`): invisible para `/releases/latest`, así que ningún cliente
   lo ve todavía. Revisar también los avisos del run (`gh run view <id>` → ANNOTATIONS): ahí GitHub
   anuncia con antelación la retirada de runners y acciones (así se habría visto venir la de `macos-14`).
9. **Verificar los assets del draft** (`gh release view vX.Y.Z --json assets --jq '.assets[].name'`).
   Deben estar exactamente: `NoteFlow-X.Y.Z-Setup.exe` (+ `.blockmap`, `latest.yml`),
   `NoteFlow-X.Y.Z-arm64.dmg` (+ `.blockmap`, `latest-mac.yml`), `noteflow_X.Y.Z_amd64.deb`,
   `NoteFlow-X.Y.Z.AppImage` (**sin** `-x86_64`) y `latest-linux.yml`. Son los nombres que espera
   `electron/updateAsset.ts`.
10. **Test E2E del updater con el draft aún sin publicar:** lanzar el workflow `Update E2E`
    (`gh workflow run update-e2e.yml --ref vX.Y.Z -f version=X.Y.Z`; ver "Test E2E del updater" abajo) y/o
    correr `scripts/update-e2e.cjs` en local. Debe salir verde (PASS o KNOWN BROKEN esperado)
    en Windows, AppImage y .deb: escenario A (release publicada anterior → candidata) y B
    (candidata → siguiente). No hace falta publicar nada: el feed de la release es falso.
11. **Escribir las notas a mano** — `generate_release_notes: true` deja el body **vacío** en la
    práctica. Incluir lo que aplique de "Puntos conocidos para las notas de release" (abajo):
    ```bash
    gh release edit vX.Y.Z --notes-file notes.md
    ```
12. **Publicar** (a partir de aquí `/releases/latest` lo devuelve y los clientes lo ofrecen):
    ```bash
    gh release edit vX.Y.Z --draft=false
    ```
13. **Comprobación rápida tras publicar:** en una instalación de la versión anterior, el aviso de
    update aparece en la titlebar (lo único que el E2E no cubre es el GitHub real: `/releases/latest`
    y los redirects de descarga a `release-assets.githubusercontent.com`).

> **Identidad git:** si la máquina no tiene config global,
> `git config user.email "<tu-email>"` y `git config user.name "<tu-usuario>"` antes del commit.

- Antes de hacer push a `main` revisar que la documentación en `.agents/context/` (y la skill `noteflow-features`) está actualizada con los nuevos cambios que se suben (solamente en caso apropiado de ser un cambio a la altura de ser añadido a la documentación).
- Los mensajes de commits deben estar escritos en inglés.

> Al hacer push a `main` puede aparecer `Bypassed rule violations for refs/heads/main: Changes
> must be made through a pull request`. Es una protección de rama bypasseable por el propietario;
> el push se completa igualmente.

### Puntos conocidos para las notas de release

Revisar en cada release cuáles siguen aplicando y copiarlos a las notas:

- **CLI en Windows / PowerShell (desde la versión siguiente a v2.0.0):** el instalador incluye
  `resources\cli\noteflow.ps1` (shim PowerShell: argv multilínea/Unicode, stdin y salida UTF-8) junto
  a `noteflow.cmd`, y PowerShell **prefiere el `.ps1`**. Con la `ExecutionPolicy` por defecto de
  Windows cliente (`Restricted`) falla con "running scripts is disabled on this system". Solución:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, o invocar `noteflow.cmd` explícitamente.
  (cmd.exe y Git Bash no se ven afectados.)
- **Usuarios de AppImage y Arch en v2.0.0 deben actualizar a mano esta vez** (descargar el AppImage
  nuevo de la página de releases). El updater de v2.0.0 elige por distro, no por "corre desde un
  AppImage": en Arch (`/etc/arch-release`, `/usr/bin/pacman`…) pide un `.pkg.tar.zst` que nunca se ha
  publicado (404 → abre el navegador en esa URL); en otras distros no-Debian construye
  `NoteFlow-X.Y.Z-x86_64.AppImage` (el publicado no lleva `-x86_64`, y además su allowlist no admite
  `.AppImage`) → abre el navegador en una URL 404; y un AppImage en una distro Debian-based instala el
  `.deb` con `pkexec dpkg -i` en vez de reemplazar el AppImage (el AppImage sigue viejo). El updater
  corregido (`electron/updateAsset.ts`) solo ayuda **a partir del siguiente salto**: el AppImage se
  reemplaza en sitio; Arch/otras distros sin `.deb` abren la página de releases. Los usuarios de `.deb`
  (Debian/Ubuntu/Mint), Windows y macOS no se ven afectados.

### Subir código SIN hacer release

Caso por defecto cuando solo se quiere publicar el código (features, fixes, docs) sin generar
una nueva versión instalable. **El release solo se dispara con tags `v*`** — un push a `main`
sin tag **nunca** crea release. Por tanto, basta con commitear y pushear, **sin crear ni pushear
ningún tag**:

```bash
npm run build                              # 1. solo si se tocó electron/ (recompila dist-electron/)
git add -A                                 # 2. incluye dist-electron/ si cambió
git commit -m "feat/fix: descripción"      # 3. mensaje en inglés
git push origin main                       # 4. push — NO crear tag
```

- **No** ejecutar `git tag` / `git push origin vX.Y.Z`: eso es lo único que arranca `release.yml`.
- Subir `dist-electron/` si se tocó `electron/` (está versionado).
- Efecto secundario esperado: si el push incluye cambios en `docs/**` (o en el propio `pages.yml`),
  el workflow `pages.yml` redeploya la web de GitHub Pages. Eso **no** es una release de la app, solo
  el sitio; es inofensivo y no requiere acción.

### Qué hace el workflow (`.github/workflows/release.yml`)

Se dispara con tags `v*`. **No corre tests ni lint** (solo `npm ci` + `npm run dist`): eso se hace en
local antes de taggear. Dos jobs:

1. **build** (matrix `windows-latest` + `ubuntu-latest` + `macos-15`, arm64). GitHub retiró `macos-14`
   el 2026-11-02: el job de mac acababa *cancelled* sin arrancar ("The configuration
   'macos-14-arm64-us-default' is not supported") y el job `release`, que necesita los tres, no corría.
   Cuando retiren `macos-15`, subir la etiqueta (ver `actions/runner-images`) y recrear el tag. Pasos:
   - checkout → setup Node 24 → `npm ci`
   - deriva y valida la versión del tag (`vX.Y.Z` → `APP_VERSION`)
   - sincroniza `package.json` (`npm pkg set version=...`) y verifica que coincida (red de seguridad;
     el bump real se hace antes en el repo, paso 2 del checklist)
   - `npm run dist` (= `npm run build` + electron-builder; recompila `electron/` desde fuentes) con
     `env CSC_IDENTITY_AUTO_DISCOVERY=false` (en macOS fuerza firma **ad-hoc** sin Developer ID —
     necesario para arrancar en Apple Silicon; inofensivo en win/linux)
   - sube artefactos por plataforma (`release-win`, `release-linux`, `release-mac`)
2. **release** (ubuntu, tras build): descarga los tres artefactos y crea el GitHub Release como
   **draft** (`draft: true`), con `generate_release_notes: true` (se mantiene, pero el body sale vacío:
   las notas se escriben a mano), publicando:
   - Windows: `*.exe`, `*.exe.blockmap`, `latest.yml`
   - Linux: `*.deb`, `*.AppImage`, `latest-linux.yml` (no hay `.pkg.tar.zst`)
   - macOS: `*.dmg`, `*.dmg.blockmap`, `latest-mac.yml`
   - `prerelease: contains(github.ref_name, '-')` → un tag con sufijo (p. ej. `vX.Y.Z-mac.1`) sale como
     **prerelease** y el updater in-app (`/releases/latest`) lo ignora — útil para probar macOS sin
     empujarlo a los usuarios actuales. (También sale como draft: publicarlo igual, con `--draft=false`.)

> **Por qué draft:** con `draft: false` el release era visible en `/releases/latest` en cuanto se
> creaba, y un cliente que comprobara updates en ese momento podía ver la versión nueva con assets
> aún subiéndose (404) y sin notas. Los drafts son invisibles para `/releases/latest`; se publica a
> mano tras verificar assets, pasar el E2E del updater y escribir notas (pasos 9–12).

> Los `.blockmap` / `latest*.yml` son metadatos de electron-builder (canal de updates); aunque
> el auto-update in-app actual descarga el instalador a mano, conviene seguir publicándolos.

> **Node 24** (actualizado el 2026-11-11): los tres workflows usan majors de acciones que corren en
> Node 24 y compilan con `node-version: 24`. Antes, las `@v4` y `action-gh-release@v2` apuntaban a
> Node 20 (GitHub ya las forzaba a Node 24) y se compilaba con Node 20, sin soporte y por debajo de lo
> que pide `@electron/rebuild` 4 en el `postinstall` de `npm ci` (≥ 22.12). Se eligió 24 por ser la
> versión local de desarrollo. Antes de taggear, mirar los avisos de deprecación del último run
> (`gh run view <id>`).

### Test E2E del updater (`scripts/update-e2e.cjs`)

Prueba el **botón de update de la titlebar** de punta a punta sobre builds empaquetadas reales
(Windows NSIS, Linux AppImage y `.deb`; macOS fuera de alcance). Una ejecución = un escenario:
instala/prepara una build VIEJA (`--from`), la lanza aislada con Playwright `_electron`
(`--user-data-dir` + `NOTEFLOW_NOTES_DIR` en un temp, y `NOTEFLOW_DISABLE_WHATS_NEW=1` para que el
popup de arranque del tour "What's new" no tape el botón en builds ≥ 2.2.0), parchea su proceso main para sustituir GitHub
por un **feed falso** (`https.get` de `/releases/latest` → `tag_name` del target; `net.fetch` de
`…/releases/latest/download/<nombre>` → el fichero de `--to` **solo si el nombre casa exactamente**,
si no 404), recarga, pulsa el botón (localizado por `title` acabado en ` v<target>`, independiente
del idioma) y deja que el **código de la versión vieja** descargue e instale. Verifica: Windows →
versión de `resources/app.asar` instalado = target + relanzamiento por `--force-run`; AppImage →
sha256 del fichero = el AppImage target + relanzado; `.deb` → `dpkg-query` = target (con `-`→`~`,
como hace electron-builder) + relanzado. En Linux "relanzado" = aparece un proceso nuevo de la app
(no un `sh`/`sudo`/`pkexec`, mirado por `/proc/<pid>/exe`) y **sigue vivo 5 s después**. Después relanza la app instalada aislada y exige
`app.getVersion() === target` y **ningún** botón de update. Capturas, log, `result.json` y la lista
de URLs interceptadas van a `--out`. Exit: 0 PASS (o KNOWN BROKEN esperado), 1 FAIL, 2 ERROR del
harness/entorno (no es veredicto).

Lo que **prueba**: que la versión vieja pide el nombre de asset que electron-builder genera (un
nombre mal = 404 → FAIL, nunca enmascarado), que lo instala con su ruta real (NSIS `--updated
--force-run`, rename atómico del AppImage, `pkexec dpkg -i`) y que relanza la nueva. **No** prueba el
GitHub real (`/releases/latest`, redirects de descarga): eso queda para el paso 13. Los fallbacks
`shell.openExternal`/`openPath` se neutralizan y cuentan como fallo (no abren nada en la máquina).

- **Escenario A** (release anterior → candidata): `--from release:latest --to release`
- **Escenario B** (candidata → siguiente; prueba que lo que publicamos sabrá actualizarse luego):
  reempaquetar la build ya compilada con otra versión **sin recompilar** y usarla de target:
  ```bash
  node scripts/update-e2e.cjs --package X.Y.Z-next --no-rebuild   # → release-e2e-next/ (gitignored)
  node scripts/update-e2e.cjs --kind win --from release --to release-e2e-next
  ```
  (`--package` = `electron-builder <targets> --x64 --publish never -c.extraMetadata.version=<v>
  -c.directories.output=<dir>`; `--kind linux-appimage|linux-deb|linux` para Linux.)

**En local** (`--help` para todas las opciones; `--dry-run` resuelve artefactos y versiones sin
instalar nada):
```bash
npm run build    # luego la candidata, con una versión distinta de la publicada:
npx electron-builder --win nsis --x64 --publish never -c.extraMetadata.version=X.Y.Z            # Windows
npx electron-builder --linux deb AppImage --x64 --publish never -c.extraMetadata.version=X.Y.Z  # Linux
node scripts/update-e2e.cjs --kind win --from release:latest --to release              # Windows
xvfb-run -a node scripts/update-e2e.cjs --kind linux-appimage --from release:latest --to release
xvfb-run -a node scripts/update-e2e.cjs --kind linux-deb --from release:latest --to release
```
Para probar **el binario exacto del draft**: `gh release download vX.Y.Z -D <dir>` y `--to <dir>`.

**Efectos secundarios:** en **Windows** mata todos los `NoteFlow.exe`, instala **encima de la
instalación per-user real** (`%LOCALAPPDATA%\Programs\noteflow`) y el relanzamiento de
`--force-run` arranca NoteFlow con el **perfil real** (y probablemente también el dir de notas real: el
`StartApp` de NSIS hereda el entorno de explorer) unos segundos, hasta que el harness lo mata; si
NoteFlow no estaba instalado lo desinstala al final (`--keep-installed` para no hacerlo); si estaba, queda la
versión target. **`.deb`** necesita Debian/Ubuntu y **sudo no interactivo** (`sudo -n true`; la app
corre desacoplada del tty, así que un `sudo -v` cacheado no suele bastar): el `pkexec` de la app se
redirige a `sudo -n` con un shim en el `PATH` del proceso lanzado. **AppImage** trabaja sobre una
copia temporal; su shim de `pkexec` **siempre falla** (si la versión vieja intenta `dpkg -i` en vez de
reemplazarse, es FAIL). Sin FUSE usa `APPIMAGE_EXTRACT_AND_RUN=1` (`--appimage-mode`) y aborta con
exit 2 si la app no ve `APPIMAGE`/`APPDIR` (la semántica que exige `isRunningFromOwnAppImage`).
**Montado (FUSE) ≠ extraído:** el relanzamiento del AppImage solo se prueba de verdad montado (como lo
ejecutan los usuarios, y como corre en CI con `libfuse2`). El `app.relaunch({execPath})` original
relanzaba bien extraído (WSL) pero **no** montado —el escenario B del AppImage falló así en el run de CI
40220133234—; ahora relanza un `/bin/sh` desacoplado (ver `patterns.md` § "Auto-update in-app").
Confirmado en CI (run 40223589595, todo en verde). El `sh` de espera **no** cuenta como relanzamiento
(`waitForLinuxRelaunch` descarta shells y exige que la app siga viva a los 5 s); como mucho cuenta el
demonio FUSE del AppImage nuevo, que sale solo si Electron se cae al arrancar.

**KNOWN BROKEN** (tabla `KNOWN_BROKEN` del script, nada más se admite): `2.0.0 → linux-appimage`
(ver "Puntos conocidos": v2.0.0 elige por distro). Si una entrada empieza a pasar, el script avisa
para quitarla.

**En CI:** `.github/workflows/update-e2e.yml` (`workflow_dispatch` con inputs `from`, por defecto
`release:latest`, y `version` de la candidata, por defecto `<package.json>-e2e.1`; también
`workflow_call`). Matrix `win` / `linux-appimage` / `linux-deb`: `npm ci` → `npm run build` →
candidata a `release/` → siguiente (`<version>-next`, o `.next` si ya lleva sufijo) a
`release-e2e-next/` → escenarios A y B (Linux bajo `xvfb-run`, con `libfuse2`) → sube
`update-e2e-out/` como artefacto. **No** está enganchado a `release.yml`: lanzarlo a mano antes de
publicar el draft (`gh workflow run update-e2e.yml --ref vX.Y.Z -f version=X.Y.Z`). Construye la
candidata desde el checkout (mismo `electron-builder` que la release), no reusa los assets del draft.

### Clips del tour What's new (`scripts/whats-new-capture.cjs`)

Graba desde la app real (Playwright `_electron` + ffmpeg) los clips en bucle del tour →
`src/assets/whats-new/<id>.<lang>.webm` + póster `<id>.<lang>.png` (ids fijos: `sections`, `kanban`,
`links-palette`, `quick-capture`, `windows`, `brain`, `ai`, `agents`, `sync`, `section-map`,
`floating-sidebar`, `snippets`, `more`; idiomas `en`/`es`).
Regenerarlos cuando cambie de forma visible la UI que aparece en ellos:

```bash
# --app = carpeta con dist/ + dist-electron/ compilados (mejor un worktree limpio de HEAD con
# `npm run build`, para no grabar un árbol a medias). Por defecto: la raíz del repo.
node scripts/whats-new-capture.cjs --app <dir> [--only brain,ai] [--lang en|es|all] [--out <dir>] [--frames <dir>]
```

- Requiere `playwright` (devDependency) y `ffmpeg` en el PATH. Abre ventanas reales en pantalla
  (~30 s por clip): no usar ratón/teclado sobre ellas mientras graba.
- Perfil (`--user-data-dir`) y dir de notas (`NOTEFLOW_NOTES_DIR`) **siempre temporales**, con
  `NOTEFLOW_DISABLE_WHATS_NEW=1` y `whatsNewSeen` sembrado para que el tour no tape la toma. Las notas
  demo se siembran **escribiendo carpetas v2 directamente — nunca con el CLI**: `NOTEFLOW_NOTES_DIR`
  no aísla la sesión de NoteFlow Cloud del CLI y empujaría a la cuenta real. La IA habla con un mock
  OpenAI-compatible local (127.0.0.1, key falsa); no se conecta GitHub ni Cloud.
- Captura por CDP `Page.startScreencast` a DPR 1.5 (no `recordVideo`, que sale borroso) → 960×600
  VP9; el cursor falso y las pastillas de teclas se inyectan solo en la página durante la toma.
  Revisar los clips a ojo (`--frames <dir>` guarda los frames y 4 PNG de muestra por clip).
- Presupuesto: ≤ ~700 KB por clip y ≤ ~8 MB el directorio (hoy ~7,9 MB con los pósters, 13 clips × 2
  idiomas: **en el tope**; antes de añadir otro clip, recortar duración/`crf` o los pósters).
- Composiciones sobre un "escritorio" (fondo degradado + ventanas con esquinas redondeadas y sombra,
  cada superficie grabada por separado con sus tiempos reales): `windows` (ventana principal +
  sticky, `encodeWindows`) y `agents` (`encodeAgents`: un terminal falso con un agente de IA genérico
  — página HTML en una ventana extra sin marco del Electron lanzado, manejada por `window.T` — se
  abre centrado y solo; al "ejecutarse" `noteflow add` se desplaza arriba a la izquierda mientras la
  app entra por la derecha con fundido, ambos movimientos como expresiones `overlay` de ffmpeg en
  función de `t`). En `agents` el `noteflow add` se **simula**: `simulateCliAdd()` escribe lo mismo
  que `cmdAdd` → `writeNoteFolder` (append a la sección, `note.md` con el `serializeNoteMd` del CLI
  importado como módulo — exportarlo no ejecuta comandos — y todas las secciones) en el dir de notas
  temporal, y la toma **espera** a que la app pinte la tarea (su `fs.watch`): si un cambio rompiera
  el watcher, la grabación falla en vez de salir sin la tarea. La petición se teclea vía `window.T.key`
  (Playwright inserta los caracteres no ASCII sin `keydown`).
- La maquinaria compartida (lanzar Electron sobre dirs temporales, mock LLM, cursor falso + pastillas,
  `actor`, grabador CDP, `writeConcat`/ffmpeg, máscaras/sombras) vive en `scripts/lib/capture-kit.cjs`
  y el cuaderno demo (EN/ES, ids estables `ID`, `seedNotes`) en `scripts/lib/demo-notes.cjs`; los usan
  este script y los dos de la landing (abajo). `focusEditorEnd`/`focusLastTask` esperan a que el
  editor tenga el foco de verdad (TipTap lo aplica en un `requestAnimationFrame`): sin esa espera, en
  `quick-capture` la primera tecla caía en el título auto-seleccionado de la nota nueva. Un cambio en
  la kit afecta a los tres: probar
  `whats-new-capture.cjs --only sections --lang en --out <dir temporal>` (sin pisar `src/assets/`).
- El cuaderno demo tiene una versión **completa** opt-in (`seedNotes(..., { full: true })` /
  `demoContent(lang, { full: true })`): ~50 notas con ~67 enlaces `noteflow://` entre ellas, un 4.º
  grupo (Business: Marketing / Clients / Meetings) y carpetas nuevas en Personal y Learning, para que
  la vista cerebro salga llena. Las notas extra viven en Engineering y en los grupos Personal /
  Learning / Business, así que el grupo Work de la sidebar conserva sus filas. Sin la opción, el
  cuaderno es el de siempre (14 notas): **el tour What's new no la usa** y sus clips no cambian.

### Vídeo de la landing + GIF del README (`scripts/demo-capture.cjs`)

Graba con un guion fijo sobre el cuaderno demo **completo** (UI en inglés) el vídeo del escaparate de
la landing (`docs/src/components/Home.astro`) y el GIF del README, uno por tema:
`docs/public/video/demo-dark.{mp4,webm}` (**NoteFlow Dark**) y `demo-light.{mp4,webm}` (**NoteFlow
Light**) + pósters `docs/public/video/demo-dark.webp` / `demo-light.webp` (primer fotograma) + (solo
oscuro) `docs/public/screenshots/demo-dark.gif`. Regenerarlo cuando la UI que sale cambie de forma
visible. Con `--marketing <dir>` escribe además `demo-<tema>.mp4` de alta calidad (1280 de ancho,
H.264 `crf 17`) para el equipo de marketing (fuera del repo).

```bash
node scripts/demo-capture.cjs --app <dir> [--theme dark|light|all] [--video-out <dir>] [--shots-out <dir>]
                              [--marketing <dir>] [--samples <dir>] [--frames <dir>] [--no-gif]
```

- Mismas reglas de seguridad que el de los clips (dirs temporales, nunca el CLI, sin GitHub/Cloud,
  mock LLM local, solo cierra los Electron que lanza). Diferencia: activa **de verdad** el índice
  semántico local (para que la respuesta del chat cite sus notas y el cerebro las ilumine) con el
  modelo pequeño `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, **copiado** de `.electron-dev/ai-models`
  si existe (si no, la app lo descarga en el primer uso, ~130 MB). Antes de la toma calienta el modelo
  y la vista cerebro, y vuelve a cargar el modelo en el corte previo al cerebro (el worker lo suelta
  a los 10 s sin uso y su toast "Downloading model" saldría bajo la respuesta).
- Guion (~33 s, una sola toma con un corte): mapa de secciones de la nota → otra sección + una tarea →
  `/` inserta un fragmento (`snippets.json` sembrado) → sidebar: el mapa plegado de una nota se
  despliega y reposar en una celda abre la preview apaisada → peek de un grupo plegado → icono de
  carpeta desde su menú contextual → `Ctrl+S` saca la sección a una sticky y su desplegable de título
  cambia de sección → (corte) vista cerebro, con zoom de rueda sobre el cerebro para que llene el
  panel, + respuesta del chat con sus fuentes. Personal, Learning, Business y Engineering van
  plegados, así que las ~36 notas extra solo se ven en el cerebro.
- La **sticky se compone** sobre la ventana principal en su desplazamiento real (cada ventana se graba
  por CDP por separado; máscara redondeada + sombra con ffmpeg). Ventana a 1120×717 CSS px, captura a
  DPR 1.5 → máster sin pérdida 1280×820 a 30 fps (×1,2 de velocidad). El final funde 0,5 s con el
  primer fotograma (sin cursor, que entra después) y ese mismo fotograma es el póster: póster → vídeo
  → bucle sin saltos. webm VP9 `crf 32` con techo de `1400k`, mp4 H.264 `crf 22` con `maxrate 1800k`
  + `faststart`, póster webp. El techo importa: sin él, los ~3 s de zoom + giro del cerebro (miles de
  líneas de alambre moviéndose) se comían ~2,5 MB del webm.
- GIF del README: montaje a cortes secos de ~12 s (mapa de secciones, mapa plegado + preview + peek de
  grupo, desplegable de la sticky, respuesta con citas), 760 px de ancho a 12 fps con paleta propia.
  Tope **≤ ~5 MB**; si crece, bajar `fps`/ancho en `encodeGif` o acortar los rangos.
- Revisar a ojo (`--samples <dir>` deja 8 PNG por tema). Los nombres de los ficheros los fija
  `Home.astro`/`README.md`: si cambian allí, cambiar `THEMES` en el script. Los antiguos pósters
  `docs/public/screenshots/app-main-midnightblue.png` / `app-main-articday.png` ya **no** los escribe
  (solo los usaba `Home.astro`).

### Clips del mosaico de la landing (`scripts/mosaic-capture.cjs`)

Clips cortos (4–8 s, sin audio, UI en inglés, solo datos demo) de **una** función cada uno, con
encuadre ajustado, para el mosaico alrededor del vídeo grande y para las redes del equipo de
marketing. Cada clip se graba con **NoteFlow Dark** y **NoteFlow Light** (salvo `themes`, una sola
variante). Manifiesto fijo (la web programa contra estos ids/proporciones: **no renombrar**):

| id | aspecto | tamaño web | qué enseña |
|---|---|---|---|
| `brain-orbit` | 1:1 | 720×720 | solo el cerebro (cuaderno completo + IA local), con zoom, girando solo (auto-rotate); sin panel de chat ni cabecera |
| `sections-tab` | 4:3 | 720×540 | nota de proyecto; `Ctrl+Tab` recorre Tasks → Meeting notes → Commands → Roadmap → Tasks con el mapa de secciones arriba |
| `temp-note` | 4:3 | 720×540 | `Ctrl+Shift+N` → nota temporal → título → bloque `bash` + pegar un comando; se ve "Deletes …" |
| `kanban` | 16:10 | 800×500 | tablero kanban en una nota; una tarjeta se arrastra a Done (queda marcada) |
| `slash-snippets` | 4:5 | 576×720 | `/` abre el menú; el cursor baja a SNIPPETS e inserta uno con la fecha de hoy |
| `sticky` | 4:5 | 576×720 | sticky flotante (compuesta sobre la ventana principal desenfocada); su desplegable de título cambia de sección |
| `section-preview` | 16:10 | 800×500 | sidebar: el mapa plegado de una nota se despliega y reposar en una celda abre la preview apaisada |
| `themes` | 1:1 | 720×720 | la misma nota por NoteFlow Dark → Tokyo Night → Dracula → GruvBox Dark → NoteFlow Light → Arctic Day, con fundidos |

```bash
node scripts/mosaic-capture.cjs --app <dir> [--only id,id] [--theme dark|light|all] [--out <dir>]
                                [--marketing <dir>] [--samples <dir>] [--frames <dir>]
```

- Salida web en `docs/public/mosaic/`: `<id>-dark.{webm,mp4,webp}` y `<id>-light.{webm,mp4,webp}`
  (`themes.{webm,mp4,webp}`); el webp es el póster (primer fotograma). Codificado al tamaño web:
  webm VP9 (`crf` ~36) + mp4 H.264 `faststart` `yuv420p`. `brain-orbit` (alambre girando, caro de
  comprimir) va a 2 pasadas con bitrate fijo y 24 fps. Presupuesto: **≤ ~600 KB por webm** y
  **≤ ~10 MB** el directorio.
- `--marketing <dir>`: además un mp4 de alta calidad por clip (`<id>-<dark|light>.mp4`,
  `themes.mp4`) al **doble del tamaño web** con el lado largo capado a 1440 px (H.264 `crf 17`). Se
  dejan fuera del repo (el repo `noteflow-growth` no se toca desde aquí).
- Captura a un DPR por clip (2–3) para que el recorte sea ≥ 2× el tamaño web → máster sin pérdida
  al doble del tamaño web → web/marketing. El cerebro se pinta a DPR ≤ 2 (`BrainScene` lo capa), así
  que su recorte es de 720 CSS px. Las ventanas respetan el mínimo de la principal (700×500); el
  codificador usa el viewport real.
- **Bucle sin saltos**: o la toma acaba como empieza (el cursor vuelve a su sitio; `sections-tab`
  da la vuelta completa), o los últimos 0,3–0,8 s se funden con los primeros (`loopCrossfade` de la
  kit: el vídeo empieza justo después del tramo fundido, así que no hay fotograma congelado).
- Detalles por clip: `brain-orbit` mide la caja del cerebro en una captura del canvas para elegir el
  zoom (~76 % del recorte) y centrar el recorte en él (el cerebro queda por encima del objetivo de la
  cámara: la ventana es alta para que el recorte suba sin tocar la cabecera). `temp-note` pega con un
  `ClipboardEvent` sintético (no toca el portapapeles del sistema) y fija el foco en el título de la
  nota nueva antes de escribir (redundante desde que la app ya deja el foco en el título de forma
  determinista —el cuerpo de una nota recién creada no se autoenfoca—, pero inocuo). `themes`
  cambia de tema por la vía de sincronización de apariencia de la app (escribe `ui-settings.json` y
  manda `notes-updated` a la ventana) y funde 0,3 s entre temas. `sticky` compone la sticky (máscara
  + sombra) sobre una captura fija de la ventana principal, desenfocada y oscurecida.
- Revisar a ojo con `--samples <dir>` (5 PNG por clip). Mismas reglas de seguridad que los otros dos.

### Artefactos

- **Windows:** `NoteFlow-X.Y.Z-Setup.exe` (NSIS) — añade `resources\cli` al PATH del usuario
  (`noteflow.cmd` + `noteflow.ps1`; ver "Puntos conocidos").
- **Linux (Debian/Ubuntu/Mint):** `noteflow_X.Y.Z_amd64.deb` — setuid del sandbox + symlink
  `noteflow` en `/usr/local/bin`.
- **Linux (universal, y la opción recomendada para Arch/CachyOS/Manjaro):** `NoteFlow-X.Y.Z.AppImage`
  (**sin** `-x86_64`) — funciona en cualquier distro y se actualiza en sitio desde la app.
- **Linux (Arch):** **no** se publica prebuilt (`linux.target = ["deb","appimage"]`, sin `pacman`).
  El `PKGBUILD` de la raíz está **roto/no soportado**: su `package()` no copia `node_modules` (la app
  instalada peta en `require('js-yaml')`), depende del `electron` del sistema (no de Electron 35) y no
  recompila los módulos nativos (`better-sqlite3`, `onnxruntime-node`, `sqlite-vec`) contra ese ABI.
  Arreglarlo exige probarlo en un Arch real; mientras tanto, Arch → AppImage (README lo dice así).
- **macOS (Apple Silicon):** `NoteFlow-X.Y.Z-arm64.dmg` — **sin firmar/notarizar** (firma ad-hoc).
  Gatekeeper avisa en el primer arranque; el usuario hace right-click → Open o
  `xattr -dr com.apple.quarantine /Applications/NoteFlow.app`. Solo arm64 (sin Intel). El CLI viaja en
  `NoteFlow.app/Contents/Resources/cli/noteflow.js` pero **NO se enlaza al PATH automáticamente** (el
  dmg no tiene hooks de instalación) — symlink manual documentado en el README. Icono: `public/icon.icns`
  (generado por `scripts/gen-icons.cjs` con sharp; regenerar si cambia `public/icon.png`).
- Salida: `release/`.

### Microsoft Store (MSIX/APPX)

Ficha **NoteFlow - Quick Notes** (Store ID `9NLP519T4X5F`, https://apps.microsoft.com/detail/9NLP519T4X5F).
No va en `release.yml`: se genera **a mano** desde el tag ya publicado y se sube en Partner Center
(Paquetes → nuevo envío). La Store lo firma: no hace falta certificado.

```bash
git checkout vX.Y.Z    # solo tags posteriores a este cambio: v2.1.0 y anteriores no tienen build.appx ni dist:store
npm run dist:store     # = npm run build + electron-builder --win appx --x64 --publish never
# → release/NoteFlow-X.Y.Z-Store.appx (no se instala en local: va sin firmar)
```

- **Identidad** (`build.appx` en `package.json`): `identityName`, `publisher` y `publisherDisplayName`
  salen de Partner Center → Identidad del producto. Si no casan exactamente, la Store rechaza el
  paquete. `displayName` = el nombre reservado (**NoteFlow - Quick Notes**; "NoteFlow" a secas estaba
  cogido).
- **Versión:** `X.Y.Z.0`. La Store exige que cada envío lleve una versión mayor que el anterior.
- **Logos:** `build/appx/` (escalas 100/200 + `targetsize` sin placa para la barra de tareas),
  generados con `node scripts/gen-appx-assets.cjs` desde `public/icon.png`. Regenerar si cambia el icono.
- **Qué cambia dentro del paquete** (`process.windowsStore`, `IS_STORE_BUILD` en `main.ts`):
  - **Updater apagado:** `app:check-update` → `{hasUpdate:false}`, `app:download-and-install` se
    niega; Ajustes → Acerca de dice que la Store la mantiene al día. Las actualizaciones llegan al
    subir el siguiente paquete.
  - **Abrir al iniciar sesión, no disponible:** la clave `Run` de HKCU queda en el registro virtual
    del paquete y Windows no la lee. `app:get-login-item` devuelve siempre `false` y
    `app:set-login-item` se niega sin tocar `settings.json`; Ajustes → Inicio lo explica. **Pendiente
    de implementar:** electron-builder 26 ya sabe declarar la extensión `windows.startupTask` en el
    manifiesto con `build.appx.addAutoLaunchExtension: true` (o sola si `electron-winstore-auto-launch`
    está en `dependencies`; ver `getExtensions` en `node_modules/app-builder-lib/out/targets/AppxTarget.js`;
    el `TaskId` sale fijo como `SlackStartup`). Lo que falta es activarla/desactivarla desde la app con
    la API WinRT `StartupTask` (p. ej. con el paquete `electron-winstore-auto-launch`) y detectar ese
    arranque de otra forma: la startupTask no pasa argumentos, así que `--noteflow-startup` no llega.
  - **Sin CLI** (`cliConnect.cliAvailable()` → false): en Windows el CLI solo llega con el instalador
    NSIS (`build/nsis-include.nsh` mete `resources\cli` en el `PATH` de usuario; `scripts/install-cli.sh`
    es solo Linux/macOS y el CLI no se publica en npm), y un MSIX no puede tocar el `PATH`. Así que **la
    versión Store no tiene CLI**. Consecuencias:
    - Ajustes → Sincronización sustituye "Conectar también el CLI" por una explicación, aunque
      `settings.json` traiga un `cliAccount` heredado de una instalación directa (`githubConnect`/
      `githubDisconnect` también se niegan con `cliMissing`).
    - `syncSkillToAgentDirs()` no hace nada (ni instala ni borra la skill en `~/.claude/skills`,
      `~/.agents/skills`, Windsurf: podría ser de una instalación directa) y `app:set-skill-sync` se
      niega sin tocar `settings.json`; Ajustes → General muestra una explicación en lugar del toggle.
    - Para usar el CLI hay que instalar NoteFlow desde GitHub.
- **Instalación directa + Store a la vez: desaconsejado.** Ambas usan `%APPDATA%\NoteFlow`. MSIX deja
  a la app de la Store **modificar** los ficheros que ya existían ahí (el `settings.json` se escribe
  in situ, así que si ya existía se comparte), pero manda los ficheros **nuevos** —incluido el
  temporal de cualquier escritura atómica temp+rename, cuyo resultado acaba entonces en la copia— a una
  copia privada del paquete (`%LOCALAPPDATA%\Packages\<familia>\LocalCache\Roaming\…`) que solo ve la
  app de la Store. El estado de ajustes/cachés de una y otra puede bifurcarse sin aviso. Recomendar
  tener solo una (desinstalar la otra). Las notas (`~/noteflow-notes`, fuera de `AppData`) no se
  virtualizan y las ven ambas.

### Convención de versiones
`vX.Y.Z` estable. Patch = bugfixes; Minor = features; Major = cambios de arquitectura.

## Config electron-builder (en `package.json`)

```json
"build": {
  "appId": "dev.noteflow.notes",
  "productName": "NoteFlow",
  "directories": { "output": "release" },
  "win":   { "target": "nsis", "icon": "public/icon.ico",
             "artifactName": "${productName}-${version}-Setup.${ext}" },
  "nsis":  { "include": "build/nsis-include.nsh" },
  "mac":   { "target": [{ "target": "dmg", "arch": "arm64" }], "icon": "public/icon.icns",
             "category": "public.app-category.productivity", "darkModeSupport": true,
             "hardenedRuntime": false, "artifactName": "${productName}-${version}-${arch}.${ext}" },
  "linux": {
    "target": ["deb", "appimage"], "category": "Utility", "icon": "public/icon.png",
    "desktop": { "entry": { "Name": "NoteFlow", "Comment": "Fast notes for software engineers",
                            "Keywords": "notes;markdown;text;", "Categories": "Utility;TextEditor;" } }
  },
  "deb": {
    "depends": ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils",
                "libatspi2.0-0", "libdrm2", "libgbm1", "libxkbcommon0"],
    "afterInstall": "build/linux-postinstall.sh",
    "afterRemove":  "build/linux-postremove.sh"
  },
  "pacman": {   // config presente pero INACTIVA: "pacman" no está en linux.target, no se compila
    "depends": ["gtk3", "libnotify", "nss", "libxss", "libxtst", "xdg-utils",
                "at-spi2-core", "libdrm", "libxkbcommon", "alsa-lib"],
    "packageName": "noteflow"
  },
  "extraResources": [
    { "from": "cli/noteflow.js",  "to": "cli/noteflow.js" },
    { "from": "cli/noteflow.cmd", "to": "cli/noteflow.cmd" },
    { "from": "cli/noteflow.ps1", "to": "cli/noteflow.ps1" },  // shim PowerShell: argv multilínea/Unicode + stdin y salida en UTF-8
    { "from": "cli/noteflow-cli", "to": "cli/noteflow-cli" }   // skill del CLI (SKILL.md)
  ],
  "asarUnpack": [
    "**/node_modules/better-sqlite3/**", "**/node_modules/bindings/**",
    "**/node_modules/file-uri-to-path/**", "**/node_modules/sqlite-vec/**",
    "**/node_modules/sqlite-vec-*/**", "**/node_modules/onnxruntime-node/**",
    "**/node_modules/sharp/**", "**/node_modules/@img/**"
  ],
  "files": ["dist/**/*", "dist-electron/**/*"]
}
```

> **Deps nativas de la IA:** los binarios (`better-sqlite3`, `onnxruntime-node`, `sqlite-vec`) no
> pueden ir dentro del `.asar`, de ahí `asarUnpack`. Y `package.json` lleva
> `"postinstall": "electron-builder install-app-deps"` para recompilarlos al ABI de Electron tras
> cada install. Ver el índice semántico en `.agents/context/ai.md`.

> **Nota (electron-builder 26+):** las props del `.desktop` de Linux van dentro de
> `desktop.entry`, NO directamente en `desktop`. Error conocido que rompió el release en v1.2.3.

## Web pública (GitHub Pages)

`docs/` es un **proyecto Astro independiente** que se despliega con el workflow **`pages.yml`**:
cualquier push a `main` que toque `docs/**` (o el propio `pages.yml`) construye el sitio y publica
`docs/dist` en GitHub Pages vía Actions (no se sirve la carpeta en crudo).
URL: https://yagoid.github.io/noteflow/.

Todo lo demás (arquitectura del sitio, páginas `/cli` `/ai` `/features`, inventario de
contenido ↔ fuente de verdad, gotchas de base path/hreflang/redirects, checklist de sincronización
al cambiar la app) está en **`.agents/context/web.md`** — abrirlo antes de tocar la web o al cerrar
una feature que la web documente.

## Tareas frecuentes

### Estado de un workflow / release
```bash
gh run list --limit 5
gh run view <run-id> --log-failed
gh release list
gh release view vX.Y.Z
```

### Re-crear un tag si falla el release
Si el workflow llegó a crear el draft, borrarlo antes (`gh release delete vX.Y.Z`) para no acabar con
un draft duplicado al relanzar.
```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Añadir un canal IPC nuevo (checklist)
1. `electron/main.ts` → `ipcMain.handle/on`.
2. `electron/preload.ts` → método en `api` + tipo.
3. `src/types/index.ts` → firma en `window.noteflow`.
4. `npm run build` (recompila `dist-electron/`) e incluirlo en el commit.

### Tras una feature importante
Actualizar el **`.agents/context/*.md`** que toque (arquitectura/IPC/release…) y la skill
**`noteflow-features`** (UX/atajos). Si toca el CLI, también `cli/noteflow-cli/SKILL.md`. Si es
visible, revisar `docs/` y el `README.md`.
