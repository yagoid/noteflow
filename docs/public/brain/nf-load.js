/* Sequential loader: pulls three.js r128 (global build) + the post-processing examples in
   dependency order, then the NoteFlow brain modules. Guarantees execution order regardless of
   how the host injects scripts. Any pre-existing <noteflow-brain> elements upgrade automatically
   once nf-brain.js defines the custom element.

   The NoteFlow modules are served from the site `base` (e.g. /noteflow/brain/…) on GitHub Pages.
   The host sets `window.__nfBase` (Astro's import.meta.env.BASE_URL) before this script runs;
   we fall back to a path derived from this script's own src so it also works standalone. */
(function () {
  if (window.__nfBrainLoading) return;
  window.__nfBrainLoading = true;

  // Resolve the directory that holds the brain modules.
  var base = (function () {
    if (typeof window.__nfBase === 'string') {
      var b = window.__nfBase;
      if (b && b.slice(-1) !== '/') b += '/';
      return b + 'brain/';
    }
    var self = document.currentScript;
    if (self && self.src) return self.src.replace(/nf-load\.js.*$/, '');
    return 'brain/';
  })();

  var THREE_BASE = 'https://unpkg.com/three@0.128.0';
  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('failed ' + src)); };
      document.head.appendChild(s);
    });
  }
  var chain = [
    THREE_BASE + '/build/three.min.js',
    THREE_BASE + '/examples/js/postprocessing/Pass.js',
    THREE_BASE + '/examples/js/shaders/CopyShader.js',
    THREE_BASE + '/examples/js/shaders/LuminosityHighPassShader.js',
    THREE_BASE + '/examples/js/postprocessing/ShaderPass.js',
    THREE_BASE + '/examples/js/postprocessing/MaskPass.js',
    THREE_BASE + '/examples/js/postprocessing/EffectComposer.js',
    THREE_BASE + '/examples/js/postprocessing/RenderPass.js',
    THREE_BASE + '/examples/js/postprocessing/UnrealBloomPass.js',
    THREE_BASE + '/examples/js/controls/OrbitControls.js',
    base + 'nf-mesh.js?v=7',
    base + 'nf-graph.js?v=8',
    base + 'nf-brain.js?v=9',
  ];
  (async function () {
    try {
      for (var i = 0; i < chain.length; i++) await load(chain[i]);
      window.dispatchEvent(new Event('nf-brain-ready'));
    } catch (e) { console.error('[nf-load]', e); }
  })();
})();
