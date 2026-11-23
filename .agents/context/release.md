# NoteFlow — Release, build y CI/CD

## Proceso de release

### Checklist completo (en orden)

Un release es **todo o nada**: el updater in-app de las versiones ya instaladas lee
`/releases/latest` y construye la URL del asset por **nombre de fichero**, así que un nombre mal o un
release publicado antes de tiempo rompe la actualización de todos los usuarios de esa plataforma.

0. **Preflight** (comandos en "Comprobaciones previas", abajo): árbol limpio y `main` igual que
   `origin/main`; ningún draft viejo en `gh release list`; saber **qué cambió en `.github/` desde el
   último tag** (lo que cambió corre por primera vez en este release: tratarlo como no probado hasta
   ver el draft); tour, CLI y skill coherentes con la versión.
1. **Servidor (Supabase) antes que el cliente:** todo lo que la versión nueva llama tiene que estar
   desplegado **antes** de publicar. Son tres cosas, y las tres se comprueban contra el proyecto real
   (no fiarse de la memoria ni de la doc):
   - **Migraciones:** `supabase migration list` — cada fila con `local` y `remote`. Si falta alguna,
     `supabase db push`. Caso concreto: la app/CLI que pide `files.seq` (cursor del pull de Cloud)
     necesita la **0008** — contra un servidor sin ella el pull de Cloud responde 400 (error visible,
     sin pérdida de datos). Ver `supabase/README.md` § 7.
   - **Edge Functions:** `supabase functions list` frente a las carpetas de `supabase/functions/`. Una
     función que existe en el repo y no en la lista es un botón de la app que fallará (en v2.3.0 pasó
     con `billing-change-plan`: llevaba nueve días marcada "deploy pendiente del operador"). Mirar
     también que la fecha de despliegue de cada una no sea anterior a su último commit
     (`git log -1 -- supabase/functions/<nombre>`).
   - **Secretos:** `supabase secrets list` (solo nombres) frente a los `Deno.env.get(...)` de las
     funciones nuevas.
   - Buscar además `pendiente del operador` en `.agents/context/` y `supabase/README.md`.

   Desplegar funciones o tocar secretos de cobro es decisión del propietario: avisar y esperar su OK.
   Lo que se despliegue sin probar de punta a punta **no se anuncia** en las notas y se deja escrito
   como "sin probar" en `monetization.md`.
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
   + sus clips `src/assets/whats-new/<id>.<lang>.webm`; los usuarios que actualicen verán solo esas.
   Lo que no tenga diapositiva propia va en la **diapositiva de versión** `release-X-Y-Z`
   (`release: true`, chips con qué hace y dónde está, comprobado en el código), detrás de las de esa
   versión; añade su id a `WHATS_NEW_SEEN` de `scripts/whats-new-capture.cjs` (ver `patterns.md` →
   "Tour What's new").
5. **Compilar y verificar:**
   ```bash
   npm run build      # type-check + recompila dist-electron/
   npm test           # batería Vitest (la CI NO la corre)
   npm run lint       # la CI tampoco; no añadir errores nuevos
   ```
   `npm run lint` **sale con error siempre** (hay errores heredados: 24 en v2.3.0, 28 en v2.2.0), así
   que su exit code no dice nada: comparar por fichero y regla contra el tag anterior (receta en
   "Comprobaciones previas"). Tras el build, `git status` no debe mostrar cambios en `dist-electron/`
   más allá del bump: si los hay, lo commiteado estaba desfasado.
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
7. **Commit local + tag, y empujar SOLO el tag** (el tag es lo único que dispara `release.yml`, y
   lleva consigo el commit):
   ```bash
   git add package.json package-lock.json README.md PKGBUILD   # + lo que toque; no `-A` a ciegas
   git commit -m "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   `main` se empuja **al publicar** (paso 12), no antes: el README de `main` ya nombra
   `NoteFlow-X.Y.Z.AppImage`, y `releases/latest/download/<nombre>` da 404 hasta que la versión está
   publicada. Si entre el tag y la publicación pasan horas (un bloqueante, una prueba pendiente), el
   README público sigue siendo válido. Si la CI obliga a cambiar algo, se corrige, se recrea el tag
   ("Re-crear un tag", abajo) y `main` nunca vio el intento fallido.
8. **Lanzar ya el E2E del updater y esperar a la CI.** Los dos workflows son independientes (el E2E
   construye su candidata desde el checkout del tag, no usa los assets del draft), así que se lanzan
   en paralelo nada más empujar el tag:
   ```bash
   gh workflow run update-e2e.yml --ref vX.Y.Z -f version=X.Y.Z
   gh run list --limit 5
   gh run watch <id-de-Build-and-Release> --exit-status --interval 30
   ```
   El job `release` crea el release como **draft** (`draft: true`): invisible para
   `/releases/latest`, así que ningún cliente lo ve todavía. Tiempos de referencia (v2.3.0): builds
   ~5 min cada uno, pero el runner de **macOS arm64 puede pasar ~10 min en cola** — un run de 15–20 min
   no es un cuelgue (mirar los pasos del job antes de preocuparse). E2E: ~8 min.
   Al terminar, revisar:
   - **Avisos** (`gh run view <id>` → ANNOTATIONS): ahí GitHub anuncia con antelación la retirada de
     runners y acciones (así se habría visto venir la de `macos-14`).
   - **Imágenes de runner** frente a las del release anterior (receta abajo). `ubuntu-latest`,
     `windows-latest` cambian solos: si la imagen de Linux es nueva, comprobar en el log que los
     módulos nativos siguen bajándose precompilados (`@electron/rebuild … buildFromSource=false` y
     `better-sqlite3` preparado en menos de un segundo). Compilados en el runner dependerían de su
     glibc y podrían no arrancar en distros más viejas — y el E2E no lo vería, porque corre en la
     misma imagen.
9. **Verificar los assets del draft** (`gh release view vX.Y.Z --json isDraft,assets`).
   Deben estar exactamente: `NoteFlow-X.Y.Z-Setup.exe` (+ `.blockmap`, `latest.yml`),
   `NoteFlow-X.Y.Z-arm64.dmg` (+ `.blockmap`, `latest-mac.yml`), `noteflow_X.Y.Z_amd64.deb`,
   `NoteFlow-X.Y.Z.AppImage` (**sin** `-x86_64`) y `latest-linux.yml` — nueve, ni uno más. Son los
   nombres que espera `electron/updateAsset.ts`. Y `isDraft: true`.
10. **Resultado del E2E del updater** (lanzado en el paso 8; ver "Test E2E del updater" abajo; también
    se puede correr `scripts/update-e2e.cjs` en local). Verde no basta: bajar los artefactos
    (`gh run download <id> -D <dir>`) y leer los seis `result.json` — `outcome: pass` (o KNOWN BROKEN
    esperado) en Windows, AppImage y .deb, escenario A (release publicada anterior → candidata, con
    `oldVersion` = la publicada) y B (candidata → siguiente). No hace falta publicar nada: el feed de
    la release es falso.
11. **Escribir las notas a mano** — `generate_release_notes: true` deja el body **vacío** en la
    práctica. Método que funcionó: misma estructura que las anteriores
    (`gh release view v<anterior> --json body --jq .body`); contenido sacado del copy del tour
    (`src/i18n/en/whatsNew.ts`: diapositivas con `since` = X.Y.Z y los chips de `release-X-Y-Z`) y de
    los `feat` del periodo (`git log --format=%s v<anterior>..vX.Y.Z`); rango de versiones del CLI
    (`CLI_VERSION` del tag anterior → el actual); tabla de descargas y enlace de comparación con los
    números nuevos. Incluir lo que aplique de "Puntos conocidos para las notas de release" (abajo).
    **No anunciar nada que no se haya probado.** Subirlas al draft y **que el propietario las lea
    antes de publicar**:
    ```bash
    gh release edit vX.Y.Z --notes-file notes.md
    ```
12. **Publicar, solo con el OK explícito del propietario** (a partir de aquí `/releases/latest` lo
    devuelve y los clientes lo ofrecen; no hay vuelta atrás limpia):
    ```bash
    git push origin main
    gh release edit vX.Y.Z --draft=false
    ```
    Y comprobar el GitHub real, que es justo lo que el E2E no cubre: `/releases/latest` devuelve
    `vX.Y.Z` y cada nombre de asset responde por `releases/latest/download/<nombre>` (receta abajo).
13. **Prueba manual tras publicar, en una instalación real de la versión anterior:** el aviso de
    update aparece en la titlebar, descarga, instala **y la app se vuelve a abrir sola con la versión
    nueva**. No darla por hecha porque el E2E pasara: en v2.3.0 el E2E dio `pass` al relanzamiento en
    las tres plataformas y, en la instalación real del propietario (2.2.0 → 2.3.0), la app se cerró,
    se instaló y **no se reabrió**. Hasta que se entienda esa diferencia, el relanzamiento solo lo
    prueba esta comprobación a mano.
14. **Lo que queda fuera de la CI:** el `.dmg` solo se sabe que compila (nadie lo arranca; macOS está
    fuera del E2E) y el paquete de Microsoft Store se genera y sube a mano desde el tag ("Microsoft
    Store", abajo). Decirlo al cerrar.

### Comprobaciones previas y recetas (probadas en v2.3.0)

La terminal del propietario es **PowerShell 5 en Windows**. Tres tropiezos que hacen perder tiempo:
`2>&1` sobre un ejecutable nativo pinta un `NativeCommandError` rojo aunque el comando haya ido bien
(mirar la salida, no el color); `--jq` de `gh` con interpolación `"\(.a) \(.b)"` no sobrevive al
entrecomillado (construir un objeto `{a,b}` en su lugar); y `Set-Content -Encoding utf8NoBOM` no
existe (editar los ficheros con la herramienta de edición, no con `Set-Content`).

```powershell
# Preflight
git fetch origin --tags; git status -sb          # limpio y sin "ahead/behind"
gh release list --limit 5                        # ningún draft colgado
git log --oneline v<anterior>..HEAD -- .github   # qué de la CI corre por primera vez
gh run list --limit 10                           # últimos runs en verde

# Servidor
supabase migration list
supabase functions list                          # frente a: ls supabase/functions
supabase secrets list                            # solo nombres

# Tour, CLI y skill
#   whatsNewSlides.ts: diapositivas con since 'X.Y.Z' + release-X-Y-Z
#   src/assets/whats-new/: <id>.en.webm y <id>.es.webm (+ .png) por cada id
#   scripts/whats-new-capture.cjs: WHATS_NEW_SEEN incluye 'release-X-Y-Z'
#   cli/noteflow.js (cabecera `// v` y CLI_VERSION) = `version:` de cli/noteflow-cli/SKILL.md

# Lint contra el tag anterior (worktree temporal que reutiliza node_modules con un junction)
$wt = "$env:TEMP\opencode\nf-prev"
git worktree add --detach $wt v<anterior>
cmd /c mklink /J "$wt\node_modules" "$PWD\node_modules"
npx eslint . -f json -o "$env:TEMP\opencode\lint-head.json"
Push-Location $wt; npx eslint . -f json -o "$env:TEMP\opencode\lint-prev.json"; Pop-Location
#   …comparar los pares fichero|regla con severity 2: los de HEAD deben ser un subconjunto…
cmd /c rmdir "$wt\node_modules"                  # ANTES de borrar el worktree: quita solo el junction
git worktree remove --force $wt

# Imágenes de runner de un run (comparar con el run del release anterior)
gh run view <id> --log | Select-String "Image: "

# Tras publicar
gh api repos/yagoid/noteflow/releases/latest --jq .tag_name
curl.exe -s -L -o NUL -r 0-0 -w "%{http_code}" https://github.com/yagoid/noteflow/releases/latest/download/<nombre>   # 206
```

### Criterios de trabajo (para quien lleve el release, persona o agente)

- **Comprobar, no suponer.** Cada casilla del checklist se cierra con un comando y su salida, no con
  "debería estar". Lo que no se pudo comprobar se dice tal cual al propietario (en v2.3.0: el `.dmg`,
  el cambio de plan real de `billing-change-plan`, la auditoría de docs de 227 commits).
- **Todo es reversible hasta `--draft=false`.** Bump, commit, tag y draft se pueden rehacer; publicar
  no. Por eso el único punto que exige un "sí" explícito del propietario es el paso 12 (y cualquier
  despliegue de servidor del paso 1).
- **Un bloqueante de servidor no frena la CI.** Se puede taggear y verificar el draft mientras el
  propietario decide; lo que frena es publicar.
- **Los datos del propietario mandan sobre la doc.** Si dice "el borrador que hay en GitHub" y no hay
  ninguno, se comprueba (`gh release list`) y se le cuenta la diferencia, no se asume.

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
> (`gh run view <id>`). `release.yml` corrió por primera vez así en **v2.3.0** (2026-11-23): los tres
> builds y el job `release` en verde, sin avisos de deprecación.

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
GitHub real (`/releases/latest`, redirects de descarga): eso queda para los pasos 12–13. Y su `pass`
en el relanzamiento **no garantizó** el de una instalación real en v2.3.0 (equipo del propietario, 2.2.0 → 2.3.0: instaló pero no reabrió;
causa sin investigar, apuntado en la nota `NoteFlow Desktop` → Errors). Los fallbacks
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
`snippets`, `agent-tasks`, `linked-files`, `drawings`, `more`; idiomas `en`/`es`). `checked-tasks` ya **no**
existe (su novedad es un chip de `release-2-3-0`; ni toma ni clip). `floating-sidebar` ya **no** es diapositiva
del tour: su toma sigue en el script (`webOnly`) solo para la web (`docs/public/clips`), no se graba
por defecto y hay que pedirla con `--only floating-sidebar --out <dir fuera de src/assets>` (lo que
haya en `src/assets/whats-new/` se empaqueta en la app).
Regenerarlos cuando cambie de forma visible la UI que aparece en ellos:

```bash
# --app = carpeta con dist/ + dist-electron/ compilados (mejor un worktree limpio de HEAD con
# `npm run build`, para no grabar un árbol a medias). Por defecto: la raíz del repo.
node scripts/whats-new-capture.cjs --app <dir> [--only brain,ai] [--lang en|es|all] [--out <dir>] [--frames <dir>]
```

- Requiere `playwright` (devDependency) y `ffmpeg` en el PATH. Abre ventanas reales en pantalla
  (~30 s por clip): no usar ratón/teclado sobre ellas mientras graba.
- En Windows la kit apunta `USERPROFILE` a una carpeta `alex` del dir temporal: el pie del sidebar
  (nombre de la carpeta home) sale como "alex" y nunca con el usuario real del sistema.
- Perfil (`--user-data-dir`) y dir de notas (`NOTEFLOW_NOTES_DIR`) **siempre temporales**, con
  `NOTEFLOW_DISABLE_WHATS_NEW=1` y `whatsNewSeen` sembrado para que el tour no tape la toma. Las notas
  demo se siembran **escribiendo carpetas v2 directamente — nunca con el CLI**: `NOTEFLOW_NOTES_DIR`
  no aísla la sesión de NoteFlow Cloud del CLI y empujaría a la cuenta real. La IA habla con un mock
  OpenAI-compatible local (127.0.0.1, key falsa); no se conecta GitHub ni Cloud.
- Captura por CDP `Page.startScreencast` a DPR 1.5 (no `recordVideo`, que sale borroso) → 960×600
  VP9; el cursor falso y las pastillas de teclas se inyectan solo en la página durante la toma.
  Revisar los clips a ojo (`--frames <dir>` guarda los frames y 4 PNG de muestra por clip).
- Tomas que cambiaron en noviembre de 2026: `sections` empieza en una nota recién creada (solo su
  sección "Note") y crea dos secciones con el **+** de la barra de pestañas; `brain` usa el cuaderno
  **completo**, gira un poco el cerebro, configura un proveedor **en pantalla** (Tu clave API → OpenAI +
  clave falsa) y pregunta — el `fetch` global de main se parchea para mandar `api.openai.com/v1` al
  mock local (`routeOpenAiToMock`) y, como no hay índice de IA local, `fakeChatSources` reenvía un
  `ai:chat-sources` con cuatro notas al llegar el primer delta para que se iluminen en el cerebro
  (opción de clip `llm: 'byo'`: arranca el mock sin configurarlo); `quick-capture` pulsa el botón del
  temporizador del sidebar (anclado) en vez del atajo; `section-map` cambia el estilo a "En fila"
  desde el menú ⋯ del pie del sidebar; `sync` recorre la UI nueva de Ajustes → Sincronización (las dos
  tarjetas → detalle de NoteFlow Cloud → volver → GitHub Sync); `linked-files` (nueva, v2.3.0) vincula un
  `README.md` de una carpeta temporal `projects/acme-api` desde el menú contextual del `+` grande (el
  selector nativo se sustituye en main por uno que devuelve ese archivo), lo edita (la toma espera a ver
  el cambio en el archivo) y luego lo modifica desde fuera para que la nota se recargue en vivo;
  `drawings` (nueva, v2.3.0) escribe `/draw` al final del Roadmap, dibuja en el lienzo dos cajas con su
  texto («Idea» → «Launch»/«Lanzamiento») unidas por una flecha, pulsa Hecho (el póster es la tarjeta en
  la nota) y abre la pestaña «Architecture», sembrada con un Mermaid que se pinta como dibujo (se ve un
  instante su texto mientras carga el chunk: es el comportamiento real); `agent-tasks` (nueva, v2.3.0),
  abajo en "Composiciones".
  `crf` por clip (`brain` usa 43 para caber en presupuesto).
- **Paneles invisibles:** con el sidebar flotante cerrado, los segmentos de la línea de secciones de
  cada nota (`.nsm-line .nsm-seg`, `pointer-events: auto`) siguen recibiendo el puntero aunque el panel
  tenga `pointer-events: none`: pasar el cursor por donde estaría uno abre el panel en mitad de la toma.
  `agent-tasks` y `drawings` inyectan un estilo de captura que los apaga mientras el panel está cerrado
  (`keepClosedSidebarInert`); es un bug de la app, no de la toma — quitarlo cuando se arregle.
- Presupuesto: ≤ ~700 KB por clip y ≤ ~8 MB el directorio (hoy ~11 MB con los pósters — el `brain` del cuaderno completo pesa más —, 15 clips × 2
  idiomas: **ya por encima del tope**; antes de añadir otro clip, recortar duración/`crf` o los pósters).
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
- `agent-tasks` (`encodeAgentTasks`) reutiliza ese terminal (`openFakeTerminal`; su log hace scroll solo
  cuando se llena) sobre la app, que se queda quieta en el escritorio toda la toma: (1) en la nota demo
  «Website launch»/«Lanzamiento web» (sembrada con `agentTasks.enabled` y **Run with = comando
  personalizado `agent {prompt}`**, para que nada en pantalla nombre un producto real; el CLI lo llama
  `agent`) el cursor encola dos tareas con el robot y pulsa **Run**; (2) el terminal entra sobre la parte
  inferior derecha (bajo la lista de tareas, que sigue a la vista) y el agente trabaja: `noteflow run` lo
  lanza, `task start` (reimprime el briefing), `task report`, `task finish --file`, `task start` de la
  siguiente y otro `report`; (3) la nota lo sigue en vivo (casilla en curso → tick con chispa → la
  siguiente en curso), el terminal sale y un clic en la casilla hecha abre el informe (póster). Tres
  **rótulos numerados** en el idioma del clip (`injectStepCaptions`: píldora mono abajo a la izquierda con
  los colores del tema; se retira al abrir el informe). **Run se intercepta en main**
  (`interceptAgentRun`: se sustituyen los handlers `agent-run:info` / `get-folder` / `preflight` /
  `terminal` — ni terminal real, ni diálogo de aprobación, ni CLI) y **cada escritura del agente se
  simula** con `simulateCliTaskWrite`, que repite el `applyAgentWrite` del CLI con sus propias funciones
  (`withAgentMarker`, `withAgentTaskChecked`, `reconcileAgentBlocks`, `serializeAgentDoc`,
  `serializeNoteMd`): la línea de la tarea, `agent.md` y `note.md`; la toma espera a que la app pinte cada
  estado. El bloque lleva una máquina (`alex-laptop`) y rutas de demo, nunca las del equipo, y el inicio
  de la primera tarea se fecha 6 min antes (el clip comprime en segundos el trabajo del agente).
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
             "hardenedRuntime": false, "artifactName": "${productName}-${version}-${arch}.${ext}",
             "fileAssociations": [  // "Abrir con NoteFlow": Editor + Alternate (ver "Asociaciones de archivo")
               { "ext": ["md", "markdown"], "name": "Markdown document", "role": "Editor", "rank": "Alternate" },
               { "ext": "txt", "name": "Plain text document", "role": "Editor", "rank": "Alternate" }] },
  "appx":  { /* identidad de la Store, ver § Microsoft Store */ "customExtensionsPath": "build/appx-extensions.xml" },
  "linux": {
    "target": ["deb", "appimage"], "category": "Utility", "icon": "public/icon.png",
    "mimeTypes": ["text/markdown", "text/x-markdown", "text/plain"],  // MimeType= del .desktop
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

### Asociaciones de archivo ("Abrir con NoteFlow")

NoteFlow se registra para abrir **`.md`, `.markdown` y `.txt`** y **nunca se pone como predeterminada por sí
sola**: solo aparece en "Abrir con…" y en la lista de apps predeterminadas; el usuario decide. Lo que recibe la
app (argv / `second-instance` / `open-file`) y las notas temporales: `patterns.md` § "Notas vinculadas" →
"Abrir desde el sistema / notas temporales". Qué hace cada target (comprobado en
`node_modules/app-builder-lib` 26.8.1):

- **NSIS (Windows): a mano en `build/nsis-include.nsh`, NO con `build.fileAssociations`.** El macro de
  electron-builder (`APP_ASSOCIATE` en `templates/nsis/include/FileAssociation.nsh`) escribe el valor por
  defecto de `Software\Classes\.<ext>` → NoteFlow pasaría a ser la app por defecto de `.txt`/`.md` donde el
  usuario nunca eligió una (sin `UserChoice`), y su desinstalación (`APP_UNASSOCIATE`) deja ese valor apuntando
  a un ProgID borrado. Además `build.fileAssociations` (y `win.fileAssociations`) llegan a la vez a NSIS y a
  appx (mismo packager de Windows), así que no se puede usar solo para uno. `noteflowRegisterFileTypes`
  (en `customInstall`, con `SHELL_CONTEXT` = HKCU en la instalación por usuario) escribe: ProgIDs
  `Software\Classes\NoteFlow.md` / `NoteFlow.txt` (descripción, `DefaultIcon` = `NoteFlow.exe,0`,
  `shell\open\command` = `"…\NoteFlow.exe" "%1"`); `Software\Classes\.md|.markdown|.txt\OpenWithProgids`
  (valor `REG_NONE` → "Abrir con"); `Software\Classes\Applications\NoteFlow.exe` (`FriendlyAppName`,
  `SupportedTypes`, `shell\open\command` → "Elegir otra aplicación"); `Software\NoteFlow\Capabilities`
  (`FileAssociations`) + `Software\RegisteredApplications\NoteFlow` → Configuración → Aplicaciones
  predeterminadas; y `SHChangeNotify(SHCNE_ASSOCCHANGED)`. **Nunca** escribe el valor por defecto de `.<ext>`.
  `noteflowUnregisterFileTypes` (en `customUnInstall`, **salvo en una actualización** —`${isUpdated}`—, para que
  un `UserChoice` hacia `NoteFlow.md` no se quede un instante sin ProgID) borra exactamente eso y nada de otras
  apps (las claves `.<ext>\OpenWithProgids` vacías se quedan, como hace VS Code). Sin iconos nuevos.
- **appx (Microsoft Store): `appx.customExtensionsPath` → `build/appx-extensions.xml`**, un
  `uap:FileTypeAssociation` (`noteflow-text`) con `.md/.markdown/.txt` dentro de `<Application><Extensions>`.
  Un paquete MSIX nunca puede hacerse predeterminado; el archivo llega como argumento de línea de comandos.
- **macOS: `mac.fileAssociations`** → `CFBundleDocumentTypes` del Info.plist: "Markdown document"
  (`md`, `markdown`) y "Plain text document" (`txt`), `CFBundleTypeRole` **Editor** y `LSHandlerRank`
  **Alternate** (el `Default` de electron-builder podría reclamar el tipo). Icono = el de la app (no hay
  `build/md.icns`). Los archivos llegan por `open-file`.
- **Linux (deb; también el `.desktop` de la AppImage): `linux.mimeTypes`** = `text/markdown`,
  `text/x-markdown`, `text/plain` → `MimeType=` del `.desktop` (`Exec=… %U`: puede pasar `file://` URIs, que
  `openWithArgs.ts` convierte). No `fileAssociations` con `mimeType`: además generaría un XML de shared-mime-info
  que (re)definiría esos tipos estándar. `build/linux-postinstall.sh` / `linux-postremove.sh` (sustituyen al
  after-install de electron-builder) ejecutan `update-desktop-database` si existe. **Matiz:** en Linux no hay
  "solo en Abrir con" garantizado — si la distro / el escritorio no fija un predeterminado para `text/plain` o
  `text/markdown` (`mimeapps.list` / `defaults.list`), GIO (GNOME) o KDE pueden elegir cualquier `.desktop` que
  declare el tipo, NoteFlow incluido. En las distros habituales (gedit/GNOME Text Editor, Kate…) ya hay uno.
- **AppImage:** el mismo `.desktop` (si una herramienta de integración lo instala). Un archivo abierto justo
  mientras la app se cierra se pierde: su relanzamiento (`relaunchAppImageAfterExit`) no lleva argumentos.

**Verificado** (2026-11-15): el instalador NSIS se genera con estas macros (makensis compila) — lo que
escribe en el registro se inspeccionó en el script del instalador, **sin instalarlo**; el paquete appx se
genera con el `uap:FileTypeAssociation` en su `AppxManifest.xml` (makeappx lo valida); y el flujo completo
(argv del primer arranque, `second-instance` con ruta absoluta y relativa, descarte, "Mantener", reinicio,
conflicto) con Playwright sobre la app compilada. **Sin verificar:** instalarlo de verdad y usar "Abrir con" del
Explorador / Configuración → Aplicaciones predeterminadas; instalar el appx y abrir un archivo con él; macOS (`open-file`, Info.plist) y deb (`MimeType`, `update-desktop-database`). Probar en el siguiente
release de cada plataforma.

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
