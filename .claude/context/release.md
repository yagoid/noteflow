# NoteFlow — Release, build y CI/CD

## Proceso de release

### Preparación obligatoria antes del release

1. **Compilar `dist-electron/`** si se tocó `electron/` — ese directorio está **commiteado**:
   ```bash
   npm run build
   ```
   Incluir `dist-electron/main.js` y `dist-electron/preload.js` en el commit.

2. **Actualizar versión** (el workflow también la sincroniza desde el tag, pero hacerlo antes
   evita que `package.json` quede desfasado en el repo):
   ```bash
   npm pkg set version=X.Y.Z
   ```

3. **Migraciones de Supabase antes que el cliente:** si la versión usa una migración nueva de
   `supabase/migrations/`, aplicarla al proyecto real (`supabase db push`) **antes** de publicar
   el release. Caso concreto: la app/CLI que pide `files.seq` (cursor del pull de Cloud) necesita
   la **0008** — contra un servidor sin ella el pull de Cloud responde 400 (error visible, sin
   pérdida de datos). Ver `supabase/README.md` § 7.

4. **Verificar identidad git** si la máquina no tiene config global:
   ```bash
   git config user.email "<tu-email>"
   git config user.name "<tu-usuario>"
   ```

### Flujo de release completo (con tag)

```bash
npm run build                     # 1. compilar si hay cambios en electron/
npm pkg set version=X.Y.Z         # 2. versión
git add src/ electron/ dist-electron/ package.json   # 3. commit
git commit -m "feat/fix: descripción"
git push origin main
git tag vX.Y.Z                    # 4. tag → dispara el workflow de release
git push origin vX.Y.Z
```
- Antes de hacer push a `main` revisar que la documentación en `.claude/context/` (y la skill `noteflow-features`) está actualizada con los nuevos cambios que se suben (solamente en caso apropiado de ser un cambio a la altura de ser añadido a la documentación).
- Los mensajes de commits deben estar escritos en inglés.

> Al hacer push a `main` puede aparecer `Bypassed rule violations for refs/heads/main: Changes
> must be made through a pull request`. Es una protección de rama bypasseable por el propietario;
> el push se completa igualmente.

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

Se dispara con tags `v*`. Dos jobs:

1. **build** (matrix `windows-latest` + `ubuntu-latest` + `macos-14`):
   - checkout → setup Node 20 → `npm ci`
   - deriva y valida la versión del tag (`vX.Y.Z` → `APP_VERSION`)
   - sincroniza `package.json` (`npm pkg set version=...`) y verifica que coincida
   - `npm run dist` (electron-builder) con `env CSC_IDENTITY_AUTO_DISCOVERY=false` (en macOS fuerza
     firma **ad-hoc** sin Developer ID — necesario para arrancar en Apple Silicon; inofensivo en win/linux)
   - sube artefactos por plataforma (`release-win`, `release-linux`, `release-mac`)
2. **release** (ubuntu, tras build): descarga los tres artefactos y crea el GitHub Release con
   `generate_release_notes: true`, publicando:
   - Windows: `*.exe`, `*.exe.blockmap`, `latest.yml`
   - Linux: `*.deb`, `*.AppImage`, `latest-linux.yml`
   - macOS: `*.dmg`, `*.dmg.blockmap`, `latest-mac.yml`
   - `prerelease: contains(github.ref_name, '-')` → un tag con sufijo (p. ej. `vX.Y.Z-mac.1`) sale como
     **prerelease** y el updater in-app (`/releases/latest`) lo ignora — útil para probar macOS sin
     empujarlo a los usuarios actuales.

> Los `.blockmap` / `latest*.yml` son metadatos de electron-builder (canal de updates); aunque
> el auto-update in-app actual descarga el instalador a mano, conviene seguir publicándolos.

### Artefactos

- **Windows:** `NoteFlow-X.Y.Z-Setup.exe` (NSIS) — añade `resources\cli` al PATH del usuario.
- **Linux (Debian/Ubuntu/Mint):** `noteflow_X.Y.Z_amd64.deb` — setuid del sandbox + symlink
  `noteflow` en `/usr/local/bin`.
- **Linux (Arch/CachyOS/Manjaro):** **no** se publica prebuilt (`linux.target = ["deb","appimage"]`,
  sin `pacman`). Los usuarios de Arch compilan desde el `PKGBUILD` de la raíz (`makepkg -si`, usa
  `electron` del sistema; recordar bumpear su `pkgver` en cada release) o usan el AppImage.
- **Linux (universal):** `NoteFlow-X.Y.Z.AppImage` — funciona en cualquier distro.
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
    "**/node_modules/sqlite-vec-*/**", "**/node_modules/onnxruntime-node/**"
  ],
  "files": ["dist/**/*", "dist-electron/**/*"]
}
```

> **Deps nativas de la IA:** los binarios (`better-sqlite3`, `onnxruntime-node`, `sqlite-vec`) no
> pueden ir dentro del `.asar`, de ahí `asarUnpack`. Y `package.json` lleva
> `"postinstall": "electron-builder install-app-deps"` para recompilarlos al ABI de Electron tras
> cada install. Ver "Índice semántico local" arriba.

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
