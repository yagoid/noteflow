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

  // ── Download button click tracking (console) ─
  ['hero-download-btn', 'main-download-btn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        console.log('[NoteFlow] Download clicked from:', id);
      });
    }
  });

})();
