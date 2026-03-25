/* ─────────────────────────────────────────────
   NoteFlow Landing — main.js
   ───────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Typewriter ─────────────────────────────
  const TYPE_PHRASES = [
    'your workflow.',
    'your focus.',
    'sticky notes.',
    'dev mode.',
    'fast captures.',
  ];

  const typeEl = document.getElementById('typewriter');

  if (typeEl) {
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let wait = 0;

    function tick() {
      const current = TYPE_PHRASES[phraseIdx];

      if (!deleting) {
        charIdx++;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === current.length) {
          deleting = true;
          wait = 1800;
        }
      } else {
        charIdx--;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % TYPE_PHRASES.length;
          wait = 300;
        }
      }

      const speed = deleting ? 40 : 70;
      setTimeout(tick, wait > 0 ? (wait = 0, wait || speed) : speed);
      // reset wait properly
    }

    // Cleaner tick with wait handling
    let waitMs = 0;
    function typeTick() {
      if (waitMs > 0) {
        const w = waitMs;
        waitMs = 0;
        setTimeout(typeTick, w);
        return;
      }
      const current = TYPE_PHRASES[phraseIdx];
      if (!deleting) {
        charIdx++;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === current.length) {
          deleting = true;
          waitMs = 1800;
        }
      } else {
        charIdx--;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % TYPE_PHRASES.length;
          waitMs = 320;
        }
      }
      setTimeout(typeTick, deleting ? 42 : 72);
    }
    setTimeout(typeTick, 600);
  }

  // ── Nav scroll class ───────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Scroll fade-in ─────────────────────────
  const fadeEls = document.querySelectorAll('.fade-up');
  if (fadeEls.length && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    fadeEls.forEach((el) => obs.observe(el));
  } else {
    // Fallback: show all immediately
    fadeEls.forEach((el) => el.classList.add('visible'));
  }

  // ── Smooth scroll for anchor links ─────────
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Feature cards stagger on scroll ────────
  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach((card, i) => {
    card.classList.add('fade-up');
    card.style.transitionDelay = `${i * 0.07}s`;
  });

  // ── Section headers stagger ────────────────
  document.querySelectorAll('.section-header').forEach((el) => {
    el.classList.add('fade-up');
  });
  document.querySelectorAll('.preview__wrapper, .compare__table-wrap, .download__inner, .download__terminal').forEach((el) => {
    el.classList.add('fade-up');
  });

  // ── Re-run observer after cards get classes ─
  if ('IntersectionObserver' in window) {
    const obs2 = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs2.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px' }
    );
    document.querySelectorAll('.fade-up:not(.visible)').forEach((el) => obs2.observe(el));
  }

  // ── Hero screenshot auto-cycle ──────────────
  const heroShot = document.getElementById('hero-screenshot');
  if (heroShot) {
    const HERO_THEMES = [
      'screenshots/app-main-carbon.png',
      'screenshots/app-main-midnightblue.png',
      'screenshots/app-main-tokionight.png',
      'screenshots/app-main-articday.png',
    ];
    let heroIdx = 1;
    setInterval(() => {
      heroIdx = (heroIdx + 1) % HERO_THEMES.length;
      heroShot.classList.add('fading');
      setTimeout(() => {
        heroShot.src = HERO_THEMES[heroIdx];
        heroShot.classList.remove('fading');
      }, 620);
    }, 3500);
  }

  // ── Sticky note auto-cycle ──────────────────
  const heroSticky = document.getElementById('hero-sticky');
  if (heroSticky) {
    const STICKY_THEMES = [
      'screenshots/sticky-note-carbon.png',
      'screenshots/sticky-note-tokionight.png',
      'screenshots/sticky-note-arcticday.png',
    ];
    let stickyIdx = 0;
    const stickyBody = heroSticky.closest('.hero__window-body');

    setInterval(() => {
      stickyIdx = (stickyIdx + 1) % STICKY_THEMES.length;
      const nextSrc = STICKY_THEMES[stickyIdx];

      // Preload next image to know target height before swapping
      const preload = new Image();
      preload.onload = function () {
        // Lock current height so CSS can animate from it
        stickyBody.style.height = stickyBody.offsetHeight + 'px';

        heroSticky.classList.add('fading');

        const renderedWidth = heroSticky.offsetWidth;
        const newHeight = Math.round((preload.naturalHeight / preload.naturalWidth) * renderedWidth);

        setTimeout(() => {
          heroSticky.src = nextSrc;
          stickyBody.style.height = newHeight + 'px';
          heroSticky.classList.remove('fading');
        }, 400);
      };
      preload.src = nextSrc;
    }, 4200);
  }

  // ── Theme picker ────────────────────────────
  const previewImg = document.getElementById('preview-img');
  const themeBtns = document.querySelectorAll('.theme-btn');
  if (previewImg && themeBtns.length) {
    themeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        themeBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        previewImg.src = btn.dataset.img;
      });
    });
  }

  // ── Direct download from GitHub releases ────
  function triggerDirectDownload() {
    const btn = document.getElementById('hero-download-btn');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.7';
    btn.innerHTML = `
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        style="animation: spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Fetching latest…
    `;

    fetch('https://api.github.com/repos/yagoid/noteflow/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
      .then((res) => res.json())
      .then((json) => {
        const latest = (json.tag_name || '').replace(/^v/, '');
        if (!latest) throw new Error('No tag found');
        const downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-Setup.exe`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `NoteFlow-${latest}-Setup.exe`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log('[NoteFlow] Direct download triggered:', downloadUrl);
      })
      .catch(() => {
        // Fallback: open releases page
        window.open('https://github.com/yagoid/noteflow/releases/latest', '_blank', 'noopener,noreferrer');
      })
      .finally(() => {
        btn.innerHTML = originalHTML;
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
      });
  }

  const heroDownloadBtn = document.getElementById('hero-download-btn');
  if (heroDownloadBtn) {
    heroDownloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('[NoteFlow] Download clicked from: hero-download-btn');
      triggerDirectDownload();
    });
  }

  const mainDownloadBtn = document.getElementById('main-download-btn');
  if (mainDownloadBtn) {
    mainDownloadBtn.addEventListener('click', () => {
      console.log('[NoteFlow] Releases link clicked from: main-download-btn');
    });
  }

})();
