# Vista de Agentes — especificación de traspaso

Este documento describe **qué hay que construir** en la app real a partir del prototipo
(`index.html`, en esta carpeta). El prototipo es la referencia visual y de comportamiento; este
texto dice qué es decisión cerrada, qué es simulación y qué queda por decidir.

Ábrelo al lado mientras implementas: `prototypes/agents-view/index.html` (sin servidor).

> **Estado:** diseño aprobado por el usuario por iteraciones (2026-11-27). No hay nada implementado en
> `src/` ni en `electron/`. El código del prototipo **no se reutiliza** salvo lo indicado en § 11.

---

## 1. Qué es

Una vista dentro de la **vista cerebro** para gestionar las tareas con agentes sin ir a la nota:
verlas, crearlas, encolarlas, ejecutarlas, leer su informe y configurar cómo se ejecutan.

- **No guarda nada propio.** Lee y escribe las mismas líneas de checklist con marcador `🤖<id>:<estado>`
  y los mismos informes (`agent.md`) que ya usa el editor. Ver `.agents/context/note-format.md`
  § «Tareas para agentes» y `.agents/context/patterns.md` § «Tareas con agentes».
- **El wireframe del cerebro no se toca.** La vista se dibuja encima.
- **El panel de IA de la izquierda (chat, ajustes) se da por plegado/inexistente.** Su integración
  futura está fuera de alcance.

### Modelo de datos

| En la vista | En disco |
|---|---|
| Proyecto | Una nota normal con `project: true` en el frontmatter (**campo nuevo**) |
| Sección | Una sección de esa nota |
| Tarea | Una línea `- [ ]` de esa sección |
| Título de la tarea | Primera línea de la tarea |
| Descripción («Encargo») | Líneas de continuación de la tarea (ya soportadas: `agentTaskLines`) |
| Estado | El marcador `🤖<id>:<estado>` de la línea |
| Carpeta de trabajo | La carpeta por nota que ya guarda Run (local, por equipo) |

Estados que muestra la vista: `open` (sin marcador, «sin encargar»), `queued`, `running`, `waiting`,
`review`, `failed`, `done`. El prototipo **no** contempla `interrupted` ni `no-signal`: hay que
añadirlos siguiendo el mismo patrón (ver § 10).

---

## 2. Composición

Tres columnas flotando sobre el cerebro, más dos piezas fijas.

```
┌ cabecera (arriba izq.) ───────────────────────────────────────────────────────────┐
│ Agentes  [◉1 ◔3 ◌4 ◐2 ⊗1 ▾]  [☑ 2 hechas]  [👁 Solo el cerebro]                    │
│                                                                                   │
│                     ┌ col. 1 ─────────┐  ┌ col. 2 ───────────┐  ┌ col. 3 ───────┐ │
│      CEREBRO        │ ganglios        │  │ [▶ Run 2 ▾]       │  │ detalle de la │ │
│   (fondo entero,    │ (proyectos)     │  │ Sección A         │  │ tarea elegida │ │
│    desplazado a     │ · el enfocado   │──│  tarea            │──│ (solo si hay  │ │
│    la izquierda)    │   abierto en    │  │  tarea            │  │  una elegida) │ │
│                     │   secciones     │  │  + tarea en A     │  │               │ │
│ ┌ consola ───────┐  │ · + proyecto    │  │ Sección B …       │  │               │ │
│ │ líder · Run all│  └─────────────────┘  └───────────────────┘  └───────────────┘ │
│ │ prompt         │                                                                │
│ └────────────────┘                                                                │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Medidas del prototipo (escenario de 1320 × 720):

| Pieza | Valor |
|---|---|
| Cerebro | centro al ~24 % del ancho; ocupa todo el fondo |
| Columnas 1+2 (`.work`) | empiezan al **35 %** del ancho |
| Columna 1 (ganglios) | 226 px; separación con la col. 2: 44 px |
| Tarjeta de tarea | `min(332px, 100% − 64px)`; texto a 12,5 px, relleno 7 × 16 px, 5 px entre tarjetas |
| Columna 3 (detalle) | 448 px, a 16 px del borde derecho, de 52 px a 16 px en vertical |
| Con detalle abierto | `.work` pasa a empezar al **14,5 %** y deja 472 px a la derecha |
| Consola (abajo izq.) | `min(400px, 35% − 34px)` |

Las columnas **tapan parte del cerebro a propósito** (decisión del usuario): el cerebro se puede
girar, y «Solo el cerebro» oculta las columnas.

### Ancho estrecho (< 820 px de contenedor)

Todo se apila: cerebro arriba (310 px), ganglios en tira horizontal con scroll, tareas en lista a todo
el ancho, consola y detalle en flujo debajo. Sin arco. Entre 820 y 1100 px, con detalle abierto las
columnas empiezan a 14 px del borde y la consola se oculta. **Revisado menos a fondo que el ancho
normal** (§ 12).

---

## 3. Cabecera

- **Título** «Agentes».
- **Pastilla de recuentos**: un glifo de anillo + número por estado con tareas (te necesita, en curso,
  en cola, para revisar, fallida; no las hechas) y una flecha. **Al pulsarla abre la lista de tareas**:
  todas las tareas encargadas de todos los proyectos, agrupadas por estado con su cabecera, cada fila
  con el título y el nombre del proyecto. Pulsar una fila enfoca su proyecto, selecciona la tarea y
  abre su detalle. Mismo patrón que `AgentTaskList` del editor.
- **«N hechas»**: interruptor con la casilla verde marcada. Muestra u oculta las tareas hechas de toda
  la vista. No aparece si no hay ninguna. El «N hechas» al pie de cada sección hace lo mismo.
- **«Solo el cerebro» / «Volver a las tareas»**: oculta columnas y consola.

Los controles llevan **texto**: el usuario rechazó la versión solo con iconos por poco usable.

---

## 4. Columna 1 — ganglios (proyectos)

Un chip por nota-proyecto, en columna centrada verticalmente.

- **Plegado**: pestaña con la esquina doblada del color del grupo (motivo de la app), nombre, y un
  **punto por tarea viva** (no las sin encargar ni las hechas) del color de su estado; hueco si está
  en cola; latiendo si está en curso o te necesita.
- **Enfocado** (uno solo): borde y resplandor del color del grupo, y se abre mostrando:
  - sus **secciones**, una fila cada una con el nº de tareas no hechas; al pasar el ratón aparece un
    «+»; **pulsar una sección abre el alta de tarea en esa sección**;
  - la **carpeta de trabajo** (icono + ruta, monoespaciada). En ámbar y con el texto «Elegir carpeta de
    trabajo…» si falta. Pulsarla la cambia (en la app: el selector de carpetas que ya usa Run).
- **Pasar el ratón por una sección** atenúa las tareas (y sinapsis) que no son suyas.
- Pulsar un chip plegado lo enfoca. Cambiar de foco **no** cierra el detalle.
- **«+ proyecto»** al final (borde discontinuo): se convierte en un campo; `Intro` crea la nota con
  `project: true` y las secciones «Tareas» y «Notas», la enfoca y abre el alta de tarea. `Esc` o salir
  vacío cancela.

El color es el del **grupo** de la nota, igual que en el cerebro.

---

## 5. Columna 2 — tareas del proyecto enfocado

### Cabecera de la columna

Botón partido **«▶ Run N ▾»** (ámbar, el estilo primario de la app) + el texto «la cola de <proyecto>».
Ejecuta **solo la cola del proyecto enfocado**. Desactivado si no hay nada en cola. La flecha abre los
ajustes de ejecución (§ 8) justo debajo.

Con el detalle abierto esta cabecera baja 38 px (animado) para no pisar la cabecera de la vista.

### Organización

- **Por secciones**: un grupo por sección, con su nombre encima (más un filete que se desvanece) y el
  nº de tareas no hechas.
- **Dentro de cada sección, juntas por estado** y sin títulos de estado, en este orden: te necesita,
  en curso, en cola, para revisar, fallida, sin encargar, hecha.
- Al pie de cada sección: «N hechas» (si las hay y están ocultas) y **«+ tarea en <sección>»**.
- La columna hace scroll propio con los extremos desvanecidos. La tarea elegida se desplaza a la vista.

> Se probó agrupar por estado con títulos y el usuario lo descartó. No reintroducirlo.

### Arco

En ancho normal las tarjetas se desplazan en horizontal siguiendo un arco: las del centro vertical de
la columna, hasta ~43 px más a la derecha que las de los extremos (radio 1500 px). Es un `translate`
por tarjeta recalculado al hacer scroll.

### Tarjeta de tarea

Prima el texto de la tarea; lo demás está en el detalle.

- **Casilla de estado** a caballo del borde izquierdo: es el dibujo **`AgentTaskBoxGlyph`** del editor
  (`src/components/Editor/AgentGlyphs.tsx`), no un icono nuevo:

  | Estado | Casilla | Color |
  |---|---|---|
  | sin encargar | casilla lisa | `--text-muted` |
  | en cola | borde discontinuo + chispa en la esquina | gris; chispa `--accent` |
  | en curso | el borde «corre» | `--cyan` |
  | te necesita | brilla, punto de la esquina latiendo | `--accent-3` |
  | para revisar | punto en la esquina | `--purple` |
  | fallida | punto en la esquina | `--red` |
  | hecha | rellena + tick + chispa | `--accent-2` (verde) |

  **Ojo:** en el editor lo hecho por un agente va en cian. Aquí el usuario lo quiere **en verde**.
- **Título**, hasta 2 líneas. Delante, un punto rojo si la importancia es alta.
- **Segunda fila**, solo si hay algo que decir, en este orden: icono de «tiene descripción», la fecha
  **solo si es hoy (ámbar) o vencida (rojo)**, y el estado: `60% · qué está haciendo` (en curso),
  «Te necesita», «Falló». En cola, para revisar, sin encargar y hecha no hay texto de estado.
- **Barra de progreso** fina en el borde inferior, solo en curso.
- **Botones de acción** a la derecha del título, solo icono con tooltip:

  | Estado | Botones | Visibles |
  |---|---|---|
  | sin encargar | `+` poner en cola | al pasar el ratón |
  | en cola | `–` quitar de la cola, `▶` ejecutar solo esta | **siempre** |
  | te necesita | terminal: responder | siempre |
  | para revisar | `✓` marcar como hecha | siempre |
  | fallida | reintentar (vuelve a la cola) | al pasar el ratón |
  | en curso, hecha | ninguno | — |

- **Pulsar la casilla**: sin encargar → en cola; en cola → sin encargar; cualquier otro estado →
  selecciona la tarea.
- **Pulsar el cuerpo**: selecciona la tarea y abre el detalle (pulsar otra vez lo cierra).
- **Superficie**: fondo `--card` (más claro que los paneles en oscuro) y filete fino. Borde cian en
  curso, ámbar si te necesita, verde sutil si hecha. **Sin encargar** es la única sin fondo y con borde
  discontinuo. Elegida: borde ámbar con resplandor y fondo opaco.

**No van en la tarjeta** (el usuario los quitó): equipo y tiempo, número de orden en la cola, nombre de
la sección.

---

## 6. Columna 3 — detalle de la tarea

Se abre al elegir **cualquier** tarea, sea cual sea su estado (no solo hecha / para revisar). Entra
deslizándose desde la derecha; las columnas 1 y 2 se desplazan a la izquierda para hacerle sitio y
vuelven al cerrarla.

**Solo se cierra con su `✕` o pulsando de nuevo la tarjeta elegida.** No la cierran `Esc`, cambiar de
proyecto, descartar la tarea, crear un proyecto ni pulsar en el cerebro: el detalle sigue mostrando
la misma tarea aunque su proyecto ya no sea el enfocado.

Contenido, de arriba abajo, **todo a la vista y sin plegar** (el usuario pidió quitar los «ver
completo»); la columna hace scroll si no cabe:

1. Glifo de anillo + nombre del estado en su color, y `✕`.
2. Título de la tarea.
3. `Proyecto / Sección`.
4. Datos en línea: importancia, fecha, nº de subtareas, `agente · equipo · tiempo`.
5. **Encargo**: la descripción completa (párrafos, listas, código en línea).
6. **Línea de tiempo**: cuándo empezó y en qué rama; después, según el estado, qué hace ahora, que
   preguntó, que falló o cuándo terminó con nº de ficheros y commits.
7. Según el estado:
   - en curso: qué hace + porcentaje + barra;
   - te necesita: «Su pregunta» + «Se le contesta en su terminal.»;
   - fallida: «Por qué falló»;
   - para revisar / hecha: **Informe** completo + **Cambios** (lista de ficheros con `+N −M`);
   - sin encargar / en cola: una línea explicativa.
8. Pie fijo: «↗ nota», «Copiar prompt», «Descartar» (texto, peso bajo) y **una** acción principal:

   | Estado | Acción principal |
   |---|---|
   | sin encargar | Poner en cola |
   | en cola | ▶ Ejecutar ahora |
   | te necesita | Abrir su terminal |
   | para revisar | Marcar como hecha |
   | fallida | Volver a la cola |
   | hecha | Reabrir |

Borde **gris** (el usuario quitó el de acento). Una sinapsis gris une la tarjeta elegida con la columna.

### Con el detalle abierto

- **El cerebro pasa a segundo plano**: un velo sobre él lo desenfoca (9 px), lo desatura (0,45) y lo
  oscurece (fondo `--bg-editor` al 58 %), con transición de 0,6 s. Las rutas que salen del cerebro
  bajan de intensidad a la vez.
- **Tarjetas y ganglios pasan a fondo opaco.**
- **Las tareas no elegidas bajan al 50 % de opacidad** (y sus sinapsis al 45 %), para que se vea cuál
  está elegida. La elegida se queda a opacidad completa, con su borde ámbar.
- La consola se reduce a solo el botón «Run all» y el prompt se oculta.

---

## 7. Consola del líder y prompt (abajo a la izquierda)

### Consola

- Estado: «<Agente> dirige N tareas» (punto latiendo, en cian) o «Ningún agente trabajando».
- **«▶ Run all · N ▾»** en **naranja** (`--orange`), para distinguirlo del Run de proyecto. Ejecuta la
  cola de **todos** los proyectos. La flecha abre los ajustes (§ 8) encima de la consola.
- Línea de resumen de la configuración, pulsable (abre los mismos ajustes):
  `Claude Code (Opus · high) · en paralelo · deja para revisar · sin commit`.
- Un **carril por tarea en curso** (de cualquier proyecto): título, porcentaje y barra. Pulsarlo lleva
  a esa tarea.

### Prompt

Campo «Encarga una tarea a un agente» que crece con el texto (hasta ~8 líneas, luego scroll). Debajo,
el destino explícito y editable: `en [Proyecto ▾] / [Sección ▾]`. Cambiar el proyecto cambia el foco.
La tecla `/` lo enfoca desde cualquier sitio.

### Alta de tarea (igual en el prompt y en «+ tarea en <sección>»)

- `Intro` → la crea **en cola**.
- `Ctrl/⌘ + Intro` → la crea y **la ejecuta**.
- `Mayús + Intro` → salto de línea. **La primera línea es el título; el resto, la descripción.**
- El alta en sitio se queda abierta para encadenar varias; se cierra con `Esc` o al salir vacía.
- Una tarea creada aquí nace siempre en cola (esta vista es para tareas de agentes).

---

## 8. Ajustes de ejecución

Un popover pequeño, el mismo desde las dos flechas de Run. **Son los ajustes que ya existen** en
Ajustes → AI → Agent tasks y en el menú ▾ de Run del editor; aquí solo cambia dónde se ven.

| Fila | Control | Ajuste existente |
|---|---|---|
| Agente | desplegable con dos grupos: Terminal / App de escritorio | Run with |
| Modelo | segmentado (solo con agentes de terminal que lo admiten) | Model |
| Esfuerzo | escala de 5 barras + «Por defecto» (solo Claude Code) | Effort |
| Varias tareas | En paralelo / Una tras otra | Several tasks |
| Al terminar | Dejar para revisar / Marcarla hecha | When finished |
| Git | Sin commit / Hacer commit | Git commit |
| Informes | días hasta borrarlos (0 = nunca) | Discard reports |
| Carpeta | la del proyecto enfocado | carpeta por nota |

Reutilizar la lógica y las restricciones reales (sin Node en Windows, Microsoft Store, comando o
enlace personalizado con confirmación del sistema…): ver `patterns.md` § «Tareas con agentes:
ejecutar».

---

## 9. Sinapsis (las líneas)

Se dibujan en un canvas 2D por encima del cerebro y por debajo de las tarjetas, **en el lenguaje del
wireframe**: polilíneas angulares con un punto en cada vértice, no curvas suaves. El usuario eligió el
trazo angular frente al curvo.

**Geometría**: una Bézier cúbica de tangentes horizontales, muestreada cada ~36 px (entre 3 y 13
tramos), con cada vértice desplazado en perpendicular una cantidad aleatoria fija por línea (hasta
`min(7 px, 3,5 % de la longitud)`, cero en los extremos). Puntos de 1 px de radio en los vértices. En
oscuro, una pasada ancha (4 px, 10 % de opacidad, modo aditivo) bajo la línea de 1 px da el resplandor.

**Qué líneas hay**:

| De → a | Aspecto |
|---|---|
| Nodo de la nota en el cerebro → su ganglio | color del grupo; más intensa en el enfocado; atenuada si el nodo está en la cara de atrás |
| Núcleo del cerebro → nota con agentes trabajando | cian con impulsos (es «el líder») |
| Sección del ganglio → cada tarea suya | según el estado de la tarea (abajo) |
| Sección → «+ tarea» | punteada gris; ámbar discontinua mientras se escribe |
| Tarjeta elegida → columna de detalle | gris |

**El estado va en la sinapsis**:

| Estado | Línea |
|---|---|
| sin encargar | punteada, gris |
| en cola | discontinua, color del grupo |
| en curso | cian, continua, con impulsos hacia la tarea |
| te necesita | ámbar, la opacidad late, impulsos hacia el ganglio |
| para revisar | morada, continua |
| fallida | roja, **cortada** al 70 % con un anillo en el corte |
| hecha | verde, tenue |

**El cerebro reacciona** con sus efectos reales: una onda (`fireWave`) en la nota al crear una tarea,
al ejecutar y al terminar; y las notas con agentes en curso quedan encendidas (`highlightedNoteIds`,
el mismo efecto que las citas del chat).

---

## 10. Animaciones

Requisito del usuario: **nada se redibuja de golpe**; cada elemento se anima por separado.

| Qué | Cómo |
|---|---|
| Curva común | `cubic-bezier(.2,.8,.2,1)` |
| Abrir/cerrar el detalle | 0,46 s: la columna entra (28 px + opacidad) y las columnas 1–2 se desplazan |
| Velo del cerebro | 0,6 s |
| Tarjeta que cambia de sitio | se desliza a su nueva posición (FLIP), 0,38 s |
| Tarjeta nueva | aparece subiendo 6 px, 0,32 s, escalonadas 38 ms al cambiar de proyecto |
| Cambio de estado | la casilla «salta» (escala 1,7 → 1, 0,46 s) y la tarjeta da un destello del color nuevo (0,7 s) |
| Sinapsis nueva | crece desde la sección, 0,5 s, escalonadas 45 ms |
| Progreso | la barra avanza con transición de 0,6 s; el número se actualiza en el sitio |
| Cerebro | balanceo lento de ±0,2 rad; se detiene cuando el usuario lo arrastra |

Todo se apaga con `prefers-reduced-motion`.

En React esto sale de forma natural con claves estables por tarea; el parcheador de DOM del prototipo
(`morph` / `kids`) existe solo porque el prototipo no usa React.

---

## 11. Qué es real y qué es simulación en el prototipo

**Real**: el cerebro. `brain.js` es `BrainScene` empaquetado tal cual (ver `build.mjs`).

**Simulado** (no copiar):

- Los proyectos, tareas, informes, ramas, tiempos («12 min», «hace 8 min»), la lista de cambios y los
  nombres de equipo son datos de ejemplo escritos a mano.
- El progreso es un temporizador que suma porcentaje y acaba en «para revisar».
- «Run» solo cambia el estado; no lanza nada. «Abrir su terminal» y «Copiar prompt» no hacen nada real.
- «Elegir carpeta» inventa una ruta.
- La lista de modelos es de ejemplo.

**Aprovechable casi tal cual** (portar a TypeScript):

- `path()`, `syn()`, `cut()`, `at()`, `node()`: el dibujo de sinapsis de § 9.
- El cálculo del arco de las tarjetas.
- Los valores de este documento.

---

## 12. Trabajo necesario en la app, y lo que queda abierto

### Hay que construir

1. **`project: true` en el frontmatter.** Toca el formato de nota y sus **tres espejos**, el CLI
   (subir `CLI_VERSION` y la skill a la vez) y el móvil. Zona delicada: requiere `reviewer`.
2. **Proyección de nodos a pantalla.** El prototipo usa el handle de depuración de `BrainScene`
   (`window.__nfBrain`, forzado en `build.mjs`). Hace falta una API propia en `SceneApi` que dé la
   posición en pantalla de un nodo y si mira a la cámara, además de `fireWave` y el control de la
   cámara (desplazar el centro con `setViewOffset`, parar la autorrotación).
3. **La vista** como componentes React, con el estado en Zustand y todos los textos en i18n
   (`src/i18n/en/` como fuente y `es/` como espejo). Los textos del prototipo están en español solo
   por comodidad.
4. **Conectarla a lo que ya existe**: lectura y escritura de tareas, cola, Run, informes y ajustes.
   Nada de esto se reimplementa.
5. **Entrada a la vista.** No está diseñado cómo se llega a ella desde la vista cerebro actual.
6. **Documentar** al cerrar: `patterns.md`, la skill `noteflow-features` y, si procede, la web.

### Sin decidir

- **Pose del cerebro.** Con la pose por defecto varias notas-proyecto caen en la cara de atrás y su
  línea sale atenuada. Opciones: otra pose fija, o girar hacia el proyecto al enfocarlo.
- **`interrupted` y `no-signal`**: sin diseño en esta vista.
- **Orden de la cola** cuando se ejecuta «una tras otra»: se quitó el número; ahora es el orden en
  pantalla. No hay forma de reordenar.
- **Editar una tarea** (título o descripción) desde la vista: no existe; hoy solo se puede en la nota.
- **Deshacer.** El editor deshace cada acción de agente con `Ctrl+Z` y mantiene los informes
  coherentes. Esta vista no define su deshacer.
- **Muchos proyectos o muchas tareas** (10+ proyectos, 20+ tareas): no probado.
- **Notas cifradas, vinculadas y la opción de Agent tasks apagada**: aplican las reglas del editor,
  pero la vista no tiene diseñados esos estados ni el estado vacío (sin proyectos).

### No verificado

- **Rendimiento y fluidez con GPU.** Todo se revisó en un navegador con WebGL por software (≈4 fps) y,
  en casi todas las rondas, con el cerebro desactivado. El prototipo mide posiciones del DOM en cada
  fotograma; con un vault real hay que medirlo.
- **Tema claro**: comprobado solo en las primeras versiones. En claro `--orange` y `--accent` son casi
  el mismo tono, así que los dos botones Run se parecen.
- **Ancho estrecho**: comprobado a medias; las últimas rondas no se miraron ahí.
- **Teclado y lectores de pantalla**: hay foco visible y `aria-*` básicos, sin revisión de accesibilidad.
