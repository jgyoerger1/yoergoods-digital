/* Yoergoods Digital - behaviour and motion
   Motion stack: GSAP 3 + ScrollTrigger, Lenis smooth scroll on pointer devices (all self-hosted in js/vendor/).
   Everything degrades: no GSAP, or prefers-reduced-motion, and the page simply renders static.
   Content is never held back for long: reveals only fade (opacity, so text stays in the accessibility tree), the hero
   copy animates in CSS from the first paint, and the head script removes html.motion if this file has not set
   window.YG_MOTION_READY by DOMContentLoaded (or within 2.5 s), e.g. when it fails to load or throws. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var motion = html.classList.contains('motion') && hasGsap && !reduce;
  if (!motion) html.classList.remove('motion');   // reveal everything the CSS was holding back
  var finePointer = false;
  try { finePointer = matchMedia('(pointer: fine)').matches; } catch (e) {}

  /* ---------- nav ---------- */
  var here = location.pathname.replace(/index\.html$/, '');
  var nav = $('.nav');
  var onScroll = function () { if (nav) nav.classList.toggle('nav--scrolled', (window.scrollY || window.pageYOffset || 0) > 24); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var burger = $('.nav__burger'), menu = $('#mobile-menu');
  var closeMenu = function () {
    if (!burger || !menu) return;
    burger.setAttribute('aria-expanded', 'false'); menu.hidden = true; html.classList.remove('menu-open');
  };
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      if (open) { closeMenu(); return; }
      burger.setAttribute('aria-expanded', 'true'); menu.hidden = false; html.classList.add('menu-open');
    });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', closeMenu); });
    window.addEventListener('resize', function () { if (window.innerWidth > 980) closeMenu(); });
  }

  /* ---------- services dropdown (click/tap + keyboard; hover handled in CSS) ---------- */
  $$('.nav__dd').forEach(function (dd) {
    var btn = $('.nav__dd-btn', dd);
    var set = function (open) { dd.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', function () { set(!dd.classList.contains('is-open')); });
    dd.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target)) set(false); });
    var mine = ['/portfolio-websites/', '/branding/', '/guides/'].some(function (p) { return here.indexOf(p) > -1; });
    if (mine) btn.setAttribute('aria-current', 'page');
  });

  /* ---------- lead magnet / notify forms: post to the list endpoint when configured, then show the download ---------- */
  $$('form[data-lead]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('input[type="email"]');
      if (!email || !email.checkValidity()) { if (email) email.reportValidity(); return; }
      var endpoint = form.getAttribute('data-endpoint') || '';
      var done = form.parentNode.querySelector('.lead__done');
      var finish = function (connected) {
        form.hidden = true;
        if (!done) return;
        done.hidden = false;
        $$('[data-when="connected"]', done).forEach(function (el) { el.hidden = !connected; });
        $$('[data-when="fallback"]', done).forEach(function (el) { el.hidden = connected; });
        var ml = $('[data-mailto]', done);
        if (ml) ml.href = 'mailto:' + (form.getAttribute('data-email') || '') + '?subject=' + encodeURIComponent(form.getAttribute('data-subject') || 'Keep me posted') + '&body=' + encodeURIComponent('Please keep me posted at ' + email.value.trim() + '.');
      };
      if (!endpoint) { finish(false); return; }   // no list connected yet: be honest and offer the email route
      var body = new URLSearchParams(); body.set('email', email.value.trim());
      var tag = form.getAttribute('data-tag'); if (tag) body.set('tag', tag);
      fetch(endpoint, { method: 'POST', mode: 'no-cors', body: body }).then(function () { finish(true); }, function () { finish(false); });
    });
  });

  // mark the current page in the nav (here is declared above, before the dropdown code uses it)
  $$('.nav__links a, .footer__col a').forEach(function (a) {
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
    if (!u.hash && u.pathname.replace(/index\.html$/, '') === here && u.pathname !== '/') a.setAttribute('aria-current', 'page');
  });

  /* ---------- FAQ ---------- */
  $$('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', String(!open));
      if (panel) panel.classList.toggle('is-open', !open);
      var item = btn.closest('.faq__item'); if (item) item.classList.toggle('is-open', !open);
    });
  });

  /* ---------- email links: many visitors have no desktop email app, so a mailto click can silently do nothing.
     Copy the address and offer Gmail as a way through. Links marked data-mail-own handle this themselves. ---------- */
  var toastEl = null, toastTimer = 0;
  var hideToast = function () { if (toastEl) toastEl.classList.remove('is-on'); };
  var showMailToast = function (addr, gmailUrl, copied) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.className = 'mail-toast'; toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = '';
    var msg = document.createElement('span');
    msg.appendChild(document.createTextNode('No email app opened? '));
    var g = document.createElement('a'); g.href = gmailUrl; g.target = '_blank'; g.rel = 'noopener'; g.textContent = 'Write it in Gmail';
    msg.appendChild(g);
    msg.appendChild(document.createTextNode(copied ? ', or paste ' : ', or write to '));
    var s = document.createElement('strong'); s.textContent = addr; msg.appendChild(s);
    msg.appendChild(document.createTextNode(copied ? ' (copied).' : '.'));
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    x.addEventListener('click', hideToast);
    toastEl.appendChild(msg); toastEl.appendChild(x);
    requestAnimationFrame(function () { toastEl.classList.add('is-on'); });
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 12000);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!a || a.hasAttribute('data-mail-own')) return;
    var raw = a.getAttribute('href').slice(7), qi = raw.indexOf('?');
    var addr = decodeURIComponent(qi > -1 ? raw.slice(0, qi) : raw);
    var params; try { params = new URLSearchParams(qi > -1 ? raw.slice(qi + 1) : ''); } catch (err) { params = new URLSearchParams(''); }
    var gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(addr) +
      (params.get('subject') ? '&su=' + encodeURIComponent(params.get('subject')) : '') +
      (params.get('body') ? '&body=' + encodeURIComponent(params.get('body')) : '');
    var done = function (copied) { setTimeout(function () { showMailToast(addr, gmailUrl, copied); }, 600); };
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(addr).then(function () { done(true); }, function () { done(false); }); else done(false); }
    catch (err) { done(false); }
  });

  /* ---------- in-page anchors (smooth, Lenis-aware) ---------- */
  var lenis = null;
  var scrollToEl = function (el) {
    var top = el.getBoundingClientRect().top + (window.scrollY || 0) - 72;
    if (lenis) lenis.scrollTo(top, { duration: 1.2 });
    else window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
  };
  $$('a[href*="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (u.pathname !== location.pathname || !u.hash) return;
      var target = document.getElementById(decodeURIComponent(u.hash.slice(1)));
      if (!target) return;
      e.preventDefault(); closeMenu(); scrollToEl(target);
      if (history.pushState) history.pushState(null, '', u.hash);
    });
  });

  window.YG_MOTION_READY = true;   // this file is running: the head-script failsafe can stand down
  if (!motion) return;

  /* =================================================================== motion
     Built just after the first paint (an animation frame, then a task), so GSAP/ScrollTrigger measuring the page
     never delays it; the hero copy is already animating in CSS by then. The setup's own try/catch shows the page
     statically if anything in it breaks. A timer covers background tabs, which get no animation frames. */
  var motionStarted = false;
  var startMotion = function () { if (!motionStarted) { motionStarted = true; setupMotion(); } };
  if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(startMotion, 0); });
  setTimeout(startMotion, 1000);

  function setupMotion() {
  try {
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 0.9 });
  ScrollTrigger.config({ ignoreMobileResize: true });   // the phone address bar showing/hiding is not a reason to re-measure

  /* ---------- one IntersectionObserver plays every "once, when it scrolls into view" effect ----------
     (it replaced ~30 per-element ScrollTriggers, which all had to be re-measured on load, font swap and resize).
     whenSeen(el, play, show): play() once el's top is 110px above the viewport bottom, or right away if el is already above
     the viewport. Headless/automated browsers (navigator.webdriver: renderers, agents, screenshot tools) and browsers
     without IntersectionObserver never wait on a scroll: they get show(), the finished state, immediately. */
  var instant = true;
  try { instant = navigator.webdriver === true || typeof IntersectionObserver === 'undefined'; } catch (e) {}
  var seenIO = instant ? null : new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting && !(en.boundingClientRect.bottom < 0)) return;
      seenIO.unobserve(en.target);
      var fns = en.target._ygSeen || [];
      en.target._ygSeen = null;
      fns.forEach(function (fn) { fn(); });
    });
  }, { rootMargin: '0px 0px -110px 0px' });   // ~ "top 87%" on a phone or laptop; a fixed px band (not %) so even a
  // page-tall renderer viewport reaches every block (the footer below them is always taller than 110px)
  var whenSeen = function (el, play, show) {
    if (!seenIO) { if (show) show(); return; }
    (el._ygSeen = el._ygSeen || []).push(play);
    seenIO.observe(el);
  };
  var wideMq = null;   // sideways slide-ins only where there is room; on phones they rise like everything else
  try { wideMq = matchMedia('(min-width: 768px)'); } catch (e) {}

  /* ---------- generic reveals (opacity + transform only; the CSS start state is opacity: 0) ---------- */
  $$('[data-reveal]').forEach(function (el) {
    var type = el.getAttribute('data-reveal') || 'up';
    whenSeen(el, function () {
      var from = { opacity: 0 }, to = { opacity: 1, duration: 1.05 };
      var wide = !wideMq || wideMq.matches;
      if (type === 'up') { from.y = 44; to.y = 0; }
      if (type === 'left' || type === 'right') {
        if (wide) { from.x = type === 'left' ? -56 : 56; to.x = 0; } else { from.y = 44; to.y = 0; }
      }
      if (type === 'scale') { from.scale = 0.92; to.scale = 1; from.y = 20; to.y = 0; }
      gsap.fromTo(el, from, to);
    }, function () { gsap.set(el, { opacity: 1 }); });
  });
  $$('[data-reveal-group]').forEach(function (g) {
    var items = Array.prototype.slice.call(g.children);
    if (!items.length) return;
    var stagger = Math.min(0.12, 0.5 / items.length);
    whenSeen(g, function () {
      gsap.fromTo(items, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.95, stagger: stagger });
    }, function () { gsap.set(items, { opacity: 1 }); });
  });

  // Lenis smooth scroll on mouse/trackpad devices; touch keeps native scrolling.
  if (window.Lenis && finePointer) {
    try {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } catch (e) { lenis = null; }
  }

  /* ---------- hero ---------- */
  var hero = $('.hero');
  if (hero) {
    var tl = gsap.timeline({ delay: 0.1 });
    // the mark draws itself like a ribbon: cream first, then the gold tucks under and braids back over
    var ink = $('.hero__mark .mk--ink'), gu = $('.hero__mark .mk--gold-under'), gd = $('.hero__mark .mk--gold');
    [ink, gu, gd].forEach(function (p) { if (!p || !p.getTotalLength) return; var L = p.getTotalLength(); p.style.strokeDasharray = L + ' ' + L; p.style.strokeDashoffset = L; });
    gsap.set('.hero__mark .mk', { opacity: 1 });
    if (ink) tl.to(ink, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' }, 0.15);
    if (gu) tl.to(gu, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, 0.6);
    if (gd) tl.to(gd, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.out' }, 1.5);
    // the lava texture comes alive on pointer devices (the baked JPG stays underneath for everyone else)
    var lavaCanvas = $('.hero__lava');
    if (lavaCanvas && window.YGLava && finePointer) {
      var stopLava = YGLava.mount(lavaCanvas, { scale: 0.5 });
      if (stopLava) gsap.to(lavaCanvas, { opacity: 1, duration: 1.8, ease: 'sine.out', delay: 0.3 });
    }
    // The copy (eyebrow, H1 words, lede, buttons, proof points) animates in CSS from the first paint (site.css,
    // "hero entrance"), so it is never hidden after it has painted. Only the decoration is timed here; CSS keeps the
    // glow, rings and scroll cue transparent until this runs, so they fade in once instead of blinking.
    tl.fromTo('.hero__glow', { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 2, ease: 'sine.out' }, 0)
      .fromTo('.hero__ring', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 1.6, stagger: 0.15, ease: 'power2.out' }, 0.3)
      .to('.hero__scroll', { opacity: 1, duration: 0.8 }, 1.9);

    // ambient float on the mark, then a slow ring spin (paused while the hero is off screen)
    var ambient = [
      gsap.to('.hero__mark', { y: -12, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.8 }),
      gsap.to('.hero__ring--2', { rotation: 360, duration: 90, ease: 'none', repeat: -1, transformOrigin: '50% 50%' })
    ];
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(function (es) {
        var on = es[es.length - 1].isIntersecting;
        ambient.forEach(function (t) { t.paused(!on); });
      }).observe(hero);
    }

    // pointer: parallax on the mark + a soft gold glow that follows the cursor
    var cursor = $('.hero__cursor'), mark = $('.hero__mark');
    if (finePointer && cursor && mark) {
      var cx = gsap.quickTo(cursor, 'x', { duration: 0.6, ease: 'power3' });
      var cy = gsap.quickTo(cursor, 'y', { duration: 0.6, ease: 'power3' });
      var mx = gsap.quickTo(mark, 'rotationY', { duration: 0.9, ease: 'power2' });
      var my = gsap.quickTo(mark, 'rotationX', { duration: 0.9, ease: 'power2' });
      gsap.set(mark, { transformPerspective: 900 });
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        cx(e.clientX - r.left); cy(e.clientY - r.top);
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        mx(nx * 14); my(-ny * 10);
      });
      hero.addEventListener('pointerenter', function () { gsap.to(cursor, { opacity: 1, duration: 0.6 }); });
      hero.addEventListener('pointerleave', function () { gsap.to(cursor, { opacity: 0, duration: 0.6 }); mx(0); my(0); });
    }

    // the hero recedes as you scroll away
    gsap.to('.hero__inner', { yPercent: -10, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---------- statement: words light up as you read down (scroll-driven, so automated browsers get it lit) ---------- */
  var statement = $('.statement__text');
  if (statement && !instant) {
    if (!statement.querySelector('.w')) {
      // wrap every word (keeping <em> highlights intact)
      var wrap = function (node) {
        if (node.nodeType === 3) {
          var frag = document.createDocumentFragment();
          node.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
          });
          node.parentNode.replaceChild(frag, node);
        } else if (node.nodeType === 1) {
          Array.prototype.slice.call(node.childNodes).forEach(wrap);
        }
      };
      wrap(statement);
    }
    gsap.fromTo($$('.w', statement), { opacity: 0.14 }, {
      opacity: 1, stagger: 0.04, ease: 'none',
      scrollTrigger: { trigger: statement, start: 'top 72%', end: 'bottom 42%', scrub: 0.5 }
    });
  }

  /* ---------- process: horizontal scroll pinned on desktop ---------- */
  var pin = $('.process__pin'), track = $('.process__track'), bar = $('.process__bar i'), hint = $('.process__hint');
  if (pin && track) {
    var mm = gsap.matchMedia();
    mm.add('(min-width: 981px)', function () {
      var dist = function () { return Math.max(0, track.scrollWidth - pin.clientWidth + 48); };
      if (bar) bar.parentNode.style.display = 'block';
      if (hint) hint.style.display = 'block';
      var tween = gsap.to(track, {
        x: function () { return -dist(); }, ease: 'none',
        scrollTrigger: {
          trigger: pin, pin: true, scrub: 0.7, start: 'top top', anticipatePin: 1, invalidateOnRefresh: true,
          end: function () { return '+=' + dist(); },
          onUpdate: function (st) { if (bar) gsap.set(bar, { scaleX: st.progress }); if (hint) hint.style.opacity = st.progress > 0.9 ? 0 : 1; }
        }
      });
      // each card lifts slightly as it enters from the right
      $$('.step', track).forEach(function (card) {
        gsap.fromTo(card, { y: 40, opacity: 0.4 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 95%', end: 'left 60%', scrub: true } });
      });
      return function () { if (bar) bar.parentNode.style.display = ''; if (hint) hint.style.display = ''; };
    });
  }

  /* ---------- counters: the real price stays in the DOM (as the server rendered it) until the count-up starts on
     screen; only then does it drop to zero and count back up. Automated browsers never see anything but the price. ---------- */
  $$('[data-count]').forEach(function (el) {
    var end = parseFloat(el.getAttribute('data-count'));
    if (!isFinite(end)) return;   // no usable number: leave the rendered text alone
    var prefix = el.getAttribute('data-prefix') || '', suffix = el.getAttribute('data-suffix') || '';
    var fmt = function (n) { return prefix + Math.round(n).toLocaleString('en-US') + suffix; };
    whenSeen(el, function () {
      var o = { v: 0 };
      gsap.to(o, {
        v: end, duration: 1.6, ease: 'power2.out',
        onStart: function () { el.textContent = fmt(0); },
        onUpdate: function () { el.textContent = fmt(o.v); },
        onComplete: function () { el.textContent = fmt(end); }
      });
    });
  });

  /* ---------- pricing comparison bars (decorative; the ranges are also written out as text) ---------- */
  $$('.range__fill').forEach(function (bar, i) {
    if (instant) return;
    gsap.set(bar, { scaleX: 0 });
    whenSeen(bar, function () { gsap.to(bar, { scaleX: 1, duration: 1.1, ease: 'power3.out', delay: i * 0.08 }); });
  });

  /* ---------- parallax images ---------- */
  $$('[data-parallax]').forEach(function (img) {
    var amt = parseFloat(img.getAttribute('data-parallax')) || 8;
    gsap.fromTo(img, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---------- 3D tilt on hover ---------- */
  if (finePointer) {
    $$('.tilt').forEach(function (card) {
      var rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
      var ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
      gsap.set(card, { transformPerspective: 1000 });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        ry(nx * 8); rx(-ny * 8);
      });
      card.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  }

  /* ---------- section headings: a line draws under the eyebrow ---------- */
  $$('.section__head .eyebrow').forEach(function (eb) {
    if (instant) return;
    gsap.set(eb, { '--line-scale': 0 });
    whenSeen(eb, function () { gsap.to(eb, { '--line-scale': 1, duration: 1 }); });
  });

  /* ---------- keep ScrollTrigger honest after fonts land. ScrollTrigger already refreshes itself on DOMContentLoaded
     and load, so only a font swap that finishes after load needs another pass. ---------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (document.readyState === 'complete') ScrollTrigger.refresh(); });
  }
  } catch (err) {
    // something in the motion layer broke: show the page as it is in the HTML rather than leave anything hidden
    html.classList.remove('motion');
    $$('[data-reveal], [data-reveal-group] > *').forEach(function (el) { el.style.opacity = ''; el.style.visibility = ''; });
    if (window.console && console.error) console.error(err);
  }
  }
})();
