# Web de NoteFlow (sitio Astro en `docs/`)

Sitio de marketing + documentación pública. **Proyecto Astro independiente** dentro del repo
(`docs/package.json` propio). URL: https://yagoid.github.io/noteflow/ · deploy automático con el
workflow `pages.yml` en cada push a `main` que toque `docs/**` (publica `docs/dist`, la carpeta no
se sirve en crudo).

**Objetivo de este fichero:** que un agente sepa **qué contenido hay publicado en la web y de qué
fuente de verdad bebe cada sección**, para actualizarla cuando cambie la app (o corregir
información errónea/desactualizada) sin tener que re-explorar el sitio.

```bash
cd docs
npm run dev      # http://localhost:4321/noteflow/
npm run build    # → docs/dist/ (14 páginas)
npm run check    # astro check (0 errores es lo esperado)
```

## Mapa del sitio (14 páginas, EN + espejo ES bajo /es/)

| Ruta | Qué es | Componente | Prosa i18n |
|---|---|---|---|
| `/` | Landing one-pager (hero, notes, showcase, brain, profile, download) | `src/components/Home.astro` | `src/i18n/en.ts` + `es.ts` |
| `/cli` | Doc completa del CLI | `src/components/docs/CliPage.astro` | `src/i18n/docs/cli.{en,es}.ts` + datos en `src/data/cli.ts` |
| `/ai` | Internals de la IA (proveedores, embeddings, RAG, perfil, agente) | `src/components/docs/AiPage.astro` | `src/i18n/docs/ai.{en,es}.ts` |
| `/features` | Detalles de producto (jerarquía, stickies, atajos, vistas, cifrado…) | `src/components/docs/FeaturesPage.astro` | `src/i18n/docs/features.{en,es}.ts` |
| `/pricing` | Precios: todo lo esencial gratis + planes gestionados opcionales (NoteFlow AI / NoteFlow Cloud) | `src/components/docs/PricingPage.astro` | `src/i18n/docs/pricing.{en,es}.ts` |
| `/privacy` | Política de privacidad (texto legal canónico, EN fuente) | `src/components/docs/PrivacyPage.astro` → `LegalPage.astro` | `src/i18n/docs/privacy.{en,es}.ts` |
| `/terms` | Términos del servicio (cuenta + planes de pago; la app se rige por su licencia FSL) | `src/components/docs/TermsPage.astro` → `LegalPage.astro` | `src/i18n/docs/terms.{en,es}.ts` |

Las dos páginas legales van **fuera del rail** de neuronas: solo se enlazan desde los footers
(landing y footer slim de DocsShell) y desde la línea de aceptación del sign-in de la app
(`src/components/Settings/AccountPanel.tsx` → URLs absolutas `…/noteflow[/es]/{terms,privacy}`).
Comparten renderer (`LegalPage.astro`: callout de resumen + secciones numeradas con bloques
`p`/`ul`/`table`), forma común `LegalContent` en `src/i18n/docs/legal.ts` (aquí el ES se tipa
contra la interfaz, no contra `typeof xEn`) y accent **cyan**. La privacy enlaza a
`public/mobile-privacy-policy.html` vía placeholder `%MOBILE_PRIVACY_URL%` (esa página legacy
sigue viva: la enlaza la Play Store).

Extras servidos: `public/cli.html` (meta-refresh legacy → `/cli`, ver gotchas),
`public/mobile-privacy-policy.html`, `public/screenshots/`, `public/video/`, `public/brain/*.js`.

## Arquitectura (lo VIVO)

- **`src/layouts/Base.astro`** — head único: SEO (props `title/description/image/jsonLd/noindex` y
  **`path`** para los hreflang), fuentes (Inter cuerpo + JetBrains Mono técnico), anti-flash de tema
  (`localStorage['noteflow:web-theme']` + `data-theme` en `<html>`), carga de los web components del
  cerebro, GA **gateado por consentimiento** + banner de cookies (ver gotcha 8).
- **`src/layouts/DocsShell.astro`** — shell de las 4 páginas de docs y las 2 legales: `<nf-netbg>`
  de fondo, rail vertical de neuronas (home arriba; CLI cyan / AI purple / Features orange /
  Pricing pink, la activa "disparada"; en `/privacy`/`/terms` ninguna neurona está activa —
  páginas "off-rail";
  switch de idioma → espejo de la MISMA página + toggle de tema), header de página, grid contenido +
  TOC lateral con scroll-spy (en <1100px pasa a chips horizontales), footer slim (incluye Privacy y
  Terms), copy-to-clipboard.
  Props: `lang, page, title, description, kicker, h1, tagline, toc, accent`.
- **Estilos**: `src/styles/brain-site.css` = tokens del design system "The Brain" (`--bg --card
  --ink* --line* --detail --accent --purple --orange --cyan --pink --red --brain-*`; dark en
  `:root`, light en `[data-theme="light"]`) + `src/styles/docs.css` = layout/tablas/terminal/TOC de
  las páginas de docs. Los estilos propios de cada página van inline + `<style is:global>` en su
  componente (patrón Home.astro).
- **Fondo "cerebro tech"**: web components vanilla en `public/brain/` — `<nf-netbg>` (malla 2D
  canvas, reacciona a `data-theme`) y `<noteflow-brain>` (wireframe 3D three.js, solo en la home).
  OJO — el wireframe visible lo renderizan **solo** los assets servidos `public/brain/*.js`
  (`nf-brain.js` define el custom element; `nf-mesh.js` la malla; `nf-graph.js` el grafo de ejemplo
  + asignación de vértices). Esos `.js` son un **port vanilla mantenido a mano** de `src/brain/*.ts`
  (`mesh.ts`, `graph.ts`, `sampleGraph.ts`, `assign.ts`) — que son la **fuente/espejo** pero NO se
  bundlean en ninguna página (`BrainHero.tsx`/`BrainScene.tsx` son un tuner de dev sin importadores).
  Al tocar el grafo (nodos, sinapsis, colocación) hay que **sincronizar ambos lados**: editar el
  `.ts` correspondiente Y su port en `public/brain/*.js`, o el cambio no se ve en la web.
  Ej.: el grupo central "IA Generated" (perfil del segundo cerebro) se ancla al núcleo vía el flag
  `centered` en `graph.ts`/`sampleGraph.ts`/`assign.ts` y su espejo `nf-graph.js`.
- **i18n**: `src/i18n/{en,es}.ts` (landing) y
  `src/i18n/docs/{common,cli,ai,features,pricing,privacy,terms}.{en,es}.ts` (docs). Patrón: el
  `.en.ts` define la forma (`type X = typeof xEn`) y el `.es.ts` la satisface → TypeScript fuerza
  el sync de claves (las legales usan la interfaz compartida `LegalContent` de `legal.ts` en su
  lugar, porque /privacy y /terms comparten renderer). Getters en
  `index.ts`/`common.ts`/`cli.ts`/`ai.ts`/`features.ts`/`pricing.ts`/`privacy.ts`/`terms.ts`.
- **Componentes de docs**: `src/components/docs/` — `Term.astro` (marco terminal con typing),
  `StickyMock.astro` (sticky note en HTML/CSS con plegado a píldora), y las 4 `XPage.astro`.
  Wrappers finos en `src/pages/{x,es/x}.astro`.
- **LEGACY MUERTO (no usar, no imitar)**: `src/components/{Nav,Footer,ChatMock,BrainGlyph,Pillar,
  Terminal,ScreenshotFrame}.astro`, `ThemeToggle.tsx`, `src/brain/*.tsx`, `src/styles/{tokens,global}.css`,
  y los HTML de la raíz `docs/` (`index.html`, `style.css`, `main.js` — no se sirven).

## Reglas y gotchas

1. **Base path `/noteflow`**: TODO enlace/asset interno pasa por `href()`/`asset()`
   (`src/lib/url.ts`) o `getRelativeLocaleUrl` de `astro:i18n`. Nunca `href="/..."` a pelo.
2. **hreflang**: las páginas no-home deben pasar `path` a `Base` (vía DocsShell ya se hace) para que
   `/cli` ↔ `/es/cli` se declaren alternates mutuos.
3. **`redirects` de Astro NO aplica el `base` al destino** (y genera un *directorio* `x.html/`).
   El redirect legacy `/cli.html → /cli` es un meta-refresh manual en `docs/public/cli.html` con la
   URL hardcodeada — actualizarlo si se pasa a dominio propio.
4. **Dark/light**: todo color nuevo debe salir de las variables de `brain-site.css` (probar ambos
   temas). Animaciones siempre con `prefers-reduced-motion` respetado.
5. **UI de la web bilingüe completa**: cada string visible vive en el dict EN y el ES. Excepción
   deliberada: los **prompts literales** de `/ai` van verbatim en inglés en ambos idiomas (viven una
   sola vez en `ai.en.ts`; `ai.es.ts` los importa) — son los prompts reales del código y no se traducen.
6. El sitio se publica solo al pushear a `main`; no publicar a medias (el rail/footer de docs enlaza
   entre sí las cuatro páginas de docs y las dos legales).
7. **Cerebros three.js y móvil**: `nf-brain.js` pausa su rAF fuera de viewport (IntersectionObserver
   sobre el host + `visibilitychange`) y en `(pointer: coarse)` corre en tier *lowPower* (pixelRatio
   ≤1.5, **sin** EffectComposer/UnrealBloom — `composer`/`bloom` pueden ser `null`). Los contenedores
   ambient (sin `data-controls`) llevan `pointer-events:none` y el interactivo `touch-action:pan-y`
   para no matar el scroll táctil. Tras tocar `nf-mesh.js`/`nf-graph.js`/`nf-brain.js` (los tres
   módulos que carga `nf-load.js`), **subir el `?v=` de las tres entradas en `nf-load.js`**
   (cache-buster compartido). `nf-netbg.js` y el propio `nf-load.js` van directos en `Base.astro`
   sin `?v=` — dependen del TTL HTTP normal.
8. **Consentimiento de cookies (GDPR/AEPD, opt-in por bloqueo)**: GA **no** se carga hasta aceptar.
   Estado en `localStorage['noteflow:cookie-consent']` = `'granted' | 'denied'` (ausente = sin decidir).
   Todo vive en `Base.astro`: un `<script is:inline>` en el `<head>` define `window.nfLoadGA()` (inyecta
   el `gtag` con `createElement`, idempotente) y en el boot carga GA si `'granted'` o marca
   `<html data-cookie-consent="pending">` si está sin decidir (anti-flash, decidido en el head → sin
   FOUC). El banner (fijo abajo, `role="dialog"`, botones Accept/Reject de **igual prominencia** por
   requisito AEPD, solo vars de `brain-site.css`) se revela por CSS con ese atributo; sus textos están
   en `src/i18n/consent.ts` (EN fuente + ES espejo, seleccionado por `lang`). Aceptar → `nfLoadGA()` en
   caliente; Rechazar → nada. **Retirar el consentimiento**: enlace "Cookies" en los footers (landing
   `Home.astro` + slim de `DocsShell.astro`, label en los dicts de footer `en/es` y `common.{en,es}`)
   con `data-cookie-settings`; el handler de `Base.astro` resetea el estado y reabre el banner en
   cualquier página. NO es Consent Mode v2 — es bloqueo puro previo al consentimiento.

## Inventario de contenido ↔ fuente de verdad (LO IMPORTANTE)

Cuando cambie algo en la app, este mapa dice qué tocar en la web. Editar siempre el par
`.en.ts` + `.es.ts` (el tipo obliga).

### Landing `/` (`src/i18n/{en,es}.ts`)
Features del mock de notas, chat mock, mockup de perfil, botones de descarga (ver
"Descargas del landing" abajo), CTAs a `/cli`, `/ai` y `/features` (+ footer, que enlaza también a `/pricing`,
`/privacy` y `/terms` **sin `data-nav`** — el script de sinapsis de la home no los conoce). Vídeos/capturas por tema en
`public/video/` y `public/screenshots/`. Actualizar al cambiar UX visible o al hacer release con
features nuevas destacables.

**Descargas del landing (`#get`)** — fila flex con los **dos botones de descarga** (Windows `nf-lift`
primario + Linux `nf-ghost` con `dlGhost`, 14px), ambos a `/releases/latest` y con su `data-dl`
(`win`/`linux`) → rótulo de versión → disclaimer → nota de SmartScreen. Los dos botones pesan **igual** a propósito: los dos
son descargas, ninguno debe leerse como la opción menor. **Nada se hornea en build time** y no hay dependencia del `package.json` raíz: la web solo se redespliega con
cambios en `docs/**`, así que cualquier versión/URL horneada mentiría en cuanto salga un release.

- **HTML de partida**: los dos botones de descarga apuntan a `https://github.com/yagoid/noteflow/releases/latest`
  — la **página** del último release, con `target="_blank"`. Es a propósito: los assets **llevan la
  versión en el nombre**, así que **no existe URL estable a un binario concreto** (no hay
  `releases/latest/download/…`). Alguien intentará "arreglarlo" fijando una URL de asset: se
  quedaría desfasada. `/releases/latest` nunca caduca ni da 404, y es lo que ve quien no tiene JS.
- **Cliente** (script `data-dl` de `Home.astro`, al cargar): pide
  `api.github.com/repos/yagoid/noteflow/releases/latest` (ya excluye prereleases) y, por cada
  botón, mete el `browser_download_url` **que devuelve la API** para el asset que casa
  `/-Setup\.exe$/` o `/_amd64\.deb$/` sobre `assets[].name` (el `$` excluye los `.blockmap`). Los
  nombres **no se reconstruyen por patrón** → cambiar los `artifactName` no rompe la web. Al pasar a
  binario directo se le quita el `target` (una descarga no abre pestaña en blanco). Asset ausente →
  ese botón se queda en `/releases/latest`, que es un fallback correcto.
- **Rótulo de versión** (`[data-dl-version-row]` / `[data-dl-version]`): sale con
  `visibility:hidden` (hueco reservado, sin salto de layout) y solo aparece cuando el script resuelve
  el `tag_name`. Fallo/403/JSON raro → silencioso: sin rótulo y con los `href` a `/releases/latest`.
- **Nota de SmartScreen** (`download.winNote`, caja tras el disclaimer): el instalador de Windows **no
  está firmado** (no hay certificado de code signing), así que la primera ejecución dispara el aviso de
  SmartScreen. Una sola frase: qué es, que **no** habla de la app (código abierto) y los clics para
  seguir. Va teñida con el ámbar `--detail` (borde 26%, fondo 6%, icono de escudo) para que lea como
  warning **sin** competir con los botones ni con el disclaimer de privacidad. Cuando haya firma de
  código, esta nota **se borra**.

### `/cli` — fuente de verdad: **`cli/noteflow-cli/SKILL.md`** (skill `noteflow-cli`)
Documenta el CLI **v1.10.0**. Anclas: `#install` `#notes-dir` `#format` `#commands` `#flags`
`#agents` `#caveats` `#troubleshooting`.
- Tabla de comandos/flags/ejemplos (38 comandos en 6 grupos, incluido el grupo **NoteFlow Cloud**
  `cloud login/logout/setup/push/pull/status`): **`src/data/cli.ts`** (estructural,
  con `desc: {en,es}` inline por fila).
- Prosa (instalación, formato v2, avisos PowerShell/app-abierta, troubleshooting): `cli.{en,es}.ts`.
- **Si cambia el CLI** (`cli/noteflow.js` + su SKILL.md): reflejar comandos/flags nuevos en
  `data/cli.ts` y la prosa afectada. El badge de versión del hero también vive en el dict.

### `/ai` — fuente de verdad: **el código de `electron/ai/` + `electron/main.ts`** (y `.claude/context/ai.md`)
Anclas: `#providers` `#embeddings` `#relations` `#rag` `#profile` `#agent` `#privacy`.

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#providers` | Los 9 presets LLM, baseUrl, capacidades (PDF solo Anthropic; sin imágenes DeepSeek/MiniMax/Moonshot), keys con safeStorage | `electron/ai/llm/presets.ts` |
| `#embeddings` | Modelo mpnet 768-d, Transformers.js+onnx, SQLite/sqlite-vec/FTS5, por sección, 2000 chars, debounce 2.5s, cifradas fuera | `electron/ai/aiWorker.ts`, `aiIndex.ts` |
| `#relations` | Anti-anisotropía + coseno; related minScore 0.03; grafo centroide 0.05 + top-6 mutual | `aiWorker.ts` (`relatedBySection`, `contentEdges`) |
| `#rag` | Búsqueda híbrida RRF k=60, top-6 hits + 3 vecinos, bloques 1500 chars, **system prompt del chat VERBATIM** | `electron/main.ts` (`CHAT_SYSTEM_BASE`, `buildChatContext`) |
| `#profile` | Cuestionario 4 secciones, Big Five/OCEAN, **prompt del profiler VERBATIM** | `src/components/AiPanel/profileQuestions.ts`, `main.ts` (`ai:profile-generate`) |
| `#agent` | Tabla de las 17 tools, 4 destructivas con confirmación, máx 12 pasos, no usa el CLI | `electron/ai/llm/tools.ts` (`TOOLS`, `DESTRUCTIVE_TOOLS`), `MAX_AGENT_STEPS` |
| `#privacy` | `aiHidden` fuera de índice/RAG/tools; doble interruptor embeddings vs LLM | `aiWorker.ts`, `tools.ts`, `buildChatContext` |

Los umbrales y prompts están publicados **literalmente** — cualquier cambio en esos valores del
código desactualiza la web. Los prompts se compararon byte a byte al publicarlos; mantener esa
fidelidad (viven en `ai.en.ts` como constantes exportadas).

### `/features` — fuente de verdad: **skill `noteflow-features`** (y el código que ella cita)
Anclas: `#organize` `#templates` `#sticky` `#links` `#shortcuts` `#views` `#temp` `#encryption`
`#ai-hidden` `#personalize`.

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#organize` | Jerarquía grupos→carpetas→notas→secciones | skill (Grupos/Carpetas/Secciones) |
| `#templates` | Save as template, Settings→Templates, `templates.json` | skill (Plantillas) |
| `#sticky` | Mock CSS 300×300 plegable, Ctrl+S/Ctrl+G, startup de stickies | skill (Sticky notes) + `StickyMock.astro` |
| `#links` | Slash command, pills vivas/rotas, forma raw `[Name](noteflow://…)`; un bullet sobre el tablero kanban (`/kanban`) | skill + `src/lib/sectionRelations.ts` + `src/lib/kanban.ts` |
| `#shortcuts` | Tabla completa de atajos (datos en `features.en.ts` como `combos`) | `src/components/Settings/ShortcutsPanel.tsx` |
| `#views` | Note/group overview, All content, Brain view | skill (Vistas) |
| `#temp` | Notas temporales 24h | skill |
| `#encryption` | AES-256-GCM + PBKDF2 310k, sin backdoor, CLI las ignora | skill / `noteUtils` |
| `#ai-hidden` | Toggle Hide from AI (enlaza a `/ai#privacy`) | skill |
| `#personalize` | **14 temas (11 dark + 3 light)** con swatches de valores reales, fuentes, ancho readable, índice flotante del editor | `src/lib/themes.ts` (¡los swatches llevan colores literales!) |

### `/pricing` — fuente de verdad: **`.claude/context/monetization.md`** (§§ visión / 3 / 4)
Anclas: `#free` `#plans` `#ai` `#cloud` `#compare` `#privacy`. Accent **pink**. Mensaje central:
todo lo esencial es gratis y lo seguirá siendo; los planes compran comodidad, no capacidad (ambas
capacidades se autogestionan gratis: IA con Ollama/key propia, nube con GitHub Sync). Desde
2026-07 la página **SÍ publica las cifras de precio** (fuente de verdad: monetization.md § visión
"Precios"; el checkout de Lemon Squeezy sigue mostrando el precio final autoritativo).

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#free` | Lo gratis (editor, Cerebro local, IA con key propia/Ollama, cifrado, GitHub Sync, CLI) + callout "los planes suman, no sustituyen" | monetization.md § visión |
| `#plans` | Grid de 3 cards de precio: AI €5.99/mes · €49.99/año, Cloud €3.99/mes · €39.99/año, Bundle €7.99/mes · €79.99/año (badge "Best value") + alta desde la app + MoR Lemon Squeezy; las cifras van también al JSON-LD (`offers`) | monetization.md § visión "Precios" (y `src/lib/subscriptionPlans.ts`) |
| `#ai` | Plan NoteFlow AI: **modelos curados literales** en tres bloques por coste de cuota — estándar ×1 (los dos DeepSeek, mimo-v2.5-pro, gpt-5.6-luna, claude-haiku-4.5), intermedio ×2 (grok-4.5) y avanzados ×6 (kimi-k3) —, **cuota 3M tokens/mes**, mensual/anual con **€5.99/mes o €49.99/año** en el bullet, alta vía Settings → Account → Subscribe (checkout Lemon Squeezy) | monetization.md § 3 (`NOTEFLOW_AI_MODELS`, `MODEL_QUOTA_MULTIPLIERS`, `AI_MONTHLY_TOKENS`) + § visión "Precios" |
| `#cloud` | Plan NoteFlow Cloud marcado **"Available now"**: sync automática, cifrado **dual** (managed por defecto + E2EE opt-in), bullet con **€3.99/mes o €39.99/año**; GitHub Sync sigue gratis | monetization.md § 4 (badge activo, no `--soon`; + § visión "Precios" |
| `#compare` | Tabla gestionado vs autogestionado (IA, setup, sync, "todo lo demás gratis") | monetization.md §§ 3-4 |
| `#privacy` | RAG local, al proxy viaja lo mismo que con key propia, `aiHidden`/cifradas nunca salen, IA gestionada ≠ nube de notas | monetization.md § 3 "Privacidad" + `/ai#privacy` |

### `/privacy` y `/terms` — texto legal canónico (el EN es la fuente; el ES es traducción fiel)
Los hechos que citan (Supabase/Lemon Squeezy/OpenRouter como proveedores, cuota 3M tokens,
E2EE de Cloud sin reset de passphrase, edad mínima 14, FSL-1.1, contacto yago.igle@gmail.com,
fecha "Last updated") deben seguir siendo ciertos: **si cambia un proveedor, la cuota, el flujo de
pagos o la arquitectura E2EE, hay que revisar ambos textos y actualizar la fecha**. Cambios de
redacción legal son deliberados — no "mejorar" el texto de pasada. La app enlaza a estas páginas
desde el sign-in (AccountPanel), así que las URLs `/{es/}privacy` y `/{es/}terms` no deben moverse.

## Checklist al cerrar una feature de la app

1. ¿Es visible para el usuario? → skill `noteflow-features` (ya obligatorio) **y** revisar si toca
   alguna sección de `/features` o el mock de la landing.
2. ¿Toca el CLI? → SKILL.md del CLI **y** `/cli` (`data/cli.ts` + prosa + versión del hero).
3. ¿Toca IA (presets, tools, umbrales, prompts, cuestionario)? → `/ai` (tabla de arriba).
4. ¿Atajos o temas nuevos? → `/features#shortcuts` / `#personalize`.
5. Verificar: `cd docs && npm run build` + revisar la página en dark y light y en EN y ES.

## Añadir una página de docs nueva (patrón)

1. Dicts `src/i18n/docs/x.{en,es}.ts` + getter `x.ts` (forma = `typeof xEn`).
2. Componente `src/components/docs/XPage.astro` sobre `DocsShell` (elegir `accent`, definir `toc`).
3. Wrappers `src/pages/x.astro` + `src/pages/es/x.astro`.
4. Neurona en el rail y footer de `DocsShell.astro` + labels en `common.{en,es}.ts` — y añadir la
   clave al union `DocsPage` de `DocsShell.astro`. (Las páginas legales son la excepción: están en
   `DocsPage` y en el footer pero no en `railPages`.)
5. Enlace desde la home si procede (footer/CTA, **sin `data-nav`** para no tocar el script de sinapsis).
