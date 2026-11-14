/* NoteFlow brain — the 3D brain as a <noteflow-brain> custom element.

   Hand port of the app's src/components/Brain/BrainScene.tsx (the approved "Corriente afinada" look
   with the "Bandas" relief) to three r128 — the global build plus the examples/js post-processing
   that nf-load.js loads. Everything that is not three.js comes generated from the app's own pure
   modules (see docs/scripts/build-brain.mjs): the mesh (NF.mesh), the sample graph, its layout and
   the derived scene data (NF.graph), and every number of the look plus the GLSL (NF.look). So this
   file carries no magic number of the look, and when the app's scene changes, this file is what
   has to follow by hand.

   Same colour pipeline as the app, which emulates r128 on purpose: theme triples go in untouched
   (setRGB, no colour management), linear output, 8-bit composer target — r128's defaults.

   Attributes (all optional):
     data-controls       orbit drag + wheel zoom + hover/click on nodes (default: ambient, no input)
     data-labels         HTML labels for the nodes (levels by zoom, never overlapping)
     data-transparent    transparent canvas over the page (no backdrop floor, no vignette, no grain)
     data-content-edges  "false" hides the AI content relations at start (user relations stay)
     data-cam            camera distance to its target (default: the app's, ≈ 3.4), along the
                         app's three-quarter direction (BRAIN_LOOK.camera)
     data-target-y       vertical offset of the orbit target from the app's (default 0)
     data-shift-x        shifts the picture sideways, as a fraction of the width (view offset;
                         it fades out in boxes narrower than the app's fit aspect)
     data-rotate-speed   auto-rotation speed (default: the app's)
   Methods: setHighlight(Set<noteId>) — notes cited by an answer · setThinking(bool) — the chat is
   writing · setContentEdges(bool) · setScroll(0..1) — the hero's dive toward the brain ·
   resetView() · _rebuildAll() — re-read the palette after a `data-theme` change.
   Event: `nodeactivate` (detail: { id, info, clientX, clientY }) when a node is clicked.

   Cost. The loop only runs while the element is on screen and the tab visible. The mesh, the
   layout and the scene data are built once per page and shared by every instance. Phones and
   tablets (pointer: coarse) get pixel ratio ≤ 1.5 and no bloom. With prefers-reduced-motion — and
   on WebGL without a GPU (SwiftShader, llvmpipe…), where this scene costs a few hundred ms per
   frame — nothing moves by itself and frames are drawn only on demand (0 frames at rest); without
   a GPU the ambient instances draw a single settled frame and ignore the page's signals. */
(function () {
  const NF = (window.NF = window.NF || {});
  const T = window.THREE;
  if (!T || !NF.mesh || !NF.graph || !NF.look) { console.error('[nf-brain] three.js or the NF modules are missing'); return; }
  const G = NF.graph, L = NF.look.BRAIN_LOOK, BUDGET = NF.look.BRAIN_BUDGET, SH = NF.look.shaders;
  const RING_SIZE = NF.look.RING_SIZE, CENTER_SIZE = NF.look.CENTER_SIZE, softNode = NF.look.softNode;
  const RING_BY_TIER = [RING_SIZE.group, RING_SIZE.folder, RING_SIZE.note, RING_SIZE.section];
  const TIER_GROUP = G.TIER_GROUP, TIER_FOLDER = G.TIER_FOLDER, TIER_NOTE = G.TIER_NOTE;
  const SegmentBuffer = G.SegmentBuffer, FLAG_INTERIOR = G.FLAG_INTERIOR, FLAG_CONTENT = G.FLAG_CONTENT;

  // Draw order: same slots as the app (three would otherwise sort these whole-brain layers by an
  // arbitrary bounding-sphere depth). The depth skin is opaque and always drawn first.
  const ORDER = {
    skin: -20,
    farLines: -9, farDots: -8.9, motes: -8.8,
    floor: -8,
    wire: 0, wireHidden: 0.1, dots: 0.2, dotsHidden: 0.3, synapses: 0.4, sparks: 0.5,
    routes: 1, routesHidden: 1.1,
    impulses: 2, glow: 2.1, sweeps: 2.2,
    nodes: 3, nodesHidden: 3.1,
    marker: 4,
  };
  const SWEEP_FREE = 0, SWEEP_HOVER = 1, SWEEP_THINK = 2;
  const LABEL_BINS = 256;
  const FONT_UI = "'Inter',system-ui,sans-serif";
  const FONT_APP = "var(--app-font-family,'JetBrains Mono','Fira Code','Cascadia Code',monospace)";
  const LABEL_FONT = [
    `font-family:${FONT_APP};font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;`, // group
    `font-family:${FONT_UI};font-size:10.5px;font-weight:500;`, // folder
    `font-family:${FONT_UI};font-size:11px;font-weight:400;`,   // note
    `font-family:${FONT_UI};font-size:10px;font-weight:400;`,   // section
  ];
  // How far setScroll(1) pulls the camera in (fraction of its distance): the brain swells as the
  // hero scrolls away, without the camera entering it.
  const DIVE = 0.45;
  const EMPTY_GEOMETRY = new T.BufferGeometry();

  const rawColor = (c) => new T.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
  const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const cssColor = (c) => `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)})`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function canvasTexture(draw) {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    draw(c.getContext('2d'), s);
    const tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }
  const makeDotTexture = () => canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });
  const makeRingTexture = () => canvasTexture((ctx, s) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2); ctx.stroke();
  });
  const makeGlowTexture = () => canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });

  /** One instanced quad per segment (layout in the app's brainBuffers.ts / LINE_VS). */
  function segmentGeometry(segments) {
    const d = segments.finish();
    const g = new T.InstancedBufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.setAttribute('aA', new T.InstancedBufferAttribute(d.a, 3));
    g.setAttribute('aB', new T.InstancedBufferAttribute(d.b, 3));
    g.setAttribute('aCol', new T.InstancedBufferAttribute(d.col, 4, true));
    // no arc: the attribute stays disabled (only for layers that draw whole lines)
    if (d.arc) g.setAttribute('aArc', new T.InstancedBufferAttribute(d.arc, 2));
    g.setAttribute('aRevPh', new T.InstancedBufferAttribute(d.rev, 4, true));
    g.setAttribute('aWidth', new T.InstancedBufferAttribute(d.width, 1));
    g.instanceCount = d.count;
    return g;
  }

  // ── once per page: the WebGL probe, the mesh, the sample graph laid out on it ──
  // Software WebGL (no GPU) is told apart by the renderer's name or, failing that, by a context
  // that refuses to be created with failIfMajorPerformanceCaveat where a plain one is fine.
  function probeWebGL() {
    const lose = (gl) => { try { const e = gl && gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (_) { /* nothing to free */ } };
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (!gl) return { webgl: false, soft: false, name: '' };
      let name = String(gl.getParameter(gl.RENDERER) || '');
      // Chromium and Safari mask RENDERER; Firefox does not (and warns if asked for the extension)
      if (/^webkit webgl$/i.test(name)) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || name);
      }
      let soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      lose(gl);
      if (!soft) {
        const attrs = { failIfMajorPerformanceCaveat: true };
        const strict = document.createElement('canvas').getContext('webgl2', attrs) || document.createElement('canvas').getContext('webgl', attrs);
        if (strict) lose(strict); else soft = true;
      }
      return { webgl: true, soft, name };
    } catch (_) {
      return { webgl: false, soft: false, name: '' };
    }
  }
  let page = null;
  function pageState() {
    if (page) return page;
    const mesh = NF.mesh.getBrainMesh();
    const data = G.buildBrainData(mesh, G.buildSampleGraph());
    const picks = G.strongestEdges(data.edgePaths, BUDGET.impulseEdges);
    page = {
      gl: probeWebGL(), mesh, data,
      rev: G.entranceCoords(mesh),
      faces: G.outwardFaces(mesh),
      impulses: picks.map((ei) => ({ ei, fb: G.fibre(mesh.positions, data.edgePaths[ei].seq, BUDGET.impulseSubdiv) })),
    };
    return page;
  }

  function readOpts(el) {
    const num = (name, fallback) => { const v = parseFloat(el.getAttribute(name)); return Number.isFinite(v) ? v : fallback; };
    return {
      controls: el.hasAttribute('data-controls'),
      labels: el.hasAttribute('data-labels'),
      transparent: el.hasAttribute('data-transparent'),
      contentEdges: el.getAttribute('data-content-edges') !== 'false',
      cam: num('data-cam', 0),
      targetY: num('data-target-y', 0),
      shiftX: num('data-shift-x', 0),
      rotateSpeed: num('data-rotate-speed', L.motion.rotate),
    };
  }

  class NoteflowBrain extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = 'block';
      if (getComputedStyle(this).position === 'static') this.style.position = 'relative';
      const opts = (this._opts = readOpts(this));
      if (this._contentEdges === undefined) this._contentEdges = opts.contentEdges;
      if (this._thinking === undefined) this._thinking = false;
      if (this._scroll === undefined) this._scroll = 0;

      const container = document.createElement('div');
      // Ambient brains overlay scrollable content (hero, footer): the whole container must be
      // transparent to hit-testing or touch scrolling dies on top of them. The interactive one
      // keeps pan-y: vertical swipes still scroll the page, horizontal drags rotate the brain.
      container.style.cssText = opts.controls
        ? 'position:absolute;inset:0;touch-action:pan-y;'
        : 'position:absolute;inset:0;pointer-events:none;';
      this.appendChild(container);
      this._container = container;
      this._start();
    }
    disconnectedCallback() {
      if (this._cleanup) this._cleanup();
      this._cleanup = null;
      if (this._container && this._container.parentNode === this) this.removeChild(this._container);
      this._container = null;
      this._mounted = false;
    }

    // The scene reads these on its next frame; _kick wakes a loop that is resting.
    setHighlight(set) { this._lit = set; if (this._kick) this._kick(); }
    setThinking(b) { this._thinking = !!b; if (this._kick) this._kick(); }
    setContentEdges(b) { this._contentEdges = !!b; if (this._kick) this._kick(); }
    setScroll(p) { this._scroll = p < 0 ? 0 : p > 1 ? 1 : p || 0; this._scrolled = true; }
    resetView() { if (this._resetView) this._resetView(); }

    _start() {
      const env = pageState();
      if (!env.gl.webgl) return; // no WebGL at all: the element stays empty (the page shows through)
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: false, alpha: this._opts.transparent });
      } catch (err) {
        console.warn('[nf-brain] WebGL unavailable', err);
        return;
      }
      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      if (!this._opts.controls) canvas.style.pointerEvents = 'none';
      this._container.appendChild(canvas);
      // The renderer (and its context) lives as long as the element; a theme change rebuilds
      // everything drawn with it.
      let teardown = this._buildScene(renderer, env);
      this._rebuildAll = () => { if (teardown) teardown(); teardown = this._buildScene(renderer, env); };
      this._cleanup = () => {
        if (teardown) teardown();
        teardown = null;
        this._rebuildAll = null;
        renderer.dispose();
        renderer.forceContextLoss();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    }

    _buildScene(renderer, env) {
      const host = this, container = this._container, opts = this._opts;
      const canvas = renderer.domElement;
      const mesh = env.mesh, data = env.data, rev = env.rev;
      const P = mesh.positions, V = mesh.vertexCount;
      const [cx, cy, cz] = mesh.boundCenter;
      const radius = mesh.boundRadius;
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      // Without a GPU: reduced motion, plus a focus that snaps instead of easing, a hover sweep
      // that shows whole at once, no "thinking" sweeps, and ambient instances that ignore the page.
      const still = env.gl.soft;
      let reduced = still || motionQuery.matches;
      const lowPower = window.matchMedia('(pointer: coarse)').matches;
      const maxDpr = lowPower ? 1.5 : 2;
      const transparent = opts.transparent;
      const live = {
        lit: () => (still && !opts.controls ? undefined : host._lit),
        thinking: () => !still && host._thinking,
      };

      const disposables = [];
      const track = (x) => { disposables.push(x); return x; };

      // ── colour pipeline (as the app: untouched triples, no output encoding, 8-bit target) ──
      const pal = G.readBrainPalette();
      const bg = rawColor(pal.bg), text = rawColor(pal.text);
      const bgLum = luma(bg);
      const isDark = bgLum < 0.5;
      const glowBlend = isDark ? T.AdditiveBlending : T.NormalBlending;
      const edgeOpacity = (base) => (isDark ? base : Math.min(L.color.lightOpacityMax, base * L.color.lightOpacity));
      const energy = L.color.energy;
      const colorCache = new Map();
      // A group colour, desaturated; darkened on light themes (--text is exempt from the desaturation).
      const colorOf = (cssVar) => {
        let c = colorCache.get(cssVar);
        if (!c) {
          c = rawColor(pal.color(cssVar));
          if (cssVar !== '--text') {
            const g = luma(c), s = L.color.saturation;
            c.setRGB(g + (c.r - g) * s, g + (c.g - g) * s, g + (c.b - g) * s);
          }
          if (!isDark) c.multiplyScalar(L.color.lightDarken);
          colorCache.set(cssVar, c);
        }
        return c;
      };

      // ── renderer / scene / camera ──
      let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      let W = container.clientWidth, H = container.clientHeight;
      renderer.setPixelRatio(dpr);
      if (transparent) renderer.setClearColor(0x000000, 0); else renderer.setClearColor(bg, 1);
      renderer.setSize(Math.max(1, W), Math.max(1, H));
      if (opts.controls) canvas.style.cursor = 'grab';

      const scene = new T.Scene();
      if (!transparent) scene.background = bg;

      // The app's three-quarter view, orbiting the centre of the cerebrum. data-cam sets the
      // distance along that same direction, data-target-y moves the target (and the camera with it).
      const target0 = new T.Vector3(L.camera.target[0], L.camera.target[1] + opts.targetY, L.camera.target[2]);
      const dir0 = new T.Vector3(L.camera.position[0] - L.camera.target[0], L.camera.position[1] - L.camera.target[1], L.camera.position[2] - L.camera.target[2]);
      const baseDist = opts.cam > 0 ? opts.cam : dir0.length();
      dir0.normalize();
      const camera = new T.PerspectiveCamera(L.camera.fov, W > 0 && H > 0 ? W / H : 1, 0.1, 100);
      camera.position.copy(target0).addScaledVector(dir0, baseDist);
      const controls = new T.OrbitControls(camera, canvas);
      // Damping trails a drag by dozens of frames: not where every frame is expensive.
      controls.enableDamping = !still;
      controls.dampingFactor = L.camera.damping;
      controls.enablePan = false;
      controls.minDistance = opts.controls ? L.camera.minDistance : 0.1;
      controls.maxDistance = L.camera.maxDistance;
      controls.target.copy(target0);
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = opts.rotateSpeed;
      controls.enabled = opts.controls;
      if (!opts.controls) { controls.enableZoom = false; controls.enableRotate = false; }
      // (In a box narrower than the app's fit aspect — a phone in portrait — the shift fades out
      // with the aspect: the camera has pulled back and the brain would leave the picture.)
      const applyViewOffset = () => {
        const shift = W > 0 && H > 0 ? opts.shiftX * Math.min(1, W / H / L.camera.fitAspect) : 0;
        if (shift) camera.setViewOffset(W, H, -shift * W, 0, W, H);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
      };
      // A narrow box pulls the camera back so the brain still fits; label tiers scale with it.
      let fitK = 1;
      const fitCamera = () => {
        const k = W > 0 && H > 0 ? Math.max(1, L.camera.fitAspect / (W / H)) : 1;
        camera.position.sub(controls.target).multiplyScalar(k / fitK).add(controls.target);
        controls.maxDistance = L.camera.maxDistance * k;
        fitK = k;
      };
      fitCamera();
      // a theme change keeps the view where it was
      if (host._pose) {
        camera.position.fromArray(host._pose.position);
        controls.target.fromArray(host._pose.target);
        controls.autoRotate = host._pose.autoRotate && !reduced;
        fitK = host._pose.fitK;
        controls.maxDistance = L.camera.maxDistance * fitK;
      }
      applyViewOffset();

      // ── uniforms shared by every material ──
      const U = {
        uTime: { value: 0 },
        uCenter: { value: new T.Vector3(cx, cy, cz) },
        uRadius: { value: radius },
        uReveal: { value: 2 },
        uRevealOn: { value: 0 },
        uWaves: { value: new Float32Array([0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1]) },
        uWaveGain: { value: Math.max(L.motion.waveGain, L.hoverWave) },
        uFade: { value: new T.Vector2(L.fade[0], L.fade[1]) },
        uZBias: { value: L.zBias },
        uRes: { value: new T.Vector2(Math.max(1, W) * dpr, Math.max(1, H) * dpr) },
        uPx: { value: dpr },
        uScale: { value: Math.max(1, H) * dpr * 0.5 },
        uShowContent: { value: host._contentEdges ? 1 : 0 },
        uFocusAmt: { value: 0 },
        uLit: { value: new T.Vector2(0, 1) },
      };
      const shared = () => ({
        uTime: U.uTime, uCenter: U.uCenter, uRadius: U.uRadius, uReveal: U.uReveal, uRevealOn: U.uRevealOn,
        uWaves: U.uWaves, uWaveGain: U.uWaveGain, uFade: U.uFade, uZBias: U.uZBias,
      });

      // ── material factories: three programs for the whole brain (lines, dots, nodes) ──
      // (r128 draws a transparent double-sided material in one pass: no forceSinglePass needed.)
      const lineMaterial = (o) => track(new T.ShaderMaterial({
        uniforms: Object.assign(shared(), {
          uRes: U.uRes, uPx: U.uPx, uShowContent: U.uShowContent,
          uShape: { value: new T.Vector4(o.width, o.depthW || 0, o.interior == null ? 1 : o.interior, o.back == null ? 1 : o.back) },
          uTone: { value: new T.Vector4(o.mul == null ? 1 : o.mul, o.revGlow || 0, o.near || 0, o.boost || 0) },
          uCull: { value: new T.Vector2(o.skipInterior ? 1 : 0, o.skipBelow || 0) },
          uOpacity: { value: o.opacity }, uAA: { value: L.aa },
          uFlow: { value: new T.Vector4(o.flow || 0, o.flowBase == null ? 1 : o.flowBase, o.freq == null ? 1 : o.freq, o.speed || 0) },
          uSweep: { value: new T.Vector4(o.len == null ? 0.3 : o.len, o.head == null ? 99 : o.head, 1, o.tail == null ? 1 : o.tail) },
        }),
        vertexShader: SH.LINE_VS, fragmentShader: SH.LINE_FS, transparent: true, depthWrite: false,
        depthTest: o.depthTest === true, depthFunc: o.depthFunc || T.LessEqualDepth,
        blending: o.add ? T.AdditiveBlending : T.NormalBlending, side: T.DoubleSide,
      }));
      const dotMaterial = (o) => track(new T.ShaderMaterial({
        uniforms: Object.assign(shared(), {
          uScale: U.uScale,
          uDot: { value: new T.Vector4(o.size, o.back == null ? 1 : o.back, o.interior == null ? 1 : o.interior, o.weighted ? 1 : 0) },
          uAnim: { value: new T.Vector4(0, 0, o.boost || 0, o.near || 0) },
          uColor: { value: o.color.clone() }, uOpacity: { value: o.opacity }, uSoft: { value: o.soft },
        }),
        vertexShader: SH.DOT_VS, fragmentShader: SH.DOT_FS, transparent: true, depthWrite: false,
        depthTest: o.depthTest, depthFunc: o.depthFunc || T.LessEqualDepth, blending: glowBlend, side: T.DoubleSide,
      }));
      const haloGlow = (isDark ? L.nodes.glow : L.nodes.glow * L.nodes.glowLight) * energy;
      const haloPeak = haloGlow * (1 + 1.5 * 4 * U.uWaveGain.value);
      const haloCut = 1.05 * L.nodes.glowSize * Math.sqrt(0.2 * Math.log(Math.max(Math.E, haloPeak / 0.004)));
      const nodeMaterial = (mode, o) => track(new T.ShaderMaterial({
        uniforms: Object.assign(shared(), {
          uScale: U.uScale, uFocusAmt: U.uFocusAmt, uLit: U.uLit,
          uNode: { value: new T.Vector4(o.ext, o.back, mode, o.opacity == null ? 1 : o.opacity) },
          uDimTo: { value: 1 - L.focusDim }, uCore: { value: CENTER_SIZE * L.nodes.core }, uWaveSize: { value: L.nodes.waveSize },
          uRingW: { value: L.nodes.ringW }, uCoreSoft: { value: L.nodes.coreSoft },
          uGlow: { value: haloGlow }, uGlowSize: { value: L.nodes.glowSize }, uHaloCut: { value: haloCut },
        }),
        vertexShader: SH.NODE_VS, fragmentShader: SH.NODE_FS, transparent: true, depthWrite: false,
        depthTest: o.depthTest, depthFunc: o.depthFunc || T.LessEqualDepth,
        blending: o.add ? T.AdditiveBlending : T.NormalBlending, side: T.DoubleSide,
      }));
      const addMesh = (geo, mat, order) => { const m = new T.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m; };
      const addPoints = (geo, mat, order) => { const p = new T.Points(geo, mat); p.frustumCulled = false; p.renderOrder = order; scene.add(p); return p; };
      // materials whose opacity follows the focus dim (uOpacity = base × dim)
      const dimmed = [];
      const dims = (mat) => { dimmed.push({ u: mat.uniforms.uOpacity, base: mat.uniforms.uOpacity.value }); return mat; };

      const dotTex = track(makeDotTexture()), ringTex = track(makeRingTexture());

      // ════════════════ static scaffold (mesh + theme) ════════════════
      // depth skin: invisible, writes depth only (front faces: every part is wound outwards)
      const positionAttr = new T.BufferAttribute(P, 3);
      {
        const g = track(new T.BufferGeometry());
        g.setAttribute('position', positionAttr);
        g.setIndex(new T.BufferAttribute(env.faces, 1));
        const skin = new T.Mesh(g, track(new T.MeshBasicMaterial({
          colorWrite: false, depthWrite: true, depthTest: true, side: T.FrontSide,
          polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
        })));
        skin.frustumCulled = false; skin.renderOrder = ORDER.skin;
        scene.add(skin);
      }

      // scaffold wire: gyrus outlines bright, inside a gyrus dimmer, inside a sulcus almost gone
      const wireCol = text.clone().lerp(bg, isDark ? L.wire.lerp : L.wire.lerpLight);
      const wireBase = isDark ? L.wire.opacity : L.wire.light;
      let wireMat;
      {
        const E = mesh.edges.length / 2;
        const S = new SegmentBuffer(E, false);
        for (let e = 0; e < E; e++) {
          const ew = mesh.edgeW[e];
          if (ew <= 0) continue;
          const u = mesh.edges[e * 2], w = mesh.edges[e * 2 + 1];
          const inner = mesh.surface[u] === 0 || mesh.surface[w] === 0;
          let r, g, b;
          if (isDark) {
            const k = Math.min(1, ew);
            r = wireCol.r * k; g = wireCol.g * k; b = wireCol.b * k;
          } else {
            const k = Math.min(1, L.wire.lightFloor + (1 - L.wire.lightFloor) * ew);
            r = lerp(bg.r, wireCol.r, k); g = lerp(bg.g, wireCol.g, k); b = lerp(bg.b, wireCol.b, k);
          }
          S.add(
            P[u * 3], P[u * 3 + 1], P[u * 3 + 2], P[w * 3], P[w * 3 + 1], P[w * 3 + 2],
            r, g, b, inner ? FLAG_INTERIOR : 0, 0, 0, rev[u], rev[w], 0, 1, L.wire.widthBase + L.wire.widthByWeight * ew,
          );
        }
        const geo = track(segmentGeometry(S));
        const o = {
          width: L.wire.width, opacity: wireBase, back: L.wire.back, depthW: L.wire.depthW, interior: L.wire.interior,
          boost: L.wire.boost, revGlow: L.wire.revealGlow, add: isDark, depthTest: true,
        };
        wireMat = lineMaterial(Object.assign({}, o, { skipInterior: true }));
        addMesh(geo, wireMat, ORDER.wire);
        addMesh(geo, dims(lineMaterial(Object.assign({}, o, {
          opacity: (wireBase * L.wire.hiddenOpacity) / Math.max(L.wire.opacity, 0.01),
          interior: L.wire.hiddenInterior, depthFunc: T.GreaterDepth,
          skipBelow: isDark ? L.wire.widthBase + L.wire.widthByWeight * L.wire.hiddenMinWeight : 0,
        }))), ORDER.wireHidden);
      }

      // vertex dots (same positions as the skin)
      {
        const attr = new Uint8Array(V * 4);
        const rng = NF.mesh.mulberry32(7);
        for (let v = 0; v < V; v++) {
          attr[v * 4] = mesh.surface[v] ? 0 : 255;
          attr[v * 4 + 1] = G.toU8(rev[v]);
          attr[v * 4 + 2] = G.toU8(rng());
          attr[v * 4 + 3] = G.toU8(mesh.vertW[v]);
        }
        const g = track(new T.BufferGeometry());
        g.setAttribute('position', positionAttr);
        g.setAttribute('aDot', new T.BufferAttribute(attr, 4, true));
        const o = {
          size: L.dots.size, opacity: isDark ? L.dots.opacity : L.dots.light, color: wireCol, soft: L.dots.soft,
          back: L.dots.back, interior: L.dots.interior, weighted: isDark, boost: L.dots.boost, depthTest: true,
        };
        addPoints(g, dims(dotMaterial(o)), ORDER.dots);
        addPoints(g, dims(dotMaterial(Object.assign({}, o, {
          opacity: L.dots.hiddenOpacity, back: 1, interior: L.dots.hiddenInterior, depthFunc: T.GreaterDepth,
        }))), ORDER.dotsHidden);
      }

      // backdrop: far constellation + motes (both themes)
      const B = L.background;
      let farMat = null;
      const clouds = [];
      {
        const cloud = (pos, seed, o, order) => {
          const n = pos.length / 3;
          const attr = new Uint8Array(n * 4);
          const rng = NF.mesh.mulberry32(seed);
          for (let i = 0; i < n; i++) { attr[i * 4 + 1] = G.toU8(0.5); attr[i * 4 + 2] = G.toU8(rng()); }
          const g = track(new T.BufferGeometry());
          g.setAttribute('position', new T.BufferAttribute(pos, 3));
          g.setAttribute('aDot', new T.BufferAttribute(attr, 4, true));
          const mat = dotMaterial({
            size: o.size, opacity: isDark ? o.opacity : o.opacityLight, color: wireCol.clone().lerp(bg, isDark ? o.lerp : o.lerpLight),
            soft: o.soft, near: o.near, depthTest: false,
          });
          addPoints(g, mat, order);
          clouds.push({ mat, twinkle: o.twinkle, drift: o.drift });
        };
        const rng = NF.mesh.mulberry32(20260711);
        const N = B.far.count;
        const far = new Float64Array(N * 4);
        for (let i = 0; i < N; i++) {
          const u = rng() * 2 - 1, th = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u), r = B.far.radius + rng() * B.far.spread;
          far[i * 4] = cx + sq * Math.cos(th) * r;
          far[i * 4 + 1] = cy + u * r * B.far.flatten;
          far[i * 4 + 2] = cz + sq * Math.sin(th) * r;
          far[i * 4 + 3] = (r - B.far.radius) / B.far.spread;
        }
        const range = isDark ? B.far.lerp : B.far.lerpLight;
        const S = new SegmentBuffer(N * 2);
        const linked = new Set();
        const maxQ = B.far.link * B.far.link;
        for (let i = 0; i < N; i++) {
          let j0 = -1, j1 = -1, q0 = Infinity, q1 = Infinity;
          for (let j = 0; j < N; j++) {
            if (j === i) continue;
            const q = (far[i * 4] - far[j * 4]) ** 2 + (far[i * 4 + 1] - far[j * 4 + 1]) ** 2 + (far[i * 4 + 2] - far[j * 4 + 2]) ** 2;
            if (q < q0) { q1 = q0; j1 = j0; q0 = q; j0 = j; } else if (q < q1) { q1 = q; j1 = j; }
          }
          for (let n = 0; n < 2; n++) {
            const j = n === 0 ? j0 : j1, q = n === 0 ? q0 : q1;
            if (j < 0 || q > maxQ) continue;
            const key = i < j ? i * N + j : j * N + i;
            if (linked.has(key)) continue;
            linked.add(key);
            const f = (lerp(range[0], range[1], far[i * 4 + 3]) + lerp(range[0], range[1], far[j * 4 + 3])) / 2;
            const phase = rng(), rate = 0.5 + rng();
            S.add(
              far[i * 4], far[i * 4 + 1], far[i * 4 + 2], far[j * 4], far[j * 4 + 1], far[j * 4 + 2],
              lerp(wireCol.r, bg.r, f), lerp(wireCol.g, bg.g, f), lerp(wireCol.b, bg.b, f), 0, 0, 1, 0.5, 0.5, phase, rate, 1,
            );
          }
        }
        if (S.count) {
          farMat = lineMaterial({
            width: 1, opacity: isDark ? B.far.opacity : B.far.opacityLight, back: 1, near: B.far.near,
            flow: B.far.flow, freq: B.far.freq, speed: B.far.speed, len: B.far.len, add: isDark, depthTest: false,
          });
          addMesh(track(segmentGeometry(S)), farMat, ORDER.farLines);
        }
        const farPos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) { farPos[i * 3] = far[i * 4]; farPos[i * 3 + 1] = far[i * 4 + 1]; farPos[i * 3 + 2] = far[i * 4 + 2]; }
        cloud(farPos, 11, B.farDots, ORDER.farDots);
        const M = B.motes.count, motePos = new Float32Array(M * 3);
        for (let i = 0; i < M; i++) {
          const u = rng() * 2 - 1, th = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u), r = radius * (B.motes.inner + rng() * B.motes.spread);
          motePos[i * 3] = cx + sq * Math.cos(th) * r;
          motePos[i * 3 + 1] = cy + u * r * B.motes.flatten;
          motePos[i * 3 + 2] = cz + sq * Math.sin(th) * r;
        }
        cloud(motePos, 23, B.motes, ORDER.motes);
      }

      // light: the glow inside the brain (added by the grade pass) and a pool on the floor —
      // dark themes only; a transparent canvas gets no floor (it would paint a slab over the page)
      const coreColor = text.clone().lerp(rawColor(pal.color('--accent')), L.atmos.coreAccent);
      const coreBase = isDark ? L.atmos.coreOpacity * L.atmos.core : 0;
      const coreY = cy + L.atmos.coreDy, coreHalf = (radius * L.atmos.coreScale) / 2;
      let floorMat = null;
      if (isDark && !transparent) {
        const fy = B.floor.y, fz = cz + B.floor.dz;
        const pos = [], uv = [], index = [];
        for (const [sx, sz] of [B.floor.size, B.floor.hot]) {
          const o = pos.length / 3;
          pos.push(cx - sx / 2, fy, fz - sz / 2, cx + sx / 2, fy, fz - sz / 2, cx - sx / 2, fy, fz + sz / 2, cx + sx / 2, fy, fz + sz / 2);
          uv.push(0, 0, 1, 0, 0, 1, 1, 1);
          index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
        }
        const g = track(new T.BufferGeometry());
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        g.setIndex(index);
        floorMat = track(new T.MeshBasicMaterial({
          map: track(makeGlowTexture()), color: text, transparent: true, opacity: B.floor.opacity, blending: T.AdditiveBlending,
          depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide,
        }));
        addMesh(g, floorMat, ORDER.floor);
      }

      // ════════════════ data layer (the sample graph never changes: built once per scene) ════════════════
      const at = (S, u, w, c, flags, arcU, arcW, revOffset, width) => S.add(
        P[u * 3], P[u * 3 + 1], P[u * 3 + 2], P[w * 3], P[w * 3 + 1], P[w * 3 + 2],
        c.r, c.g, c.b, flags, arcU, arcW, rev[u] + revOffset, rev[w] + revOffset, 0, 1, width,
      );
      const layerMesh = (S, mat, order) => {
        const m = addMesh(S && S.count ? track(segmentGeometry(S)) : EMPTY_GEOMETRY, mat, order);
        m.visible = !!(S && S.count);
        return m;
      };

      // structure routes (thicker where routes share an edge) + dendrites, one draw per pass
      const routeFlow = L.routes.flow * energy;
      const routeOpts = {
        width: L.routes.width, opacity: edgeOpacity(L.routes.opacity * energy), back: L.routes.back, mul: L.routes.mul,
        flow: routeFlow, freq: L.routes.freq, speed: L.routes.speed, len: L.routes.len, revGlow: L.routes.revealGlow, depthTest: true,
      };
      const routesMat = dims(lineMaterial(routeOpts));
      const routesHiddenMat = dims(lineMaterial(Object.assign({}, routeOpts, { opacity: routeOpts.opacity * L.routes.hiddenOpacity, depthFunc: T.GreaterDepth })));
      const flowing = [routesMat, routesHiddenMat];
      {
        const dendWidth = L.dend.width / L.routes.width;
        const dendFlags = G.opacityFlags(edgeOpacity(L.dend.opacity * energy) / routeOpts.opacity);
        const neutralInk = text.clone().lerp(bg, L.color.lightNeutral);
        const branchColor = (colorVar) => (!isDark && colorVar === '--text' ? neutralInk : colorOf(colorVar));
        const S = new SegmentBuffer(data.structDedup.length + data.dend.length);
        for (const s of data.structDedup) {
          at(S, s.u, s.w, branchColor(s.colorVar), 0, s.arcU, s.arcW, L.routes.revealOffset, Math.min(L.trunkMax, 1 + L.trunk * Math.log2(s.count)));
        }
        for (const s of data.dend) at(S, s.u, s.w, branchColor(s.colorVar), dendFlags, s.arcU, s.arcW, L.dend.revealOffset, dendWidth);
        if (S.count) {
          const geo = track(segmentGeometry(S));
          addMesh(geo, routesMat, ORDER.routes);
          addMesh(geo, routesHiddenMat, ORDER.routesHidden);
        }
      }

      // synapses at rest: content + user relations in one mesh (uShowContent hides the content ones)
      const synMat = dims(lineMaterial({ width: L.syn.width, opacity: isDark ? L.syn.opacity : L.syn.light, back: L.syn.back, depthTest: false }));
      const synDim = dimmed[dimmed.length - 1];
      let synAll = 0, synUser = 0;
      {
        const c = colorOf('--text').clone().lerp(bg, isDark ? L.syn.lerp : L.syn.lerpLight);
        const S = new SegmentBuffer(data.synSegs.length, false);
        for (const s of data.synSegs) {
          if (!s.content) synUser++;
          at(S, s.u, s.w, c, s.content ? FLAG_CONTENT : 0, 0, 1, L.syn.revealOffset, 1);
        }
        synAll = data.synSegs.length;
        layerMesh(S, synMat, ORDER.synapses);
      }
      let needsRender = true;
      // light themes thin the synapses out as they get denser (what counts is what shows)
      const fitSynapses = () => {
        if (isDark) return;
        const shown = U.uShowContent.value > 0.5 ? synAll : synUser;
        const k = shown > 0 ? Math.min(1, Math.max(L.syn.lightMin, Math.sqrt(L.syn.lightRef / shown))) : 1;
        synDim.base = L.syn.light * k;
        needsRender = true;
      };
      fitSynapses();

      // impulses: only the strongest relations, as fibres with few subdivisions
      const impulseMat = lineMaterial({
        width: L.impulse.width, opacity: L.impulse.opacity, back: L.impulse.back, flow: L.syn.impulses * energy, flowBase: 0,
        freq: L.impulse.freq, speed: L.impulse.speed, len: L.impulse.len, add: isDark, depthTest: false,
      });
      let impulseMesh, impulseCount = 0;
      {
        const S = new SegmentBuffer(env.impulses.length * 32);
        const rng = NF.mesh.mulberry32(31337);
        const c = new T.Color();
        for (const { ei, fb } of env.impulses) {
          const e = data.edgePaths[ei];
          const src = data.byId.get(e.source);
          c.copy(src && src.colorVar !== '--text' ? colorOf(src.colorVar) : text).lerp(text, L.impulse.toText);
          const phase = rng(), rate = L.impulse.rateMin + rng() * L.impulse.rateSpread;
          const q = fb.points, flags = e.content ? FLAG_CONTENT : 0;
          for (let i = 0; i < fb.count - 1; i++) {
            S.add(q[i * 3], q[i * 3 + 1], q[i * 3 + 2], q[i * 3 + 3], q[i * 3 + 4], q[i * 3 + 5], c.r, c.g, c.b, flags, fb.arc[i], fb.arc[i + 1], 0, 0, phase, rate, 1);
          }
        }
        impulseCount = S.count;
        impulseMesh = layerMesh(S, impulseMat, ORDER.impulses);
        impulseMesh.visible = impulseCount > 0 && !reduced;
      }

      // nodes: one geometry for the halo, the node and its hidden pass
      const NN = data.placed.length;
      const nodeState = new Float32Array(NN * 4); // cited, focus, seed, entrance
      const focusBuf = new Uint8Array(NN);
      let nodeStateAttr = null;
      let litSet = live.lit();
      let litCount = 0;
      if (NN) {
        const pos = new Float32Array(NN * 3), col = new Float32Array(NN * 3), size = new Float32Array(NN), style = new Float32Array(NN * 4);
        const rng = NF.mesh.mulberry32(555);
        for (let i = 0; i < NN; i++) {
          const nd = data.placed[i], c = colorOf(nd.colorVar), s = softNode(nd.kind, nd.colorVar === '--text');
          pos[i * 3] = nd.x; pos[i * 3 + 1] = nd.y; pos[i * 3 + 2] = nd.z;
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          size[i] = RING_SIZE[nd.kind];
          style[i * 4] = s.core; style[i * 4 + 1] = s.ring; style[i * 4 + 2] = s.alpha; style[i * 4 + 3] = s.fill;
          const lit = nd.tier === TIER_NOTE && nd.noteId != null && litSet !== undefined && litSet !== null && litSet.has(nd.noteId);
          if (lit) litCount++;
          nodeState[i * 4] = lit ? 1 : 0;
          nodeState[i * 4 + 2] = rng();
          nodeState[i * 4 + 3] = rev[nd.v] + L.nodes.revealOffset;
        }
        const g = track(new T.BufferGeometry());
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        g.setAttribute('aColor', new T.BufferAttribute(col, 3));
        g.setAttribute('aSize', new T.BufferAttribute(size, 1));
        g.setAttribute('aStyle', new T.BufferAttribute(style, 4));
        nodeStateAttr = new T.BufferAttribute(nodeState, 4);
        nodeStateAttr.setUsage(T.DynamicDrawUsage);
        g.setAttribute('aState', nodeStateAttr);
        addPoints(g, nodeMaterial(1, { ext: L.nodes.glowExtent, back: L.nodes.glowBack, add: isDark, depthTest: false }), ORDER.glow);
        addPoints(g, nodeMaterial(0, { ext: L.nodes.extent, back: L.nodes.back, depthTest: true }), ORDER.nodes);
        addPoints(g, nodeMaterial(0, { ext: L.nodes.extent, back: L.nodes.back, depthTest: true, depthFunc: T.GreaterDepth, opacity: L.nodes.hiddenAlpha }), ORDER.nodesHidden);
      }

      // sweeps: a fixed pool of slots (one hover + the concurrent thinking sweeps)
      const slots = [];
      for (let i = 0; i < BUDGET.thinkSweeps + 1; i++) {
        const lineMat = lineMaterial({ width: L.sweep.width, opacity: 1, back: L.sweep.back, mul: L.sweep.mul, head: 0, tail: L.sweep.tail, depthTest: false });
        const line = addMesh(EMPTY_GEOMETRY, lineMat, ORDER.sweeps);
        line.visible = false;
        const markerPos = new T.BufferAttribute(new Float32Array(3), 3);
        markerPos.setUsage(T.DynamicDrawUsage);
        const markerGeo = track(new T.BufferGeometry());
        markerGeo.setAttribute('position', markerPos);
        // a constant white RGBA vertex colour: the same program as the sparks' (compiled at open)
        markerGeo.setAttribute('color', new T.BufferAttribute(new Float32Array([1, 1, 1, 1]), 4));
        const markerMat = track(new T.PointsMaterial({
          map: ringTex, vertexColors: true, size: L.sweep.markerSize, transparent: true, depthWrite: false, depthTest: false,
          blending: glowBlend, sizeAttenuation: true, alphaTest: 0.02, side: T.DoubleSide,
        }));
        const marker = addPoints(markerGeo, markerMat, ORDER.marker);
        marker.visible = false;
        slots.push({ mode: SWEEP_FREE, hasLines: false, start: 0, dur: 0, line, sweep: lineMat.uniforms.uSweep.value, marker, markerMat, markerPos });
      }

      // ambient sparks: a small fixed pool of comets, the only vertex data written per frame
      const SP = L.sparks;
      const sparks = [];
      for (let i = 0; i < BUDGET.sparks; i++) sparks.push({ alive: false, start: 0, dur: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 });
      const sparkPos = new Float32Array(BUDGET.sparks * SP.tail * 3), sparkRgba = new Float32Array(BUDGET.sparks * SP.tail * 4);
      const sparkPosAttr = new T.BufferAttribute(sparkPos, 3), sparkRgbaAttr = new T.BufferAttribute(sparkRgba, 4);
      sparkPosAttr.setUsage(T.DynamicDrawUsage); sparkRgbaAttr.setUsage(T.DynamicDrawUsage);
      const sparkGeo = track(new T.BufferGeometry());
      sparkGeo.setAttribute('position', sparkPosAttr);
      sparkGeo.setAttribute('color', sparkRgbaAttr);
      sparkGeo.setDrawRange(0, 0);
      const sparkPoints = addPoints(sparkGeo, track(new T.PointsMaterial({
        map: dotTex, vertexColors: true, size: SP.size, transparent: true, depthWrite: false,
        blending: glowBlend, sizeAttenuation: true, alphaTest: 0.02, side: T.DoubleSide,
      })), ORDER.sparks);
      let sparksWarm = false; // visible (drawing nothing) on the first frame so its program compiles then
      const sparkR = wireCol.r * SP.boost, sparkG = wireCol.g * SP.boost, sparkB = wireCol.b * SP.boost;
      let sparksDrawn = 0;

      // ── post-processing: render → [bloom] → grade ──
      // r128's composer target is 8-bit RGBA by default, as the look wants. Bloom: dark themes only,
      // and not on phones (gotcha: several full-resolution blur chains per page).
      const composer = new T.EffectComposer(renderer);
      composer.addPass(new T.RenderPass(scene, camera));
      let bloom = null, bloomComposite = null;
      if (isDark && !lowPower) {
        bloom = new T.UnrealBloomPass(new T.Vector2(Math.max(1, W), Math.max(1, H)), L.bloom.strength, L.bloom.radius, Math.max(L.bloom.threshold, bgLum));
        composer.addPass(bloom);
        // The grade pass adds the bloom itself from the pass's composite; the pass's own additive
        // copy onto the scene buffer is switched off (three skips an invisible material). In r128
        // that copy is `materialCopy` (0.169: `blendMaterial`).
        const composite = bloom.renderTargetsHorizontal && bloom.renderTargetsHorizontal[0] && bloom.renderTargetsHorizontal[0].texture;
        if (bloom.materialCopy && composite) { bloom.materialCopy.visible = false; bloomComposite = composite; }
      }
      const gradeU = {
        tDiffuse: { value: null },
        tBloom: { value: bloomComposite },
        uBloomOn: { value: bloomComposite ? 1 : 0 },
        uCore: { value: new T.Vector3(0.5, 0.5, 0) },
        uCoreCol: { value: new T.Color(0, 0, 0) },
        uCenterUv: { value: new T.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        // vignette and grain would only darken / speckle the page under a transparent canvas
        uVig: { value: transparent ? 0 : isDark ? L.atmos.vignette : L.atmos.vignette * L.atmos.vignetteLight },
        uLift: { value: isDark ? L.atmos.liftAmount * L.atmos.lift : 0 },
        uLiftCol: { value: text.clone() },
        uGrain: { value: transparent ? 0 : L.atmos.grain },
        uTime: { value: 0 },
      };
      // textureLod is GLSL ES 3.00 (WebGL2); r128 falls back to WebGL1 where there is no WebGL2
      const gradeFS = renderer.capabilities.isWebGL2 ? SH.GRADE_FS : SH.GRADE_FS.replace('textureLod(tBloom, vUv, 0.0)', 'texture2D(tBloom, vUv)');
      const gradeMat = track(new T.ShaderMaterial({ uniforms: gradeU, vertexShader: SH.GRADE_VS, fragmentShader: gradeFS, depthTest: false, depthWrite: false }));
      composer.addPass(new T.ShaderPass(gradeMat));
      // bloom works at CSS-pixel resolution (cost and glow width independent of the pixel ratio)
      const sizePost = () => {
        composer.setSize(Math.max(1, W), Math.max(1, H));
        if (bloom) bloom.setSize(Math.max(1, W), Math.max(1, H));
      };
      composer.setPixelRatio(dpr);
      sizePost();

      // ════════════════ state ════════════════
      let raf = 0, frames = 0;
      let t = 0, lastMs = performance.now();
      let inView = false;
      let revealStart = -1;
      let introPending = !reduced && !host._introPlayed;
      let waveIdx = 0, waveUntil = 0;
      let nextWaveAt = L.motion.firstWave, nextHeartAt = L.motion.firstHeart, nextSparkAt = SP.first;
      let nextThinkAt = 0, lastThinkWave = -100, thinkActive = 0, thinkCursor = 0;
      let hoverId = null, selectedId = null;
      let focusBuilt = null, focusShowContent = false, focusStale = true;
      let hoverSlot = null, hoverStart = 0;
      let focusAmt = 0;
      const cited = [];
      let citedStale = true;
      const cascade = [];
      for (let i = 0; i < L.think.citedWaves; i++) cascade.push(null);
      let cascadeCount = 0, cascadeNext = 0, cascadeStart = 0;
      let pointerX = 0, pointerY = 0, pointerDirty = false;
      let downX = 0, downY = 0, moved = false, pointerActive = false;
      let cursor = 'grab';
      const viewProj = new T.Matrix4();
      const radial = new T.Vector3();

      const fireWave = (x, y, z) => {
        const w = U.uWaves.value, o = (waveIdx++ % 4) * 4;
        w[o] = x; w[o + 1] = y; w[o + 2] = z; w[o + 3] = t;
        waveUntil = t + L.motion.waveLife;
        needsRender = true;
      };
      const replay = () => {
        if (reduced) return;
        revealStart = t;
        U.uRevealOn.value = 1;
        U.uReveal.value = 0;
        host._introPlayed = true;
        needsRender = true;
      };

      // ── sweeps ──
      const releaseSweep = (slot) => {
        if (slot.hasLines) { slot.line.geometry.dispose(); slot.line.geometry = EMPTY_GEOMETRY; slot.hasLines = false; }
        slot.line.visible = false;
        slot.marker.visible = false;
        slot.mode = SWEEP_FREE;
      };
      const spawnSweep = (node, mode, withLines) => {
        let slot = null;
        for (let i = 0; i < slots.length; i++) if (slots[i].mode === SWEEP_FREE) { slot = slots[i]; break; }
        if (!slot) return null;
        slot.mode = mode; slot.start = t; slot.dur = 0;
        slot.markerPos.setXYZ(0, node.x, node.y, node.z);
        slot.markerPos.needsUpdate = true;
        slot.markerMat.color.copy(colorOf(node.colorVar)).multiplyScalar(isDark ? L.sweep.markerBoost : 1);
        slot.markerMat.opacity = 1;
        slot.marker.visible = true;
        const edges = withLines && node.noteNodeId ? data.contentOf.get(node.noteNodeId) : undefined;
        if (edges && edges.length) {
          const c = colorOf(node.colorVar);
          const S = new SegmentBuffer(edges.length * 48);
          for (let k = 0; k < edges.length; k++) {
            const e = data.edgePaths[edges[k]];
            const fb = G.fibre(P, e.seq, BUDGET.sweepSubdiv, e.source !== node.noteNodeId);
            const q = fb.points;
            for (let i = 0; i < fb.count - 1; i++) {
              S.add(q[i * 3], q[i * 3 + 1], q[i * 3 + 2], q[i * 3 + 3], q[i * 3 + 4], q[i * 3 + 5], c.r, c.g, c.b, 0, fb.arc[i], fb.arc[i + 1], 0, 0, 0, 1, 1);
            }
          }
          if (S.count) {
            slot.line.geometry = segmentGeometry(S);
            slot.sweep.y = 0;
            slot.sweep.z = 1;
            slot.line.visible = true;
            slot.hasLines = true;
          }
        }
        return slot;
      };
      // (A released sweep must still be drawn away: with reduced motion nothing else would redraw.)
      const clearThink = () => {
        for (let i = 0; i < slots.length; i++) if (slots[i].mode === SWEEP_THINK) { releaseSweep(slots[i]); needsRender = true; }
        thinkActive = 0;
      };
      const pickThinkingNode = () => {
        const connected = data.connected;
        if (!connected.length) return null;
        if (citedStale) {
          cited.length = 0;
          if (litSet && litSet.size) {
            for (let i = 0; i < connected.length; i++) {
              const nd = data.byId.get(connected[i]);
              if (nd && nd.noteId != null && litSet.has(nd.noteId)) cited.push(connected[i]);
            }
          }
          citedStale = false;
        }
        const id = cited.length ? cited[thinkCursor++ % cited.length] : connected[(Math.random() * connected.length) | 0];
        return data.byId.get(id) || null;
      };

      // ── node state: cited notes and focus ──
      const applyLit = (withCascade) => {
        const placed = data.placed;
        const queue = withCascade && !reduced;
        litCount = 0; cascadeCount = 0; cascadeNext = 0; cascadeStart = t;
        for (let i = 0; i < placed.length; i++) {
          const nd = placed[i];
          const on = nd.tier === TIER_NOTE && nd.noteId != null && !!litSet && litSet.has(nd.noteId);
          nodeState[i * 4] = on ? 1 : 0;
          if (on) {
            litCount++;
            if (queue && cascadeCount < cascade.length) cascade[cascadeCount++] = nd;
          }
        }
        if (nodeStateAttr) nodeStateAttr.needsUpdate = true;
        citedStale = true;
      };
      const applyFocus = (node, withContent) => {
        G.focusMask(data, node, withContent, focusBuf);
        for (let i = 0; i < focusBuf.length; i++) nodeState[i * 4 + 1] = focusBuf[i];
        if (nodeStateAttr) nodeStateAttr.needsUpdate = true;
      };

      // ── labels: HTML projected from 3D (as the app: faded at the back, never overlapping) ──
      let labelLayer = null;
      let labelRecs = [];
      let labelStamp, shownNow, shownPrev, shownPrevCount = 0, labelFrame = 0;
      let candIdx, candOrder, candBin, candFocus, candX, candY, candDn, boxes;
      const binStart = new Int32Array(LABEL_BINS + 1);
      let layerOpacity = -1;
      let tierIdx = [new Int32Array(0), new Int32Array(0), new Int32Array(0)];
      const labelBase = 'position:absolute;left:0;top:0;white-space:nowrap;line-height:normal;will-change:transform,opacity;display:none;opacity:0;'
        + `text-shadow:0 0 3px ${cssColor(bg)},0 0 7px ${cssColor(bg)},0 0 12px ${cssColor(bg)};`;
      const resetLabels = () => {
        for (const rec of labelRecs) if (rec) rec.el.remove();
        const byTier = [[], [], []];
        for (const nd of data.placed) if (nd.tier <= TIER_NOTE) byTier[nd.tier].push(nd.index);
        tierIdx = byTier.map((list) => Int32Array.from(list));
        labelRecs = new Array(NN);
        labelStamp = new Int32Array(NN); shownNow = new Int32Array(NN); shownPrev = new Int32Array(NN); shownPrevCount = 0;
        candIdx = new Int32Array(NN); candOrder = new Int32Array(NN); candBin = new Uint16Array(NN); candFocus = new Uint8Array(NN);
        candX = new Float32Array(NN); candY = new Float32Array(NN); candDn = new Float32Array(NN); boxes = new Float32Array(NN * 4);
      };
      if (opts.labels) {
        labelLayer = document.createElement('div');
        labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
        container.appendChild(labelLayer);
        resetLabels();
      }
      const makeLabel = (nd) => {
        const el = document.createElement('div');
        el.textContent = nd.label.length > L.labels.maxChars ? nd.label.slice(0, L.labels.maxChars - 1) + '…' : nd.label;
        el.style.cssText = labelBase + LABEL_FONT[nd.tier] + (reduced ? '' : 'transition:opacity .22s ease;');
        const c = colorOf(nd.colorVar);
        el.style.color = cssColor(nd.tier <= TIER_FOLDER ? c : c.clone().lerp(text, L.labels.toText));
        labelLayer.appendChild(el);
        return { el, qx: NaN, qy: NaN, op: 0, shown: false };
      };
      const updateLabels = (revealK, zc) => {
        const lo = Math.round(revealK * 100);
        if (lo !== layerOpacity) { layerOpacity = lo; labelLayer.style.opacity = String(lo / 100); }
        const placed = data.placed, LB = L.labels;
        labelFrame++;
        let n = 0;
        if (NN) {
          const camDist = camera.position.distanceTo(controls.target);
          const showFolders = camDist < LB.folderDist * fitK, showNotes = camDist < LB.noteDist * fitK;
          const fovScale = H / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
          const e = viewProj.elements, m = camera.matrixWorldInverse.elements;
          const hn = hoverId ? data.byId.get(hoverId) : undefined, sn = selectedId ? data.byId.get(selectedId) : undefined;
          const hoverIdx = hn ? hn.index : -1, selectedIdx = sn ? sn.index : -1;
          for (let pass = 0; pass < 5; pass++) {
            if ((pass === 1 && !showFolders) || (pass === 2 && !showNotes)) continue;
            const list = pass < 3 ? tierIdx[pass] : null;
            const single = pass === 3 ? hoverIdx : pass === 4 && selectedIdx !== hoverIdx ? selectedIdx : -1;
            const count = list ? list.length : single >= 0 ? 1 : 0;
            for (let k = 0; k < count; k++) {
              const i = list ? list[k] : single;
              const nd = placed[i], tier = nd.tier;
              if (!list && (tier === TIER_GROUP || (tier === TIER_FOLDER && showFolders) || (tier === TIER_NOTE && showNotes))) continue;
              const focus = i === hoverIdx || i === selectedIdx;
              const w = e[3] * nd.x + e[7] * nd.y + e[11] * nd.z + e[15];
              if (w <= 0) continue;
              if ((e[2] * nd.x + e[6] * nd.y + e[10] * nd.z + e[14]) / w > 1) continue;
              const x = ((e[0] * nd.x + e[4] * nd.y + e[8] * nd.z + e[12]) / w * 0.5 + 0.5) * W;
              const y = (-(e[1] * nd.x + e[5] * nd.y + e[9] * nd.z + e[13]) / w * 0.5 + 0.5) * H;
              if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue;
              const mvz = m[2] * nd.x + m[6] * nd.y + m[10] * nd.z + m[14];
              const dn = Math.max(0, Math.min(1, ((zc + radius) - mvz) / (2 * radius)));
              const ringPx = (RING_BY_TIER[tier] * fovScale) / Math.max(-mvz, 0.001);
              candIdx[n] = i;
              candX[n] = x;
              candY[n] = y - Math.min(ringPx * LB.lift + LB.liftPad, LB.liftMax);
              candDn[n] = dn;
              candFocus[n] = focus ? 1 : 0;
              candBin[n] = Math.min(LABEL_BINS - 1, (((focus ? 0 : tier === TIER_GROUP ? 1 : tier === TIER_FOLDER ? 2 : 3) + dn * 0.9) * 64) | 0);
              n++;
            }
          }
        }
        binStart.fill(0);
        for (let c = 0; c < n; c++) binStart[candBin[c] + 1]++;
        for (let b = 0; b < LABEL_BINS; b++) binStart[b + 1] += binStart[b];
        for (let c = 0; c < n; c++) candOrder[binStart[candBin[c]]++] = c;

        let nBoxes = 0, nShown = 0;
        for (let o = 0; o < n; o++) {
          const c = candOrder[o], i = candIdx[c], nd = placed[i];
          const focus = candFocus[c] === 1;
          const op = focus ? 1 : LB.opacity[nd.tier] * (candDn[c] > LB.hiddenDepth ? LB.hiddenFade : 1);
          const x = candX[c], y = candY[c];
          const half = (Math.min(nd.label.length, LB.maxChars) * (nd.tier === TIER_GROUP ? LB.groupCharWidth : LB.charWidth) + LB.boxPad) / 2;
          const x0 = x - half, x1 = x + half, y0 = y - LB.boxAbove, y1 = y + LB.boxBelow;
          if (!focus) {
            let hit = false;
            for (let b = 0; b < nBoxes; b++) {
              const k = b * 4;
              if (x0 < boxes[k + 2] && x1 > boxes[k] && y0 < boxes[k + 3] && y1 > boxes[k + 1]) { hit = true; break; }
            }
            if (hit) continue;
          }
          boxes[nBoxes * 4] = x0; boxes[nBoxes * 4 + 1] = y0; boxes[nBoxes * 4 + 2] = x1; boxes[nBoxes * 4 + 3] = y1;
          nBoxes++;
          let rec = labelRecs[i];
          if (!rec) rec = labelRecs[i] = makeLabel(nd);
          const qx = Math.round(x * 10), qy = Math.round(y * 10);
          if (!rec.shown) { rec.el.style.display = ''; rec.shown = true; }
          if (qx !== rec.qx || qy !== rec.qy) {
            rec.qx = qx; rec.qy = qy;
            rec.el.style.transform = `translate(${qx / 10}px,${qy / 10}px) translate(-50%,-100%)`;
          }
          if (op !== rec.op) { rec.op = op; rec.el.style.opacity = String(op); }
          labelStamp[i] = labelFrame;
          shownNow[nShown++] = i;
        }
        for (let k = 0; k < shownPrevCount; k++) {
          const i = shownPrev[k];
          if (labelStamp[i] === labelFrame) continue;
          const rec = labelRecs[i];
          if (rec && rec.shown) { rec.el.style.display = 'none'; rec.el.style.opacity = '0'; rec.op = 0; rec.shown = false; }
        }
        const swap = shownPrev; shownPrev = shownNow; shownNow = swap;
        shownPrevCount = nShown;
      };

      // ── picking: nearest node to the pointer in screen space ──
      const pick = (px, py) => {
        const placed = data.placed, e = viewProj.elements;
        const camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z;
        let best = null, bestScore = Infinity;
        for (let i = 0; i < placed.length; i++) {
          const nd = placed[i];
          const w = e[3] * nd.x + e[7] * nd.y + e[11] * nd.z + e[15];
          if (w <= 0) continue;
          const nz = (e[2] * nd.x + e[6] * nd.y + e[10] * nd.z + e[14]) / w;
          if (nz > 1) continue;
          const sx = ((e[0] * nd.x + e[4] * nd.y + e[8] * nd.z + e[12]) / w * 0.5 + 0.5) * W;
          const sy = (-(e[1] * nd.x + e[5] * nd.y + e[9] * nd.z + e[13]) / w * 0.5 + 0.5) * H;
          const d = Math.hypot(sx - px, sy - py);
          const dist = Math.hypot(nd.x - camX, nd.y - camY, nd.z - camZ);
          const reach = Math.max(9, (RING_BY_TIER[nd.tier] * (H * 0.5)) / dist * 0.5 + 4);
          if (d < reach) {
            const score = d + nz * 40;
            if (score < bestScore) { bestScore = score; best = nd; }
          }
        }
        return best;
      };

      // Everything prefers-reduced-motion switches off (the loop does the rest), as in the app.
      const applyMotion = () => {
        reduced = still || motionQuery.matches;
        if (reduced) {
          controls.autoRotate = false;
          revealStart = -1;
          introPending = false;
          U.uRevealOn.value = 0;
          const w = U.uWaves.value;
          w[3] = w[7] = w[11] = w[15] = -1;
          waveUntil = 0;
          cascadeCount = 0; cascadeNext = 0;
        }
        for (const mat of flowing) mat.uniforms.uFlow.value.x = reduced ? 0 : routeFlow;
        if (farMat) farMat.uniforms.uFlow.value.x = reduced ? 0 : B.far.flow;
        for (const c of clouds) {
          c.mat.uniforms.uAnim.value.x = reduced ? 0 : c.twinkle;
          c.mat.uniforms.uAnim.value.y = reduced ? 0 : c.drift;
        }
        impulseMesh.visible = impulseCount > 0 && !reduced;
        if (labelLayer) resetLabels();
        needsRender = true;
      };
      applyMotion();

      // ════════════════ render loop ════════════════
      let disposed = false; // set by the teardown: from then on nothing may touch the renderer
      const canRun = () => !disposed && inView && !document.hidden && W > 0 && H > 0;
      // Schedules a frame if none is pending; the frame itself decides whether to draw.
      const kick = () => {
        if (!raf && canRun()) { lastMs = performance.now(); raf = requestAnimationFrame(frame); }
      };
      const frame = () => {
        raf = 0;
        if (disposed) return;
        const nowMs = performance.now();
        // the clock only runs with the loop: a pause (off screen, hidden tab) never fast-forwards it
        const dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
        lastMs = nowMs;
        t += dt;
        // the entrance plays the first time this instance is on screen
        if (introPending) { introPending = false; replay(); }
        U.uTime.value = t;
        gradeU.uTime.value = t;
        if (reduced) U.uLit.value.set(L.think.citedStill, 0);
        else U.uLit.value.set(t, 1);

        // r128's controls turn a fixed angle per update(); scaled by the frame time the turn rate
        // matches the app's (whose controls take dt)
        if (controls.autoRotate) controls.autoRotateSpeed = opts.rotateSpeed * dt * 60;
        controls.update();
        // the hero's dive: the distance is set absolutely after the controls, so it never compounds
        if (host._scrolled && !still) {
          radial.copy(camera.position).sub(controls.target);
          radial.multiplyScalar((baseDist * fitK * (1 - DIVE * host._scroll)) / (radial.length() || 1));
          camera.position.copy(controls.target).add(radial);
          camera.lookAt(controls.target);
        }
        camera.updateMatrixWorld();
        viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

        const showContent = !!host._contentEdges;
        if ((U.uShowContent.value > 0.5) !== showContent) { U.uShowContent.value = showContent ? 1 : 0; fitSynapses(); needsRender = true; }

        let revealK = 1;
        if (revealStart >= 0) {
          const q = (t - revealStart) / L.motion.intro;
          if (q >= 1) { revealStart = -1; U.uRevealOn.value = 0; }
          else {
            U.uRevealOn.value = 1;
            U.uReveal.value = (1 - Math.pow(1 - Math.max(0, q), 2.2)) * 1.25;
            revealK = 0.25 + 0.75 * smooth(0.5, 0.95, q);
          }
        }

        if (pointerDirty) {
          pointerDirty = false;
          const hit = pick(pointerX, pointerY);
          hoverId = hit ? hit.id : null;
        }
        if (opts.controls) {
          const wantCursor = hoverId ? 'pointer' : 'grab';
          if (wantCursor !== cursor) { cursor = wantCursor; canvas.style.cursor = wantCursor; }
        }

        // focus (hovered, else selected): marker + sweep of its relations + dim of the rest + a ripple
        const focusId = hoverId || selectedId;
        if (focusStale || focusId !== focusBuilt || showContent !== focusShowContent) {
          const changed = focusId !== focusBuilt;
          if (hoverSlot) { releaseSweep(hoverSlot); hoverSlot = null; }
          const node = focusId ? data.byId.get(focusId) : undefined;
          if (node) hoverSlot = spawnSweep(node, SWEEP_HOVER, showContent);
          focusBuilt = focusId; focusShowContent = showContent; focusStale = false;
          hoverStart = still ? t - 2 * L.sweep.fill : t; // without a GPU the sweep shows whole at once
          applyFocus(node, showContent);
          if (node && changed && !reduced) fireWave(node.x, node.y, node.z);
          needsRender = true;
        }
        const sweeping = hoverSlot !== null && hoverSlot.hasLines && (t - hoverStart) / L.sweep.fill < 2;
        if (hoverSlot && hoverSlot.hasLines) hoverSlot.sweep.y = Math.min(2, (t - hoverStart) / L.sweep.fill) * 1.07;
        const focusTarget = focusId ? 1 : 0;
        const focusBefore = focusAmt;
        if (still) focusAmt = focusTarget;
        else {
          focusAmt += (focusTarget - focusAmt) * (1 - Math.pow(1 - L.focusEase, dt * 60));
          if (Math.abs(focusTarget - focusAmt) < 0.002) focusAmt = focusTarget;
        }
        if (focusAmt !== focusBefore) needsRender = true;
        U.uFocusAmt.value = focusAmt;

        // thinking: concurrent relation sweeps while the chat writes (not while hovering)
        const thinking = live.thinking();
        const thinkWanted = !hoverId && thinking && showContent && data.connected.length > 0;
        if (thinkWanted) {
          if (t >= nextThinkAt && thinkActive < BUDGET.thinkSweeps) {
            const node = pickThinkingNode();
            const slot = node ? spawnSweep(node, SWEEP_THINK, true) : null;
            if (node && slot && slot.hasLines) {
              slot.dur = L.think.life + Math.random() * L.think.lifeJitter;
              thinkActive++;
              if (!reduced && t - lastThinkWave > L.think.waveGap) { lastThinkWave = t; fireWave(node.x, node.y, node.z); }
            } else if (slot) releaseSweep(slot);
            nextThinkAt = t + L.think.every + Math.random() * L.think.jitter;
          }
        } else if (thinkActive && !thinking) clearThink();
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          if (slot.mode !== SWEEP_THINK) continue;
          const age = t - slot.start;
          if (age >= slot.dur) { releaseSweep(slot); thinkActive--; needsRender = true; continue; }
          const life = age / slot.dur, envl = life < L.think.hold ? 1 : 1 - (life - L.think.hold) / (1 - L.think.hold);
          slot.markerMat.opacity = envl;
          slot.sweep.y = (age / L.sweep.thinkFill) * 1.07;
          slot.sweep.z = envl;
        }

        // notes cited by the answer: compared by identity (the page passes a new Set each time)
        const lit = live.lit();
        if (lit !== litSet) {
          litSet = lit;
          applyLit(true);
          needsRender = true;
        }
        while (cascadeNext < cascadeCount && t >= cascadeStart + cascadeNext * L.think.citedGap) {
          const nd = cascade[cascadeNext++];
          if (nd) fireWave(nd.x, nd.y, nd.z);
        }

        if (!reduced) {
          if (t >= nextWaveAt) {
            if (NN) { const nd = data.placed[(Math.random() * NN) | 0]; fireWave(nd.x, nd.y, nd.z); }
            nextWaveAt = t + (1 / L.motion.waves) * (0.6 + Math.random() * 0.8);
          }
          if (revealStart < 0 && t >= nextHeartAt) {
            fireWave(data.core[0], data.core[1], data.core[2]);
            nextHeartAt = t + L.motion.heart;
          }
          if (t >= nextSparkAt) {
            for (let i = 0; i < sparks.length; i++) {
              const s = sparks[i];
              if (s.alive) continue;
              const ei = (Math.random() * (mesh.edges.length / 2)) | 0;
              let a = mesh.edges[ei * 2], b = mesh.edges[ei * 2 + 1];
              if (Math.random() < 0.5) { const swap = a; a = b; b = swap; }
              s.alive = true; s.start = t; s.dur = SP.life + Math.random() * SP.lifeJitter;
              s.ax = P[a * 3]; s.ay = P[a * 3 + 1]; s.az = P[a * 3 + 2];
              s.bx = P[b * 3]; s.by = P[b * 3 + 1]; s.bz = P[b * 3 + 2];
              break;
            }
            nextSparkAt = t + SP.every + Math.random() * SP.jitter;
          }
        }
        {
          let w = 0;
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            if (!s.alive) continue;
            const head = (t - s.start) / s.dur;
            if (head >= 1 || head < 0 || reduced) { s.alive = false; continue; }
            const envl = Math.sin(Math.PI * head);
            for (let k = 0; k < SP.tail; k++) {
              const raw = head - k * SP.tailGap, u = raw < 0 ? 0 : raw;
              sparkPos[w * 3] = lerp(s.ax, s.bx, u); sparkPos[w * 3 + 1] = lerp(s.ay, s.by, u); sparkPos[w * 3 + 2] = lerp(s.az, s.bz, u);
              sparkRgba[w * 4] = sparkR; sparkRgba[w * 4 + 1] = sparkG; sparkRgba[w * 4 + 2] = sparkB;
              sparkRgba[w * 4 + 3] = (raw >= 0 ? envl : 0) * (1 - k / SP.tail);
              w++;
            }
          }
          if (w > 0 || sparksDrawn > 0) {
            sparkPosAttr.needsUpdate = true; sparkRgbaAttr.needsUpdate = true;
            sparkGeo.setDrawRange(0, w);
            sparkPoints.visible = w > 0;
            sparksDrawn = w;
          }
        }

        // With reduced motion (and without a GPU) a frame is drawn only when something changed or
        // while something the user set off still plays: the focus easing, a hover sweep filling,
        // the sweeps while the chat writes.
        const draw = !reduced || needsRender || sweeping || thinkActive > 0 || t < waveUntil;
        if (draw) {
          needsRender = false;
          const br = reduced ? 0 : Math.sin(t * 1.1);
          const dim = 1 - L.focusDim * 0.55 * focusAmt;
          wireMat.uniforms.uOpacity.value = (wireBase + (isDark && !reduced ? L.wire.breathe * Math.sin(t * 1.1 + 1) : 0)) * dim;
          for (let i = 0; i < dimmed.length; i++) dimmed[i].u.value = dimmed[i].base * dim;
          if (floorMat) {
            const dx = camera.position.x - controls.target.x, dy = camera.position.y - controls.target.y, dz = camera.position.z - controls.target.z;
            const elevation = dy / (Math.hypot(dx, dy, dz) || 1);
            floorMat.opacity = B.floor.opacity * (1 + B.floor.breathe * br) * (1 - smooth(B.floor.fadeFrom, B.floor.fadeTo, elevation));
          }
          if (bloom) bloom.strength = L.bloom.strength + L.bloom.breathe * br;

          const e = viewProj.elements, m = camera.matrixWorldInverse.elements;
          const cw = e[3] * cx + e[7] * cy + e[11] * cz + e[15] || 1;
          gradeU.uCenterUv.value.set(
            (e[0] * cx + e[4] * cy + e[8] * cz + e[12]) / cw * 0.5 + 0.5,
            (e[1] * cx + e[5] * cy + e[9] * cz + e[13]) / cw * 0.5 + 0.5,
          );
          gradeU.uAspect.value = W / H;
          if (coreBase > 0) {
            const depth = e[3] * cx + e[7] * coreY + e[11] * cz + e[15];
            if (depth > 0.05) {
              gradeU.uCore.value.set(
                (e[0] * cx + e[4] * coreY + e[8] * cz + e[12]) / depth * 0.5 + 0.5,
                (e[1] * cx + e[5] * coreY + e[9] * cz + e[13]) / depth * 0.5 + 0.5,
                (coreHalf * camera.projectionMatrix.elements[5]) / (2 * depth),
              );
              gradeU.uCoreCol.value.copy(coreColor).multiplyScalar(coreBase * (1 + 0.12 * br));
            } else gradeU.uCore.value.z = 0;
          }

          if (labelLayer) updateLabels(revealK, m[2] * cx + m[6] * cy + m[10] * cz + m[14]);
          composer.render(dt);
          frames++;
          if (!sparksWarm) { sparksWarm = true; sparkPoints.visible = sparksDrawn > 0; }
        }
        // Keep going: always in full motion; otherwise only while this frame drew (something may
        // still be settling) or the chat is writing. At rest no frame is requested at all. (Something
        // in this frame — a controls 'change' — may already have asked for the next one.)
        if (!raf && (!reduced || draw || thinkWanted) && canRun()) raf = requestAnimationFrame(frame);
      };

      // Whenever the loop may run it gets a frame, which decides for itself whether to draw: what
      // the page changed while it was stopped (cited notes, thinking, the content layer — the
      // setters' kicks do nothing then) is picked up on that first frame back.
      const syncLoop = () => {
        if (canRun()) kick();
        else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      const io = new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; syncLoop(); });
      io.observe(host);

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth, h = container.clientHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, maxDpr);
        if (w === W && h === H && ratio === dpr) return;
        W = w; H = h;
        if (ratio !== dpr) {
          dpr = ratio;
          renderer.setPixelRatio(dpr);
          composer.setPixelRatio(dpr);
          U.uPx.value = dpr;
        }
        if (W > 0 && H > 0) {
          camera.aspect = W / H;
          fitCamera();
          applyViewOffset();
          renderer.setSize(W, H);
          sizePost();
          U.uRes.value.set(W * dpr, H * dpr);
          U.uScale.value = H * dpr * 0.5;
          needsRender = true;
        }
        syncLoop();
      });
      ro.observe(container);

      // ── pointer (interactive instance only): orbit (drag) · click · hover ──
      // The pointer is captured while pressed, so a release outside the canvas still ends the drag.
      // the user has taken the camera: auto-rotation stays off (as the app), across theme rebuilds too
      let userTurned = !!(host._pose && host._pose.userTurned);
      const onDown = (e) => {
        downX = e.clientX; downY = e.clientY; moved = false; pointerActive = true;
        controls.autoRotate = false; userTurned = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not capturable: fine */ }
      };
      const release = (e) => { try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ } };
      const onMove = (e) => {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
        if (pointerActive) return;
        pointerX = e.offsetX; pointerY = e.offsetY; pointerDirty = true;
        kick();
      };
      const onUp = (e) => {
        pointerActive = false;
        release(e);
        if (moved) return;
        const hit = pick(e.offsetX, e.offsetY);
        selectedId = hit && selectedId !== hit.id ? hit.id : null;
        kick();
        if (hit) {
          const info = { kind: hit.kind, label: hit.label, refId: hit.refId, noteId: hit.noteId, sectionId: hit.sectionId, groupId: hit.groupId };
          host.dispatchEvent(new CustomEvent('nodeactivate', { detail: { id: hit.id, info, clientX: e.clientX, clientY: e.clientY } }));
        }
      };
      const onCancel = (e) => { pointerActive = false; release(e); };
      const onLeave = () => { hoverId = null; pointerDirty = false; kick(); };
      const onControlsChange = () => { needsRender = true; kick(); };
      if (opts.controls) {
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onCancel);
        canvas.addEventListener('pointerleave', onLeave);
      }
      controls.addEventListener('change', onControlsChange);
      document.addEventListener('visibilitychange', syncLoop);
      const onMotion = () => { applyMotion(); if (!reduced && !userTurned) controls.autoRotate = true; syncLoop(); };
      motionQuery.addEventListener('change', onMotion);

      host._kick = kick;
      host._resetView = () => {
        if (disposed) return;
        userTurned = false;
        controls.target.copy(target0);
        camera.position.copy(target0).addScaledVector(dir0, baseDist * fitK);
        controls.autoRotate = !reduced;
        selectedId = null;
        needsRender = true;
        kick();
      };
      // Debug/verification only (cheap, computed on call): mode, frames drawn, layer sizes.
      host._info = () => ({
        mode: still ? 'still' : reduced ? 'reduced' : 'motion', disposed, gl: env.gl.name, lowPower, dark: isDark, transparent,
        frames, looping: raf !== 0, time: t, dpr, size: [W, H], bloom: !!bloom, cited: litCount,
        camera: { position: camera.position.toArray(), target: controls.target.toArray() },
        layers: { nodes: NN, synapses: synAll, impulses: impulseCount, labels: shownPrevCount, sparks: sparksDrawn },
      });

      return () => {
        disposed = true;
        inView = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        host._pose = { position: camera.position.toArray(), target: controls.target.toArray(), autoRotate: controls.autoRotate, fitK, userTurned };
        // hooks of this scene: gone (a rebuild installs its own); kept references stay harmless
        if (host._kick === kick) host._kick = null;
        host._resetView = null;
        host._info = null;
        io.disconnect();
        ro.disconnect();
        if (opts.controls) {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('pointercancel', onCancel);
          canvas.removeEventListener('pointerleave', onLeave);
        }
        controls.removeEventListener('change', onControlsChange);
        document.removeEventListener('visibilitychange', syncLoop);
        motionQuery.removeEventListener('change', onMotion);
        controls.dispose();
        if (labelLayer) { for (const rec of labelRecs) if (rec) rec.el.remove(); labelLayer.remove(); }
        for (const slot of slots) releaseSweep(slot);
        for (const x of disposables) x.dispose();
        if (bloom) bloom.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      };
    }
  }

  if (!customElements.get('noteflow-brain')) customElements.define('noteflow-brain', NoteflowBrain);
})();
