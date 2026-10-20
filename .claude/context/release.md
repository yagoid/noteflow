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
6. **Docs:** `.claude/context/` (y la skill `noteflow-features`) al día si procede; `docs/` y
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
   lo ve todavía.
9. **Verificar los assets del draft** (`gh release view vX.Y.Z --json assets --jq '.assets[].name'`).
   Deben estar exactamente: `NoteFlow-X.Y.Z-Setup.exe` (+ `.blockmap`, `latest.yml`),
   `NoteFlow-X.Y.Z-arm64.dmg` (+ `.blockmap`, `latest-mac.yml`), `noteflow_X.Y.Z_amd64.deb`,
   `NoteFlow-X.Y.Z.AppImage` (**sin** `-x86_64`) y `latest-linux.yml`. Son los nombres que espera
   `electron/updateAsset.ts`.
10. **Escribir las notas a mano** — `generate_release_notes: true` deja el body **vacío** en la
    práctica. Incluir lo que aplique de "Puntos conocidos para las notas de release" (abajo):
    ```bash
    gh release edit vX.Y.Z --notes-file notes.md
    ```
11. **Publicar** (a partir de aquí `/releases/latest` lo devuelve y los clientes lo ofrecen):
    ```bash
    gh release edit vX.Y.Z --draft=false
    ```
12. **Smoke-test del updater desde la versión anterior:** instalar la versión previa (o arrancar una
    build con versión local distinta: el updater compara `latest !== current`), y comprobar en al
    menos Windows y un Linux (AppImage y/o .deb) que aparece el aviso, descarga, instala y relanza.

> **Identidad git:** si la máquina no tiene config global,
> `git config user.email "<tu-email>"` y `git config user.name "<tu-usuario>"` antes del commit.

- Antes de hacer push a `main` revisar que la documentación en `.claude/context/` (y la skill `noteflow-features`) está actualizada con los nuevos cambios que se suben (solamente en caso apropiado de ser un cambio a la altura de ser añadido a la documentación).
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
- Efecto secundario esperado: si el push incluye cambios en `docs/**`, el workflow `pages.yml`
  redeploya la web de GitHub Pages. Eso **no** es una release de la app, solo el sitio; es
  inofensivo y no requiere acción.

### Qué hace el workflow (`.github/workflows/release.yml`)

Se dispara con tags `v*`. **No corre tests ni lint** (solo `npm ci` + `npm run dist`): eso se hace en
local antes de taggear. Dos jobs:

1. **build** (matrix `windows-latest` + `ubuntu-latest` + `macos-14`):
   - checkout → setup Node 20 → `npm ci`
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
> mano tras verificar assets y escribir notas (pasos 9–11).

> Los `.blockmap` / `latest*.yml` son metadatos de electron-builder (canal de updates); aunque
> el auto-update in-app actual descarga el instalador a mano, conviene seguir publicándolos.

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
> cada install. Ver el índice semántico en `.claude/context/ai.md`.

> **Nota (electron-builder 26+):** las props del `.desktop` de Linux van dentro de
> `desktop.entry`, NO directamente en `desktop`. Error conocido que rompió el release en v1.2.3.

## Web pública (GitHub Pages)

`docs/` es un **proyecto Astro independiente** que se despliega con el workflow **`pages.yml`**:
cualquier push a `main` que toque `docs/**` construye el sitio y publica `docs/dist` en GitHub
Pages vía Actions (no se sirve la carpeta en crudo). URL: https://yagoid.github.io/noteflow/.

Todo lo demás (arquitectura del sitio, páginas `/cli` `/ai` `/features`, inventario de
contenido ↔ fuente de verdad, gotchas de base path/hreflang/redirects, checklist de sincronización
al cambiar la app) está en **`.claude/context/web.md`** — abrirlo antes de tocar la web o al cerrar
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
Actualizar **esta skill** (arquitectura/IPC/release) y **`noteflow-features`** (UX/atajos). Si
toca el CLI, también `cli/noteflow-cli/SKILL.md`. Si es visible, revisar `docs/` y el `README.md`.
