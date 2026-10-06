# NoteFlow

App de escritorio de notas rápidas (Electron 35 + React 19 + TypeScript) para Windows/Linux/macOS.
Repo: https://github.com/yagoid/noteflow · rama `main`.

La **documentación del proyecto** vive en `.claude/context/*.md` (abajo el mapa). Este CLAUDE.md es el
**índice siempre cargado**: contiene el mapa + reglas + stack + comandos. El **detalle** está en
`.claude/context/` y se lee **a demanda** — no copiar ese detalle aquí (mantener este fichero como
índice, no como documentación).

## Reglas siempre-on

- **Textos de UI = i18n en `src/i18n/`** (EN/ES, configurable en Ajustes → General). El **inglés es la
  fuente de verdad** (`src/i18n/en/`, define el tipo `Messages`); el español (`src/i18n/es/`) es un espejo
  que TypeScript obliga a mantener completo. Al añadir/editar cualquier label, botón, placeholder, tooltip,
  aria-label o mensaje de UI: añade la clave en `en/` y su traducción en `es/`, y consúmela con `useT()`
  (o `tf()`/`plural()` para variables). El proceso main tiene su propio espejo en `electron/i18n.ts`. El
  contenido del usuario y las respuestas del LLM van en el idioma del usuario; la documentación va en español.
- **Tras tocar `electron/`:** ejecutar `npm run build` y **commitear `dist-electron/`** (está versionado).
- **Datos:** notas y ajustes sincronizables viven en el dir de notas; los ajustes locales en
  `settings.json` del `userData` (ver `.claude/context/architecture.md`).
- Al cerrar una feature importante, **actualizar la documentación** (el `.claude/context/*.md` que
  toque y la skill `noteflow-features` si es UX) y, si es visible, `docs/` y `README.md`.
- Los **mensajes de commit van en inglés**.

## Mapa del proyecto (abre el fichero del tema que toques)

| Tema | Fichero | Cuándo abrirlo |
|---|---|---|
| Estructura de dirs · Arquitectura IPC (handlers/eventos) · modelo de almacenamiento (`settings.json`, dir de notas) | `.claude/context/architecture.md` | Tocar/añadir IPC, ubicar un archivo o dato |
| Formato v2 (carpeta por nota) · migración v1→v2 · cifrado | `.claude/context/note-format.md` | Tocar el formato de nota (3 espejos), migración o cifrado |
| GitHub Sync (push/pull, cola de mutaciones, invariantes) | `.claude/context/sync.md` | Tocar la sincronización con GitHub |
| "El Cerebro": índice semántico · vista cerebro · LLM/chat agéntico · segundo cerebro · secciones ocultas a la IA | `.claude/context/ai.md` | Tocar embeddings, grafo, chat, tools del agente o perfil |
| Patrones y decisiones (perf sidebar/búsqueda, imports, overviews, hover, relaciones, editor/markdown, sticky, alarmas, auto-update, macOS, CLI, temas) | `.claude/context/patterns.md` | Entender una decisión de diseño o tocar uno de esos subsistemas |
| Release · electron-builder · CI/CD · artefactos · tareas frecuentes | `.claude/context/release.md` | Hacer un release, tocar build/CI o tareas de mantenimiento |
| Web pública (Astro en `docs/`): landing + páginas `/cli` `/ai` `/features` · inventario contenido↔fuente de verdad · estética "The Brain" · i18n EN/ES | `.claude/context/web.md` | Tocar la web, o al cambiar app/CLI/IA algo que la web documenta |
| Monetización (Fase 4; 4.0 cuenta+entitlements implementada en cliente): cuenta NoteFlow · IA gestionada (proxy) · nube E2EE · pagos MoR · Supabase | `.claude/context/monetization.md` | Trabajar en suscripciones, cuenta, proxy LLM o NoteFlow Cloud |
| Funcionalidades · UI · UX · atajos (producto/usuario) | skill `noteflow-features` | Discutir/diseñar features o entender la app desde el usuario |

> Skills hermanas: `noteflow-features` (producto/UX), `noteflow-cli` (CLI companion), `noteflow-mobile`
> (app móvil React Native). Detalle de repo/licencia en `.claude/context/architecture.md`.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework desktop | Electron 35 |
| UI | React 19 + TypeScript |
| Build | Vite 7 + tsc + electron-builder 26 |
| Editor de texto | TipTap 2 (Lowlight para highlight de código, tablas) |
| Estado | Zustand 5 |
| Estilos | Tailwind CSS 3 (sistema de temas por CSS vars) |
| Parsing | js-yaml (frontmatter), nanoid (ids), date-fns (fechas) |
| Iconos | lucide-react |
| Almacenamiento | Archivos `.md` en el dir de notas (ver `.claude/context/architecture.md`) |
| Formato de notas | YAML frontmatter + cuerpo Markdown |

## Comandos de desarrollo

```bash
npm run dev            # Vite + Electron en paralelo (usa .electron-dev como user-data-dir)
npm run build          # tsc -b && vite build && tsc -p tsconfig.electron.json
npm run build:electron # solo compila electron/ → dist-electron/
npm run dist           # build + electron-builder (genera instaladores en release/)
npm run lint           # eslint
npm test               # vitest run — batería de tests de lógica pura (tests/)
npm run test:watch     # vitest en modo watch
```

## Flujo para editar código

Para cualquier tarea que **edite código** del proyecto, el hilo principal delega en el subagente
**`implementer`**, que hace el cambio completo y se autoverifica (`npm run lint` + `npm run build` +
`npm test` + el smoke script relevante si aplica).

**Excepción — retoques mínimos:** los cambios muy pequeños y triviales (ajustar uno o dos valores de
CSS, un padding, un color, un typo, el texto de una clave i18n) los hace el hilo principal **directamente**,
sin lanzar el `implementer`. Si toca algo más que un valor puntual o hay lógica de por medio, se delega.

El subagente **`reviewer`** (revisa el `git diff` contra las convenciones y emite veredicto) **no es
obligatorio en todo cambio**: se lanza según el riesgo de la tarea.

**Lanzar `reviewer` si se cumple cualquiera de estas:**

- Toca una **zona delicada**: `electron/` (IPC, main), formato de nota / migración / cifrado (los 3
  espejos), sync con GitHub, IA (embeddings, grafo, chat, tools del agente), monetización (cuenta,
  entitlements, proxy LLM, nube), o build/release/CI.
- Es un cambio **amplio o estructural**: varios módulos, refactor transversal, nueva feature, nuevo
  canal IPC, cambio de esquema de datos o de ajustes.
- Puede **romper o perder datos del usuario**, o cambia comportamiento ya documentado.
- La **autoverificación no quedó limpia o no es concluyente**, o el implementer reporta dudas, riesgos
  o desviaciones de lo pedido.
- El usuario lo **pide explícitamente**.

**Se puede cerrar sin `reviewer`** cuando el cambio es pequeño, local y de bajo riesgo, y la
autoverificación quedó en verde: claves i18n y copy, estilos/CSS, ajustes visuales en un componente
aislado, typos, cambios solo en `docs/`, README o `.claude/`. En ese caso el hilo principal **lee el
`git diff` él mismo** antes de dar la tarea por buena. **En la duda, lanzar `reviewer`.**

Si el reviewer responde `CHANGES_REQUESTED`, aplicar/relanzar hasta que quede limpio.

Las **preguntas, exploración o lectura pura** y las **tareas operativas/git** (commit, push, releases,
correr scripts) se hacen directas, **sin** lanzar agentes. No se documenta el trabajo en ficheros:
cada agente resume en su respuesta.
