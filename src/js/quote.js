/* Yoergoods Digital - quote builder
   A step-by-step wizard with a live planning estimate. Step 1 picks a path and every later step adapts to it:
     site  = a business website (none / refresh / rebuild)   7 steps
     pro   = a portfolio site for a person                    6 steps (no size step)
     brand = a logo or brand on its own                       6 steps (no features step)
   Elements carry data-for="site pro brand" to show per path; steps carry data-paths to be skipped.
   Pricing comes from window.YG.pricing (built from src/data/site.json). Submission posts JSON (files as base64)
   to window.YG.endpoint, the Apps Script mailer in tools/quote-mailer.gs. With no endpoint set, it falls back to
   Send with Gmail, a copyable summary and a mailto link. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var form = $('#quote-form');
  if (!form) return;

  var YG = window.YG || {};
  var cfg = (YG.pricing && YG.pricing.estimate) || {};
  var brandCfg = (YG.pricing && YG.pricing.branding) || {};
  var endpoint = YG.endpoint || '';
  var email = YG.email || '';
  var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var hasGsap = typeof window.gsap !== 'undefined' && !reduce && document.documentElement.classList.contains('motion');

  var steps = $$('.qstep', form), dots = $$('.qprogress li'), idx = 0;
  var progress = $('.qprogress');
  var prevBtn = $('[data-prev]', form), nextBtn = $('[data-next]', form), submitBtn = $('[data-submit]', form), errBox = $('.qnav__err', form);
  var done = $('.qdone'), side = $('.estimate');
  var rangeEl = $('[data-range]', side), emptyEl = $('[data-empty]', side), summaryEl = $('[data-summary]', side);
  var shown = { low: 0, high: 0 };

  /* ---------- helpers ---------- */
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var round50 = function (n) { return Math.round(n / 50) * 50; };
  var labelFor = function (input) {
    var opt = input.closest('.opt'); var t = opt ? $('.opt__title', opt) : null;
    return t ? t.textContent.trim() : input.value;
  };
  var checked = function (name) { return $$('input[name="' + name + '"]:checked', form); };
  var one = function (name) { return (checked(name)[0] || {}).value || ''; };
  var many = function (name) { return checked(name).map(function (i) { return i.value; }); };
  var val = function (name) { var el = form.elements[name]; return el && typeof el.value === 'string' ? el.value.trim() : ''; };
  var labelOf = function (name, value) {
    var i = $('input[name="' + name + '"][value="' + value + '"]', form);
    return i ? labelFor(i) : value;
  };
  var labels = function (name, values) { return values.map(function (v) { return labelOf(name, v); }).join(', '); };
  var pathOf = function (situation) {
    if (situation === 'pro') return 'pro';
    if (situation === 'brand') return 'brand';
    return situation ? 'site' : '';
  };
  var isShown = function (el) { return !el.closest('[hidden]'); };

  /* ---------- preselect: ?situation=, ?size=, ?brand=essentials|identity ---------- */
  try {
    var qs = new URLSearchParams(location.search);
    var preset = function (name, value) { if (!value) return; var pre = $('input[name="' + name + '"][value="' + value + '"]', form); if (pre) pre.checked = true; };
    preset('situation', qs.get('situation'));
    preset('size', qs.get('size'));
    var brandPick = qs.get('brand');
    if (brandPick === 'essentials' || brandPick === 'identity' || brandPick === 'cleanup') { preset('situation', 'brand'); preset('package', brandPick); }
  } catch (e) {}

  /* ---------- state + estimate ---------- */
  var state = function () {
    var situation = one('situation');
    return {
      situation: situation, path: pathOf(situation),
      currentSite: val('currentSite'), business: val('business'), role: val('role'),
      goals: many('goals'), pgoals: many('pgoals'), feel: many('feel'),
      size: one('size'), pkg: one('package'),
      features: many('features'), pfeatures: many('pfeatures'),
      logo: one('logo'), photos: one('photos'), copy: one('copy'),
      resume: one('resume'), samples: one('samples'), headshot: one('headshot'),
      timeline: one('timeline'), budget: one('budget'), care: one('care')
    };
  };
  var range = function (mid) { return { mid: mid, low: round50(mid * (cfg.rangeLow || 0.9)), high: round50(mid * (cfg.rangeHigh || 1.15)) }; };
  var fixed = function (price) { return { mid: price, low: round50(price), high: round50(price) }; };
  var featureSum = function (list) { return list.reduce(function (n, f) { return n + ((cfg.features || {})[f] || 0); }, 0); };
  var estimate = function (s) {
    var add = cfg.addons || {};
    if (s.path === 'brand') {
      if (s.pkg === 'essentials') return fixed((brandCfg.essentials && brandCfg.essentials.price) || 0);
      if (s.pkg === 'identity') return fixed((brandCfg.identity && brandCfg.identity.price) || 0);
      if (s.pkg === 'cleanup') return fixed(add.logoCleanup || 0);
      return null;
    }
    if (s.path === 'pro') {
      // a portfolio always starts at the portfolio price; extras add on top
      var base = (cfg.size && cfg.size.portfolio) || 0;
      return range(Math.max(base + featureSum(s.pfeatures), cfg.minimum || 0));
    }
    if (s.path !== 'site' || !s.size || !cfg.size) return null;
    var mult = (cfg.situationMultiplier && cfg.situationMultiplier[s.situation]) || 1;
    var extra = 0;
    if (s.logo === 'refresh') extra += add.logoCleanup || 0;
    if (s.logo === 'none') extra += (brandCfg.essentials && brandCfg.essentials.price) || add.brand || 0;
    if (s.logo === 'identity') extra += (brandCfg.identity && brandCfg.identity.price) || 0;
    if (s.copy === 'none') extra += add.copy || 0;
    if (s.copy === 'some') extra += (add.copy || 0) / 2;
    if (s.photos === 'none') extra += add.photos || 0;
    var site = Math.max((cfg.size[s.size] || 0) * mult + featureSum(s.features), cfg.minimum || 0);
    if (s.features.indexOf('store') > -1) site = Math.max(site, cfg.storeFloor || 0);   // stores start at the Custom tier
    return range(site + extra);
  };
  var summaryRows = function (s) {
    var rows = [];
    if (s.situation) rows.push(['Looking for', labelOf('situation', s.situation)]);
    if (s.path === 'site') {
      if (s.business) rows.push(['Business', s.business]);
      if (s.goals.length) rows.push(['Goals', labels('goals', s.goals)]);
      if (s.size) rows.push(['Size', labelOf('size', s.size)]);
      if (s.features.length) rows.push(['Extras', labels('features', s.features)]);
      if (s.logo) rows.push(['Logo', labelOf('logo', s.logo)]);
      if (s.photos) rows.push(['Photos', labelOf('photos', s.photos)]);
      if (s.copy) rows.push(['Words', labelOf('copy', s.copy)]);
    }
    if (s.path === 'pro') {
      if (s.role) rows.push(['Role', s.role]);
      if (s.pgoals.length) rows.push(['For', labels('pgoals', s.pgoals)]);
      if (s.pfeatures.length) rows.push(['Extras', labels('pfeatures', s.pfeatures)]);
      if (s.resume) rows.push(['Resume', labelOf('resume', s.resume)]);
      if (s.samples) rows.push(['Work samples', labelOf('samples', s.samples)]);
      if (s.headshot) rows.push(['Headshot', labelOf('headshot', s.headshot)]);
    }
    if (s.path === 'brand') {
      if (s.business) rows.push(['Business', s.business]);
      if (s.feel.length) rows.push(['Feel', labels('feel', s.feel)]);
      if (s.pkg) rows.push(['Package', labelOf('package', s.pkg)]);
    }
    if (s.timeline) rows.push(['Timeline', labelOf('timeline', s.timeline)]);
    if (s.budget) rows.push(['Comfort zone', labelOf('budget', s.budget)]);
    if (s.care && s.path !== 'brand') rows.push(['Care plan', labelOf('care', s.care)]);
    return rows;
  };
  var renderRange = function (est) {
    if (!rangeEl) return;
    if (!est) { rangeEl.hidden = true; if (emptyEl) emptyEl.hidden = false; shown = { low: 0, high: 0 }; return; }
    rangeEl.hidden = false; if (emptyEl) emptyEl.hidden = true;
    rangeEl.classList.toggle('is-fixed', est.low === est.high);   // a fixed package price shows as one number
    var lowEl = $('[data-low]', rangeEl), highEl = $('[data-high]', rangeEl);
    if (hasGsap) {
      gsap.to(shown, { low: est.low, high: est.high, duration: 0.8, ease: 'power2.out', overwrite: true, onUpdate: function () { lowEl.textContent = money(shown.low); highEl.textContent = money(shown.high); } });
    } else { shown = { low: est.low, high: est.high }; lowEl.textContent = money(est.low); highEl.textContent = money(est.high); }
  };

  /* ---------- path: show what belongs to it, hide the rest, renumber the steps ---------- */
  var currentPath = '';
  var activeSteps = function () {
    return steps.filter(function (st) { var p = st.getAttribute('data-paths'); return !p || !currentPath || p.split(' ').indexOf(currentPath) > -1; });
  };
  var applyPath = function (path) {
    currentPath = path;
    $$('[data-for]', form).forEach(function (el) { el.hidden = el.getAttribute('data-for').split(' ').indexOf(path) === -1; });
    var act = activeSteps();
    act.forEach(function (st, i) { var lab = $('[data-step-label]', st); if (lab) lab.textContent = 'Step ' + (i + 1) + ' of ' + act.length; });
    dots.forEach(function (d, i) { d.hidden = i >= act.length; });
    if (progress) progress.style.gridTemplateColumns = 'repeat(' + act.length + ', 1fr)';
  };

  var update = function () {
    var s = state();
    if (s.path !== currentPath) { applyPath(s.path); paintProgress(); }
    renderRange(estimate(s));
    if (summaryEl) {
      summaryEl.innerHTML = '';
      summaryRows(s).forEach(function (r) {
        var li = document.createElement('li'); var a = document.createElement('span'), b = document.createElement('span');
        a.textContent = r[0]; b.textContent = r[1]; li.appendChild(a); li.appendChild(b); summaryEl.appendChild(li);
      });
    }
    // the current-site field only matters for a refresh or rebuild
    var siteField = $('[data-if-site]', form);
    if (siteField) siteField.hidden = !(s.situation === 'refresh' || s.situation === 'rebuild');
    // mirror the business name into the contact step
    var bn = form.elements.businessName; if (bn && !bn.value && s.business) bn.placeholder = s.business;
  };
  form.addEventListener('change', update);
  form.addEventListener('input', function (e) { if (e.target && /^(business|role|currentSite)$/.test(e.target.name)) update(); });

  /* ---------- steps ---------- */
  var setErr = function (msg) { if (errBox) errBox.textContent = msg || ''; };
  var requireMsg = function (step) { return step.getAttribute('data-require-msg-' + currentPath) || step.getAttribute('data-require-msg') || 'Fill that in to continue.'; };
  var validate = function (n) {
    var step = steps[n];
    var need = step.getAttribute('data-require');
    if (need) {
      var names = need.split(/\s*,\s*/);
      for (var i = 0; i < names.length; i++) {
        var inputs = $$('[name="' + names[i] + '"]', step).filter(isShown);
        if (!inputs.length) continue;   // belongs to another path
        if (inputs[0].type === 'radio' || inputs[0].type === 'checkbox') {
          if (!inputs.some(function (x) { return x.checked; })) { setErr(requireMsg(step)); return false; }
        } else if (!inputs[0].value.trim()) { setErr(requireMsg(step)); inputs[0].focus(); return false; }
      }
    }
    // native validation for typed fields on this step
    var fields = $$('input:not([type="radio"]):not([type="checkbox"]), textarea', step);
    for (var j = 0; j < fields.length; j++) {
      if (fields[j].offsetParent === null) continue;
      if (!fields[j].checkValidity()) { fields[j].reportValidity(); return false; }
    }
    if (n === steps.length - 1 && !currentPath) { setErr('Head back to step one and pick what you need.'); return false; }
    setErr('');
    return true;
  };
  var paintProgress = function () {
    var act = activeSteps(), pos = act.indexOf(steps[idx]);
    act.forEach(function (st, i) { if (!dots[i]) return; dots[i].classList.toggle('is-done', i < pos); dots[i].classList.toggle('is-current', i === pos); });
    if (prevBtn) prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    var last = steps[idx] === act[act.length - 1];
    if (nextBtn) nextBtn.hidden = last;
    if (submitBtn) submitBtn.hidden = !last;
  };
  var neighbour = function (dir) {
    var act = activeSteps(), pos = act.indexOf(steps[idx]);
    var target = act[Math.max(0, Math.min(act.length - 1, pos + dir))];
    return steps.indexOf(target);
  };
  var show = function (n, dir) {
    var from = steps[idx], to = steps[n];
    idx = n;
    var reveal = function () {
      to.hidden = false;
      paintProgress();
      var top = form.getBoundingClientRect().top + (window.scrollY || 0) - 110;
      if ((window.scrollY || 0) > top + 40) window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      var first = $$('input:not([type="hidden"]), textarea', to).filter(isShown)[0];
      if (first && first.type !== 'file' && window.innerWidth > 980) first.focus({ preventScroll: true });
      if (hasGsap) gsap.fromTo(to.children, { opacity: 0, x: 30 * dir }, { opacity: 1, x: 0, duration: 0.55, stagger: 0.05, ease: 'power3.out', clearProps: 'opacity,transform' });
    };
    if (from === to) { reveal(); return; }
    if (hasGsap) gsap.to(from, { opacity: 0, x: -30 * dir, duration: 0.25, ease: 'power2.in', onComplete: function () { from.hidden = true; gsap.set(from, { clearProps: 'opacity,transform' }); reveal(); } });
    else { from.hidden = true; reveal(); }
  };
  steps.forEach(function (s, i) { s.hidden = i !== 0; });
  applyPath(pathOf(one('situation')));
  paintProgress();
  if (nextBtn) nextBtn.addEventListener('click', function () { if (validate(idx)) show(neighbour(1), 1); });
  if (prevBtn) prevBtn.addEventListener('click', function () { setErr(''); show(neighbour(-1), -1); });
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA' && !nextBtn.hidden) { e.preventDefault(); nextBtn.click(); }
  });
  update();

  /* ---------- files (logo, photos, inspiration) ---------- */
  var MAX_FILES = 8, MAX_EDGE = 2000, MAX_RAW = 10 * 1024 * 1024, MAX_TOTAL = 18 * 1024 * 1024;
  var drop = $('[data-drop]', form), fileInput = $('#files', form), dropList = $('.drop-list', form), dropNote = $('.drop-note', form);
  var noteDefault = dropNote ? dropNote.textContent : '';
  var picked = [], warnText = '', gen = 0;
  var note = function (text, warn) { if (dropNote) { dropNote.textContent = text; dropNote.classList.toggle('is-warn', !!warn); } };
  var size = function (n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  var readB64 = function (blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); });
  };
  var shrink = function (file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b) res(b); else rej(new Error('encode')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
      img.src = url;
    });
  };
  var prepare = function (file) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    var isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    var isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/.test(file.type);
    var isImg = /^image\//.test(file.type) || isHeic;
    var asIs = function () {
      if (file.size > MAX_RAW) return null;
      var type = isPdf ? 'application/pdf' : (file.type || (/\.heif$/i.test(file.name) ? 'image/heif' : 'image/heic'));
      return readB64(file).then(function (d) { return { name: file.name, type: type, data: d, size: file.size }; });
    };
    if (isPdf || isSvg || file.type === 'image/png' || file.type === 'image/gif') return Promise.resolve().then(asIs);   // logos keep their transparency
    if (!isImg) return Promise.resolve(null);
    return shrink(file).then(function (b) {
      return readB64(b).then(function (d) { return { name: (file.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg', type: 'image/jpeg', data: d, size: b.size }; });
    }, asIs);
  };
  var refresh = function () {
    if (!dropList) return;
    var my = ++gen;
    dropList.hidden = !picked.length;
    Promise.all(picked.map(function (p) { return p.ready; })).then(function (list) {
      if (my !== gen) return;
      var ok = list.filter(Boolean), total = ok.reduce(function (n, f) { return n + f.size; }, 0);
      if (total > MAX_TOTAL) { note('Those add up to ' + size(total) + ', more than one email can carry. Remove a few and send the rest later.', true); return; }
      var summary = ok.length ? ok.length + (ok.length === 1 ? ' file' : ' files') + ' ready (' + size(total) + '), sent with your request.' : noteDefault;
      note(warnText ? warnText + (ok.length ? ' ' + summary : '') : summary, !!warnText);
    });
  };
  var removeItem = function (p) {
    var i = picked.indexOf(p); if (i > -1) picked.splice(i, 1);
    if (p.url) URL.revokeObjectURL(p.url);
    if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
  };
  var addFiles = function (files) {
    var list = Array.prototype.slice.call(files || []), room = MAX_FILES - picked.length, left = 0;
    if (!list.length) return;
    warnText = '';
    if (list.length > room) { left = list.length - Math.max(0, room); list = list.slice(0, Math.max(0, room)); }
    if (left) warnText = 'Up to ' + MAX_FILES + ' files per request, so ' + left + (left === 1 ? ' was' : ' were') + ' left out.';
    list.forEach(function (file) {
      var el = document.createElement('div'); el.className = 'drop-item is-busy';
      var kind = document.createElement('span'); kind.className = 'drop-kind'; kind.textContent = (file.name.split('.').pop() || 'file').slice(0, 4);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'drop-x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + file.name);
      var p = { file: file, el: el, url: '' };
      if (/^image\//.test(file.type)) {
        var im = document.createElement('img'); im.alt = ''; p.url = URL.createObjectURL(file);
        im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
        im.src = p.url; el.appendChild(im);
      }
      el.appendChild(kind); el.appendChild(x);
      x.addEventListener('click', function () { removeItem(p); warnText = ''; refresh(); });
      p.ready = prepare(file).catch(function () { return null; }).then(function (r) {
        el.classList.remove('is-busy');
        if (!r) { removeItem(p); warnText = '"' + file.name + '" could not be added (images and PDFs up to 10 MB work).'; refresh(); }
        return r;
      });
      picked.push(p); dropList.appendChild(el);
    });
    refresh();
  };
  if (drop && fileInput && dropList) {
    fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    drop.addEventListener('dragleave', function (e) { if (!drop.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer) addFiles(e.dataTransfer.files); });
  }

  /* ---------- summary text (for the email body and the copy button) ---------- */
  var socialsOf = function () {
    var out = {};
    $$('.socials input', form).filter(isShown).forEach(function (i) { if (i.value.trim()) out[i.name.replace(/^social_/, '')] = i.value.trim(); });
    return out;
  };
  var requestTitle = function (s) {
    if (s.path === 'pro') return 'Portfolio site request' + (val('name') ? ': ' + val('name') : '');
    var biz = val('businessName') || s.business;
    if (s.path === 'brand') return 'Branding request' + (biz ? ': ' + biz : '');
    return 'Website quote request' + (biz ? ': ' + biz : '');
  };
  var composed = function (s, est) {
    var lines = [requestTitle(s), ''];
    summaryRows(s).forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
    if (s.currentSite && s.path === 'site') lines.push('Current site: ' + s.currentSite);
    var soc = socialsOf(); Object.keys(soc).forEach(function (k) { lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + soc[k]); });
    if (est) lines.push('Planning estimate shown: ' + (est.low === est.high ? money(est.low) : money(est.low) + ' to ' + money(est.high)));
    lines.push('');
    var who = [val('name'), val('email'), val('phone')].filter(Boolean).join(' / ');
    if (who) lines.push('Reach me at: ' + who + (val('contactPref') ? ' (prefer ' + val('contactPref').toLowerCase() + ')' : ''));
    if (val('notes')) { lines.push(''); lines.push(val('notes')); }
    if (picked.length) lines.push('', 'I have ' + picked.length + ' file' + (picked.length > 1 ? 's' : '') + ' to send you.');
    return lines.join('\n');
  };
  var finish = function (kind, title, text, body) {
    if (!done) return;
    $('[data-done-title]', done).textContent = title;
    $('[data-done-text]', done).textContent = text;
    var pre = $('pre', done), row = $('.qdone__row', done);
    pre.hidden = kind !== 'fallback'; row.hidden = kind !== 'fallback';
    if (kind === 'fallback') {
      pre.textContent = body;
      var cp = $('[data-copy]', done), ml = $('[data-mail]', done), gm = $('[data-gmail]', done), hint = $('[data-mail-hint]', done);
      var subject = requestTitle(state());
      var showHint = function (msg) { if (hint) { hint.textContent = msg; hint.hidden = false; } };
      var copyBody = function (done2) {
        var ok = function () { if (done2) done2(true); }, bad = function () { if (done2) done2(false); };
        try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(body).then(ok, bad); else bad(); } catch (e) { bad(); }
      };
      if (cp) cp.onclick = function () {
        copyBody(function (copied) {
          cp.textContent = copied ? 'Copied' : 'Select the summary above';
          setTimeout(function () { cp.textContent = 'Copy summary'; }, 1800);
          if (copied && email) showHint('Copied. Paste it into a new email to ' + email + '.');
        });
      };
      // Gmail compose works in any browser, with or without a desktop email app
      if (gm) { if (email) gm.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); else gm.hidden = true; }
      // mailto only works when the computer has an email app registered; keep the link short enough for Outlook and
      // copy the full summary on click so nothing is lost if no app opens
      if (ml) {
        if (email) {
          var mailBody = body;
          if (encodeURIComponent(mailBody).length > 1700) {
            mailBody = body.split('\n').slice(0, 12).join('\n') + '\n\n(The full summary is on my clipboard; pasting it below.)\n';
          }
          ml.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(mailBody);
          ml.onclick = function () {
            copyBody(function (copied) {
              showHint((copied ? 'Your summary is copied. ' : '') + 'If no email app opened, use Send with Gmail, or paste the summary into a new email to ' + email + '.');
            });
          };
        } else ml.hidden = true;
      }
    }
    form.hidden = true; if (side) side.classList.add('is-sent');
    done.hidden = false;
    var top = done.getBoundingClientRect().top + (window.scrollY || 0) - 110;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    if (hasGsap) gsap.fromTo(done, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
  };

  /* ---------- submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.elements.company && form.elements.company.value) return;   // honeypot
    if (!validate(idx)) return;
    var s = state(), est = estimate(s), body = composed(s, est);
    if (!endpoint) {
      finish('fallback', 'Almost there', 'One last step: send it with Gmail in one click, or copy the summary and paste it into an email to ' + (email || 'me') + '. Any files you picked can come along in that email.', body);
      return;
    }
    var label = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = picked.length ? 'Sending files...' : 'Sending...';
    var site = s.path === 'site', pro = s.path === 'pro', brand = s.path === 'brand';
    var data = {
      path: s.path, title: requestTitle(s),
      name: val('name'), businessName: pro ? '' : (val('businessName') || s.business), email: val('email'), phone: val('phone'), contactPref: val('contactPref'), notes: val('notes'),
      situation: s.situation, situationLabel: labelOf('situation', s.situation),
      currentSite: site ? s.currentSite : '', business: pro ? '' : s.business, role: pro ? s.role : '',
      goals: site ? s.goals.map(function (g) { return labelOf('goals', g); }) : [],
      pgoals: pro ? s.pgoals.map(function (g) { return labelOf('pgoals', g); }) : [],
      feel: brand ? s.feel.map(function (g) { return labelOf('feel', g); }) : [],
      size: site ? s.size : '', sizeLabel: site && s.size ? labelOf('size', s.size) : '',
      package: brand && s.pkg ? labelOf('package', s.pkg) : '',
      features: site ? s.features.map(function (f) { return labelOf('features', f); }) : [],
      pfeatures: pro ? s.pfeatures.map(function (f) { return labelOf('pfeatures', f); }) : [],
      logo: site && s.logo ? labelOf('logo', s.logo) : '', photos: site && s.photos ? labelOf('photos', s.photos) : '', copy: site && s.copy ? labelOf('copy', s.copy) : '',
      resume: pro && s.resume ? labelOf('resume', s.resume) : '', samples: pro && s.samples ? labelOf('samples', s.samples) : '', headshot: pro && s.headshot ? labelOf('headshot', s.headshot) : '',
      timeline: s.timeline ? labelOf('timeline', s.timeline) : '', budget: s.budget ? labelOf('budget', s.budget) : '', care: !brand && s.care ? labelOf('care', s.care) : '',
      socials: socialsOf(), estimate: est ? { low: est.low, high: est.high } : null, summary: body, page: location.href
    };
    Promise.all(picked.map(function (p) { return p.ready; }))
      .then(function (files) {
        var ok = files.filter(Boolean), total = ok.reduce(function (n, f) { return n + f.size; }, 0);
        if (total > MAX_TOTAL) { var big = new Error('too big'); big.tooBig = true; throw big; }
        data.files = ok.map(function (f) { return { name: f.name, type: f.type, data: f.data }; });
        // plain-text body keeps this a simple request (no CORS preflight), which Apps Script needs
        return fetch(endpoint, { method: 'POST', body: JSON.stringify(data) });
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'failed');
        finish('ok', 'Got it. Thank you.', 'Your request is in my inbox' + (data.files && data.files.length ? ' with your files' : '') + '. I will read through it and reply within one business day to set up a short call. No obligation, no pressure.', '');
      })
      .catch(function (err) {
        if (err && err.tooBig) { refresh(); if (drop) drop.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); return; }
        finish('fallback', 'That did not go through', 'No problem. Send it with Gmail in one click, or copy the summary and paste it into an email to ' + (email || 'me') + '.', body);
      })
      .then(function () { submitBtn.disabled = false; submitBtn.textContent = label; });
  });
})();
