# Web de NoteFlow (sitio Astro en `docs/`)

Sitio de marketing + documentación pública. **Proyecto Astro independiente** dentro del repo
(`docs/package.json` propio). URL: https://yagoid.github.io/noteflow/ · deploy automático con el
workflow `pages.yml` en cada push a `main` que toque `docs/**` o el propio `pages.yml` (publica
`docs/dist`, la carpeta no se sirve en crudo).

**Objetivo de este fichero:** que un agente sepa **qué contenido hay publicado en la web y de qué
fuente de verdad bebe cada sección**, para actualizarla cuando cambie la app (o corregir
información errónea/desactualizada) sin tener que re-explorar el sitio.

```bash
cd docs
npm run dev      # http://localhost:4321/noteflow/
npm run build    # → docs/dist/ (14 páginas; 16 cuando /legal-notice tiene los datos del titular)
npm run check    # astro check (0 errores es lo esperado)
```

## Mapa del sitio (14-16 páginas, EN + espejo ES bajo /es/ con el MISMO slug)

| Ruta | Qué es | Componente | Prosa i18n |
|---|---|---|---|
| `/` | Landing one-pager (hero, `#what` = qué es + mosaico de clips, brain, profile, download) | `src/components/Home.astro` | `src/i18n/en.ts` + `es.ts` |
| `/cli` | Doc completa del CLI | `src/components/docs/CliPage.astro` | `src/i18n/docs/cli.{en,es}.ts` + datos en `src/data/cli.ts` |
| `/ai` | Internals de la IA (proveedores, embeddings, RAG, perfil, agente) | `src/components/docs/AiPage.astro` | `src/i18n/docs/ai.{en,es}.ts` |
| `/features` | Detalles de producto (jerarquía, stickies, atajos, vistas, cifrado…) | `src/components/docs/FeaturesPage.astro` | `src/i18n/docs/features.{en,es}.ts` |
| `/pricing` | Precios: todo lo esencial gratis + planes gestionados opcionales (NoteFlow AI / NoteFlow Cloud) | `src/components/docs/PricingPage.astro` | `src/i18n/docs/pricing.{en,es}.ts` |
| `/privacy` | Política de privacidad (texto legal canónico, EN fuente) | `src/components/docs/PrivacyPage.astro` → `LegalPage.astro` | `src/i18n/docs/privacy.{en,es}.ts` |
| `/terms` | Términos del servicio (cuenta + planes de pago; la app se rige por su licencia GPL-3.0-or-later) | `src/components/docs/TermsPage.astro` → `LegalPage.astro` | `src/i18n/docs/terms.{en,es}.ts` |
| `/legal-notice` (ES: `/es/legal-notice`) | Aviso legal LSSI-CE art. 10 (titular persona física autónoma, objeto, PI, responsabilidad, ley aplicable) — **gateada**, ver abajo | `src/components/docs/LegalNoticePage.astro` → `LegalPage.astro` | `src/i18n/docs/legal-notice.{en,es}.ts` + datos del titular en `legal-notice.owner.ts` |

Las páginas legales van **fuera del rail** de neuronas: solo se enlazan desde los footers
(landing y footer slim de DocsShell) y /privacy y /terms también desde la línea de aceptación del
sign-in de la app (`src/components/Settings/AccountPanel.tsx` → URLs absolutas
`…/noteflow[/es]/{terms,privacy}`); /privacy además desde la nota de privacidad del formulario de
feedback de Ajustes → About (`FeedbackSection.tsx` → `…/privacy#feedback`: no renombrar el id
`feedback` de esa sección).
Comparten renderer (`LegalPage.astro`: callout de resumen + secciones numeradas con bloques
`p`/`ul`/`table`; las celdas de tabla son texto escapado, el resto `set:html`), forma común
`LegalContent` en `src/i18n/docs/legal.ts` (aquí el ES se tipa contra la interfaz, no contra
`typeof xEn`) y accent **cyan**. Placeholders que `LegalPage.astro` rellena con URLs base-aware
del locale: `%MOBILE_PRIVACY_URL%` (→ `public/mobile-privacy-policy.html`, página legacy que sigue
viva porque la enlaza la Play Store), `%PRIVACY_URL%`, `%TERMS_URL%` y `%LEGAL_NOTICE_URL%`.

**`/legal-notice` está gateada por los datos del titular.** Nombre, NIF y domicilio viven UNA sola
vez en `src/i18n/docs/legal-notice.owner.ts` (`OWNER`, compartido por EN y ES). Mientras alguno
esté vacío (tras `trim`) o contenga `[[` o `]]` en cualquier posición (placeholder o resto de uno),
`legalNoticeReady` es `false`: las rutas
`src/pages/{,es/}legal-notice/[...path].astro` (rest route para poder devolver `[]` en
`getStaticPaths` vía `legalNoticePaths()`) **no generan la página**, los footers (Home + DocsShell)
**ocultan el enlace** y el build emite un `console.warn`. No se lanza un Error a propósito: `pages.yml`
despliega en cada push a `main` que toque `docs/**` y un build roto bloquearía toda la web.
La misma condición decide el párrafo del **responsable del tratamiento** en `/privacy` §1
(`privacy.{en,es}.ts`): con datos, nombra al titular (`ownerNameHtml`, escapado para `set:html`) y
enlaza al aviso legal vía `%LEGAL_NOTICE_URL%`; con placeholders, dice solo "el desarrollador
independiente que opera NoteFlow" + email, sin enlace (nunca hay enlaces rotos).

Extras servidos: `public/cli.html` (meta-refresh legacy → `/cli`, ver gotchas),
`public/mobile-privacy-policy.html`, `public/screenshots/`, `public/video/` (demo general, primer clip del mosaico de la landing),
`public/mosaic/` (clips del mosaico de la landing, ver "Landing" abajo), `public/clips/` (clips cortos de
`/features`, ver abajo), `public/brain/*.js`.

## Arquitectura (lo VIVO)

- **`src/layouts/Base.astro`** — head único: SEO (props `title/description/image/jsonLd/noindex` y
  **`path`** para los hreflang), fuentes (Inter cuerpo + JetBrains Mono técnico), anti-flash de tema
  (`localStorage['noteflow:web-theme']` + `data-theme` en `<html>`), carga de los web components del
  cerebro, GA **gateado por consentimiento** + banner de cookies (ver gotcha 8).
- **`src/layouts/DocsShell.astro`** — shell de las 4 páginas de docs y las 3 legales: `<nf-netbg>`
  de fondo, rail vertical de neuronas (home arriba; CLI cyan / AI purple / Features orange /
  Pricing pink, la activa "disparada"; en `/privacy`/`/terms`/`/legal-notice` ninguna neurona está activa —
  páginas "off-rail";
  switch de idioma → espejo de la MISMA página + toggle de tema), header de página, grid contenido +
  TOC lateral con scroll-spy (en <1100px pasa a chips horizontales), footer slim (incluye Privacy,
  Terms, Legal notice si `legalNoticeReady`, y Cookies), copy-to-clipboard.
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
  `src/i18n/docs/{common,cli,ai,features,pricing,privacy,terms,legal-notice}.{en,es}.ts` (docs). Patrón: el
  `.en.ts` define la forma (`type X = typeof xEn`) y el `.es.ts` la satisface → TypeScript fuerza
  el sync de claves (las legales usan la interfaz compartida `LegalContent` de `legal.ts` en su
  lugar, porque las páginas legales comparten renderer). Getters en
  `index.ts`/`common.ts`/`cli.ts`/`ai.ts`/`features.ts`/`pricing.ts`/`privacy.ts`/`terms.ts`/`legal-notice.ts`.
- **Componentes de docs**: `src/components/docs/` — `Term.astro` (marco terminal con typing),
  `StickyMock.astro` (sticky note en HTML/CSS con plegado a píldora), `FeatureClip.astro` (clip de la app
  en bucle, ver "Clips de /features") y las `XPage.astro`.
  Wrappers finos en `src/pages/{x,es/x}.astro`.
- **LEGACY MUERTO (no usar, no imitar)**: `src/components/{Nav,ChatMock,BrainGlyph,Pillar,
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
   entre sí las cuatro páginas de docs y las legales).
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
Secciones en orden: hero → `#what` (qué es + mosaico de clips) → `#brain` (chat mock) → `#profile`
(mockup de perfil) → `#get` (botones de descarga, ver "Descargas del landing" abajo). CTAs a `/cli` y
`/features` (bajo el mosaico) y `/ai` (en `#brain`) + footer, que enlaza también a `/pricing`, `/privacy`
y `/terms` **sin `data-nav`** — el script de sinapsis de la home no los conoce. Rail de neuronas: home ·
`what` · brain · profile · download (scroll-spy `SPY` + `NAV_BRAIN`/`NAV_COLORS` del script de `Home.astro`
con las mismas claves). Actualizar al cambiar UX visible o al hacer release con features nuevas destacables.

**`#what` — "What is NoteFlow" + mosaico** (antes eran dos secciones, `#notes` con un mock de notas
interactivo y `#themes` con el vídeo; se fusionaron y el mock se eliminó. `#notes`/`#themes` siguen como
anclas vacías dentro de `#what` para no romper enlaces viejos). Kicker + `h2` + párrafo (`t.intro`) y un
**escenario + tablero**: un escenario grande reproduce **un** clip casi a su resolución nativa, recto y
"elevado" (sombra profunda, z-index por encima), y los 9 clips (el activo incluido) quedan pinchados
alrededor como **miniaturas-póster** con giros/offsets de pinboard y chip colgando; las miniaturas son el
selector y el orden de la rotación. Es la estrella visual (marketing reutiliza los mismos clips).
(Hasta 2026-11 era un pinboard de 9 vídeos a la vez en un grid de 12 columnas que los pintaba a 30-50 %
de su tamaño → texto de la app ilegible; por eso el rediseño.)
- **Material** (manifiesto `mosaicClips` en el frontmatter de `Home.astro`: id, carpeta, cómo varía, lado,
  giro/offset y tono). Cada clip es `<base>.{webm,mp4,webp}` (webp = póster) y varía de una de tres formas:
  `theme` = toma dark y light (`<id>-{dark,light}.*`), `single` = una toma para ambos temas, `lang` = una
  toma por idioma de la página (`<id>.{en,es}.*`, igual en claro y oscuro). Orden (= orden DOM y de
  rotación): `demo` (`public/video/demo-{dark,light}.*`, 1280×820, ~33 s, theme) · `agents`
  (`public/mosaic/agents.{en,es}.*`, 960×600, ~9,5 s, lang — copia del clip del tour "What's new"
  `src/assets/whats-new/agents.<lang>.webm`; mp4 H.264 CRF 26 + faststart y póster webp del fotograma
  de 9 s, generados con ffmpeg) · `sections-tab` 720×540 · `temp-note` 720×540 · `kanban` 800×500 ·
  `slash-snippets` 576×720 · `sticky` 576×720 · `section-preview` 800×500 (todos theme) · `themes`
  720×720 (single: ya va cambiando de tema). Copy por clip en `t.intro.clips[id]`: `caption` (chip mono
  corto de la miniatura y del escenario — en miniaturas de ~120-140 px parte en dos líneas) y `label`
  (aria-label de la miniatura y del vídeo del escenario). El chip de `themes` cita el nº de temas
  (**14**, igual que `/features#personalize`). Si cambia la UI que enseña un clip, regrabarlo (dark y
  light, o por idioma) y revisar su caption/label. El clip `brain-orbit` (grafo 3D del Cerebro) se sacó del mosaico
  y se borraron sus ficheros de `public/mosaic/` (el script de captura aún sabe grabarlo, ver
  `release.md`).
- **Layout** (CSS en `<style is:global>` de `Home.astro`, `.nf-mosaic`/`.nf-stage*`/`.nf-thumb*`):
  escritorio = grid `miniaturas | escenario | miniaturas` (columnas laterales `clamp(118px, 9.7vw, 140px)`,
  4 miniaturas a la izquierda y 5 a la derecha repartidas con `space-around` sobre la altura del escenario,
  así los lados se intercalan). El escenario tiene marco fijo `aspect-ratio: 1280/820` (~890 px de ancho a
  1440 px → demo al 70 %, el resto ≥ 80 % de su resolución) para que no salte el layout: vídeo en
  `object-fit: contain` sobre el póster del mismo clip (nítido, `.nf-stage-still`) y, detrás, el póster
  desenfocado y atenuado (`.nf-stage-backdrop`), así los 1:1 / 4:5 no dejan bandas. Pósters como
  **fondos CSS** (`--poster-dark`/`--poster-light` inline + regla `[data-theme='light']`): solo se descarga
  el del tema actual y el cambio de tema no necesita script. Miniaturas 16:10 recortadas desde arriba.
  ≤1179px: escenario a todo el ancho y miniaturas debajo en filas centradas de 5 + 4 (`.nf-thumbs-col` pasa
  a `display: contents`); ≤639px: sin giros, el escenario sangra hasta 8 px del borde y las miniaturas son
  una **tira con scroll horizontal propio** (también sangrada; la página no hace scroll lateral) con el
  caption como pie. La "soltura" va en `--r --dx --dy` inline × `--k` (1 / .6 / 0).
- **Controlador** (script de `Home.astro`, bloque "mosaic"): **un solo `<video>`** (el escenario); las
  miniaturas no tienen vídeo y llevan sus fuentes en `data-{dark,light}-{webm,mp4,poster}` (las lang/single
  repiten el mismo fichero). Los `<source>` salen vacíos: un IntersectionObserver sobre el escenario
  (rootMargin 120px) los asigna al acercarse y reproduce solo en pantalla. El activo va **sin `loop`**: al
  `ended` pasa al siguiente (circular). Clic / Enter / Espacio en una miniatura → pasa a principal al
  instante (y reanuda si estaba en pausa); con `(hover: hover)` también un hover de ~300 ms; flechas mueven
  el foco entre miniaturas. Miniatura activa: `aria-pressed`, se endereza/sube, anillo en su tono y
  **barra de progreso** del clip (rAF); las demás se atenúan (solo con `data-ready`, o sea con JS). Al
  cambiar, el escenario "sube" desde el rect de la miniatura (FLIP con Web Animations, 460 ms,
  `cubic-bezier(.2,.7,.2,1)`; fundido+escala si la miniatura no está visible). En la tira de móvil la
  rotación hace scroll de la tira (no de la página) para mostrar la activa. Cambio de tema: recarga la
  toma del otro tema conservando `currentTime` (las lang/single no se recargan). **Pause/Play clips**
  (WCAG 2.2.2) para reproducción y rotación; en pausa aparece además un botón play centrado en el
  escenario. Con `prefers-reduced-motion`: sin autoplay, sin rotación, sin hover-select y sin FLIP — elegir
  una miniatura la reproduce una vez y al terminar se queda parada.
- **Reveal**: `data-reveal` en el escenario y en cada miniatura + `data-reveal-delay` (ms) escalona su
  entrada (la animación va en el `<button>`; giros y FLIP van en hijos, no chocan). La red de
  seguridad de 2,6 s del script solo revela lo que ya está en (o por encima de) la pantalla — revelarlo
  todo hacía que las entradas de más abajo se reprodujeran fuera de vista.

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

### `/cli` — fuente de verdad: **`noteflow help` (`cmdHelp` en `cli/noteflow.js`) + el propio código del CLI**
La **referencia completa** de comandos y flags es la ayuda del CLI (`noteflow help <comando>`) y,
en la web, `docs/src/data/cli.ts`; la skill `cli/noteflow-cli/SKILL.md` **ya no es una referencia**
sino la **guía para agentes** (solo lo que el CLI no avisa por sí solo: fallos silenciosos, modelo
mental, chuleta de una línea por comando, checklist y protocolos de sync). Al revisar la página,
contrasta con `noteflow help` y el código, no con la skill.
La cabecera (`data/cli.ts`) y la meta description (`cli.{en,es}.ts`) dicen CLI **v2.7.0**. Reflejan
v2.7.0: las filas de `push` y `cloud pull` (fusión por líneas en vez de copia de conflicto; copia solo
en notas cifradas), las de `add`/`set`/`new`/`section add`, `login`/`cloud login` (flags en dos pasos
`--no-wait`/`--finish` y `--send-code`/`--code`), `status`/`cloud status` (campo `desktopApp`) y la
tabla de flags globales (`globalFlags`; la mantiene la web, la skill ya no tiene tabla de flags).
**No** se reflejan en la web: el protocolo para agentes de la skill (checklist inicial, "Sincroniza
y verifica", "ofrécete a activar el sync") — la web solo enlaza a la skill. Anclas: `#install` `#notes-dir` `#format` `#commands` `#flags`
`#agents` `#caveats` `#troubleshooting`.
- Tabla de comandos/flags/ejemplos (38 comandos en 6 grupos, incluido el grupo **NoteFlow Cloud**
  `cloud login/logout/setup/push/pull/status`): **`src/data/cli.ts`** (estructural,
  con `desc: {en,es}` inline por fila).
- Prosa (instalación, formato v2, avisos PowerShell/app-abierta, troubleshooting): `cli.{en,es}.ts`.
- **Si cambia el CLI** (`cli/noteflow.js` + su `noteflow help`): reflejar comandos/flags nuevos en
  `data/cli.ts` y la prosa afectada. El badge de versión del hero también vive en el dict.

### `/ai` — fuente de verdad: **el código de `electron/ai/` + `electron/main.ts`** (y `.agents/context/ai.md`)
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
Anclas: `#organize` `#templates` `#sticky` `#links` `#snippets` `#shortcuts` `#views` `#temp`
`#encryption` `#ai-hidden` `#personalize`.

Todas las secciones siguen el **patrón de bloque visual** (ver "Clips de /features" abajo): lede de 1-2
frases + clip y/o mock HTML/CSS + 3-4 *facts* de una línea. Los hechos están condensados de la skill; si la
app cambia, corregir el *fact* (no volver a añadir prosa).

| Sección | Composición · documenta | Sincronizar si cambia |
|---|---|---|
| `#organize` | Clip `section-map` a ancho completo + split facts \| mock de la jerarquía (guías, línea plegada y mapa abierto; hover = mapa flotante). Lede: una nota = un tema, secciones = facetas (enlace a `/ai#embeddings`); facts: grupos con color · atajos del mapa de secciones · sidebar plegado + preview al hover · 27 iconos de carpeta y peek de grupo plegado | skill (Grupos/Carpetas, Item de nota del sidebar, Secciones, Previsualización al hover) |
| `#templates` | Sin clip. Mini-flujo de 2 tarjetas con la ruta de UI en chips (`⋯ → Save as template` → `Settings → Templates → New note`; en ES con las etiquetas de la app en español) + nota de una línea: `templates.json` sincronizado | skill (Plantillas) |
| `#sticky` | Split clip `windows` \| `StickyMock` interactivo (plegable a píldora, `⌄` decorativo del selector de sección) + 4 facts en 2 columnas: píldora / en vivo / desplegable de secciones / stickies al arrancar (Settings → Startup). Ctrl+S / Ctrl+G en el lede | skill (Ventana sticky) + `StickyMock.astro` |
| `#links` | Split (mock de pills: viva, rota y forma raw `[Name](noteflow://…)` + 3 facts) \| clip `links-palette`; debajo, fila mini con clip `kanban` pequeño + 2 líneas sobre `/kanban` | skill + `src/lib/sectionRelations.ts` + `src/lib/kanban.ts` |
| `#snippets` | Split clip `snippets` \| (mock fuente→insertado, fecha de ejemplo fija + 4 facts: botón partido · menú `/` (`/snippet`, ES `/fragmento`) · variables · `snippets.json`) | skill (Fragmentos) + `src/lib/snippets.ts` |
| `#shortcuts` | Tarjetas por grupo (App / Secciones / Sticky / Editor) en 2 columnas CSS, `dl` teclas \| acción (en <480px la acción va debajo). Datos en `features.{en,es}.ts` como `combos`; si todas las alternativas comparten modificadores se pintan una vez (`Ctrl + Z / Y`). Nota de macOS en una línea | `src/components/Settings/ShortcutsPanel.tsx` |
| `#views` | 3 tarjetas de una línea (vista de nota / de contenido / cerebro) + dúo de clips `brain` y `floating-sidebar` + nota de una línea del sidebar flotante (Ctrl+' → minimapa → panel al acercar el ratón) | skill (Vista de contenido, Vista de nota, Sidebar fijado / flotante) |
| `#temp` | Split 3 facts \| clip `quick-capture` (Ctrl+Shift+N → nota temporal, menú *Delete in* → 8 h): Ctrl+Shift+N / botón reloj · borrado también del remoto de sync · chevron de *Deletes …* (1-48 h o permanente) | skill (Notas temporales) |
| `#encryption` | Sin clip. Mock interactivo: nota cuyas líneas se barren a pseudo-cifrado (base64 determinista, decorativo) con botón candado; se bloquea sola una vez al entrar en vista (con reduced-motion/sin JS ya sale bloqueada). Facts: AES-256-GCM + PBKDF2 310k · sin backdoor · CLI e índice de IA no las leen | skill / `noteUtils` |
| `#ai-hidden` | Sin clip. Mock estático: 3 celdas de sección con tallo hacia una caja "índice · chat · grafo · tools"; la oculta (EyeOff, borde discontinuo) queda cortada con ×. 3 facts (superficies de IA · solo afecta a la IA · enlace a `/ai#privacy`). Va **en pareja con `#encryption`** (`.nf-feat-pair`: dos columnas por container query ≥760px, apiladas si no; ambos `section id` se conservan) | skill |
| `#personalize` | Swatches de los **14 temas (11 dark + 3 light)** con valores reales + split 3 facts (ajustes de Apariencia · ancho legible · índice flotante del editor) \| clip `themes` (Ajustes → Apariencia cambiando de tema en vivo) | `src/lib/themes.ts` (¡los swatches llevan colores literales!) |

**Clips de /features.** Toda la página sigue el patrón de bloque visual: kicker + `h2` + **lede** de 1-2
frases (`.nf-feat-lede`) + visual (**clip** y/o **mock** HTML/CSS) + **facts** (`.nf-feat-facts`: título en
negrita + una línea, ≤ ~15 palabras; `.is-2` = dos columnas). Objetivo ≤ ~90 palabras visibles por bloque;
el detalle vive en la app. Piezas de composición en `FeaturesPage.astro` (reutilizables, solo tokens de
`brain-site.css`): `.nf-feat-split` (2 columnas desde 760px; `.is-media-first`/`.is-media-last` = el clip
ocupa la columna ancha a izquierda/derecha — siempre va primero en el DOM para quedar arriba en móvil;
`.is-center` alinea al centro), `.nf-feat-stack` (mock + facts en una columna), `.nf-feat-mini` (clip
pequeño + 2 líneas), `.nf-feat-duo` (2 clips lado a lado), `.nf-feat-note` (aside de una línea con borde
de acento), `.nf-flow` (pasos con chips de ruta de UI), `.nf-feat-pair` (dos secciones en columnas por
container query). La composición alterna (ancho completo / clip izquierda / clip derecha / tarjetas) para
que la página no sea monótona. Todo grid lleva `minmax(0, 1fr)` para no desbordar a 375px.
- **Material**: `public/clips/<id>.<lang>.webm` (960×600, VP9, 5-9 s, bucle, sin audio, tema oscuro de
  la app, cursor falso) + póster `<id>.<lang>.webp` (primer frame). Los graba
  `scripts/whats-new-capture.cjs` (los mismos del tour "What's new"). ids usados aquí: `section-map`,
  `windows`, `links-palette`, `kanban`, `snippets`, `brain`, `floating-sidebar`, `quick-capture` y
  `themes` (este último es el tramo de Ajustes → Apariencia del clip `more` del tour, recortado desde
  5,2 s, 3,7 s). `more` (montaje cifrar + plantilla + tema que abre con el diálogo de cifrado, fuera de
  lugar en `#personalize`) **no se usa en la web y se borró de `public/clips`** (tampoco `sections`, `ai` ni `sync`: solo se copian
  los clips que usa alguna página). Para refrescar uno: copiar el `.webm` de `src/assets/whats-new/` y
  convertir su `.png` a `.webp` (`ffmpeg -i x.png -c:v libwebp -quality 82 x.webp`). Idiomas `en`/`es` (siempre el de la página). Si cambia
  la UI que enseña un clip, hay que regrabarlo (y su póster) y revisar su `clipLabel`.
- **`FeatureClip.astro`** (props `id`, `lang`, `label` = aria-label i18n que describe lo que pasa en el
  clip, `caption?` mono corto, `playLabel`, `pauseLabel`; labels en `features.{en,es}.ts` → `clip` y los
  `clipLabel`/`clipCaption` de cada bloque): marco tipo ventana (tokens, vale en dark y light) con
  `<video muted loop playsinline preload="none">` y la fuente en `data-src`. Un único script con
  IntersectionObserver (rootMargin 200px) asigna `src` al acercarse (carga perezosa real), reproduce y
  pausa al salir. Botón pausa/play (WCAG 2.2.2) que el script revela (sin JS solo se ve el póster);
  pausado a mano no se reanuda al volver a verlo. Con `prefers-reduced-motion` no hay autoplay: póster +
  play centrado.
- **Mocks animados**: `StickyMock` (demo de plegado una vez) y el candado de `#encryption` (se bloquea una
  vez) solo animan una vez o por interacción — nada en
  bucle infinito; con reduced-motion o sin JS, estado estático.
- **Scroll-spy del TOC** (`DocsShell.astro`, todas las páginas de docs): un clic en el TOC fija el
  resaltado en su destino hasta que termina el scroll suave (`scrollend`, con timeout de respaldo), para
  que dos secciones en la misma franja (el par `#encryption`/`#ai-hidden`) no se lo quiten. Al hacer
  scroll a mano con el par a la vista, gana la última en el DOM (`#ai-hidden`).

### `/pricing` — fuente de verdad: **`.agents/context/monetization.md`** (§§ visión / 3 / 4)
Anclas: `#free` `#plans` `#ai` `#cloud` `#compare` `#privacy`. Accent **pink**. Mensaje central:
todo lo esencial es gratis y lo seguirá siendo; los planes compran comodidad, no capacidad (ambas
capacidades se autogestionan gratis: IA con Ollama/key propia, nube con GitHub Sync). Desde
2026-07 la página **SÍ publica las cifras de precio** (fuente de verdad: monetization.md § visión
"Precios"; el checkout de Lemon Squeezy sigue mostrando el precio final autoritativo).

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#free` | Lo gratis (editor, Cerebro local, IA con key propia/Ollama, cifrado, GitHub Sync, CLI) + callout "los planes suman, no sustituyen" | monetization.md § visión |
| `#plans` | Grid de 3 cards de precio: AI €5.99/mes · €49.99/año, Cloud €3.99/mes · €39.99/año, Bundle €7.99/mes · €79.99/año (badge "Best value") + alta desde la app + MoR Lemon Squeezy; **precios con IVA incluido** (tax-inclusive pricing activado en Lemon Squeezy; LSSI art. 10.1.f — lo dicen la nota bajo las cards, los bullets de `#ai`/`#cloud` y `/terms` §3); las cifras van también al JSON-LD (`offers`, con `valueAddedTaxIncluded: true`) | monetization.md § visión "Precios" (y `src/lib/subscriptionPlans.ts`) |
| `#ai` | Plan NoteFlow AI: **modelos curados literales** en dos bloques — "del día a día" (deepseek-v4.1-flash-1017 —recomendado—, gpt-5.6-luna, claude-haiku-5.5, mimo-v2.6-pro) y "avanzado" (gpt-5.6-sol, que gasta la asignación ~30× más rápido) —, **asignación mensual medida por el coste real de cada petición** (sin cifra de tokens ni multiplicadores: no publicar el presupuesto en USD), mensual/anual con **€5.99/mes o €49.99/año** en el bullet, alta vía Settings → Subscription → Subscribe (checkout Lemon Squeezy) | monetization.md § 3 "Cuota por coste" (catálogo vivo = tabla `ai_models`, catálogo actual en `supabase/migrations/0013_ai_cost_quota.sql` — añadir una fila NO actualiza la web: revisar esta lista a mano; el "≈30×" sale del `cost_index` de GET /models) + § visión "Precios" |
| `#cloud` | Plan NoteFlow Cloud marcado **"Available now"**: sync automática, cifrado **dual** (managed por defecto + E2EE opt-in), bullet con **€3.99/mes o €39.99/año**; se activa sola al pagar y al iniciar sesión con el plan (igual que NoteFlow AI en `#ai`); GitHub Sync sigue gratis | monetization.md § 4 (badge activo, no `--soon`; + § visión "Precios" |
| `#compare` | Tabla gestionado vs autogestionado (IA, setup, sync, "todo lo demás gratis") | monetization.md §§ 3-4 |
| `#privacy` | RAG local, al proxy viaja lo mismo que con key propia, `aiHidden`/cifradas nunca salen, IA gestionada ≠ nube de notas | monetization.md § 3 "Privacidad" + `/ai#privacy` |

### `/privacy`, `/terms` y `/legal-notice` — texto legal canónico (el EN es la fuente; el ES es traducción fiel)
Los hechos que citan (Supabase/Lemon Squeezy/OpenRouter como proveedores, Lemon Squeezy como MoR,
asignación mensual de IA medida por el coste de cómputo de cada petición (sin cifra publicada), datos de medición por petición de la IA gestionada (`/privacy`: usuario, modelo, tokens, coste según OpenRouter, id de generación y fecha — espejo de las columnas de `usage_events`), E2EE de Cloud sin reset de passphrase, edad mínima 14, licencia del código,
contacto yago.igle@gmail.com, fecha "Last updated") deben seguir siendo ciertos: **si cambia un proveedor, la cuota, el flujo de
pagos o la arquitectura E2EE, hay que revisar ambos textos y actualizar la fecha**. Cambios de
redacción legal son deliberados — no "mejorar" el texto de pasada. La app enlaza a estas páginas
desde el sign-in (AccountPanel), así que las URLs `/{es/}privacy` y `/{es/}terms` no deben moverse.

**Licencia:** el `LICENSE` del repo es **GPL-3.0-or-later** desde el commit `71a0995` (antes
FSL-1.1). README, `package.json`, `/legal-notice` y `/terms` (meta, summary y §1, corregidos el
2026-10-19; antes decían "source-available"/FSL-1.1) citan la GPL. Si la licencia vuelve a cambiar,
revisar esos textos y su fecha.

## Checklist al cerrar una feature de la app

1. ¿Es visible para el usuario? → skill `noteflow-features` (ya obligatorio) **y** revisar si toca
   alguna sección de `/features` o algún clip del mosaico de la landing (`#what`).
2. ¿Toca el CLI? → `noteflow help` (`cmdHelp`) con el detalle, la SKILL.md del CLI solo si cambia algo que el CLI no avisa (y siempre con la **misma versión** que `CLI_VERSION`, ver `patterns.md`) **y** `/cli` (`data/cli.ts` + prosa + versión del hero).
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
