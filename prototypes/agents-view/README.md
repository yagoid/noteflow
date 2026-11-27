# Prototipo: vista de tareas con agentes sobre el cerebro

Prototipo navegable (no es código de la app). Abre `index.html` en el navegador: no necesita servidor.

**Para implementarlo en la app, lee [`SPEC.md`](SPEC.md):** qué hay que construir, qué es simulación y qué queda por decidir.

- `index.html` — la vista: ganglios de proyecto, abanico de tareas, sinapsis, consola del líder y ajustes de Run. Datos de ejemplo y simulación dentro del propio fichero.
- `brain.js` — el `BrainScene` real de `src/components/Brain/` empaquetado. Generado; se regenera con:

  ```bash
  node prototypes/agents-view/build.mjs
  ```

  (desde la raíz del repo, con `npm install` hecho). Hay que regenerarlo si cambia el cerebro.
- `entry.jsx`, `theme-stub.js`, `build.mjs` — el empaquetado. Usa el handle de depuración de `BrainScene` para proyectar los nodos a pantalla; la implementación real necesitará esa proyección como API propia.
