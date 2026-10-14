/* Yoergoods Digital - quote builder
   A seven-step wizard with a live planning estimate. Pricing comes from window.YG.pricing.estimate
   (built from src/data/site.json). Submission posts JSON (files as base64) to window.YG.endpoint,
   the Apps Script mailer in tools/quote-mailer.gs. With no endpoint set, it falls back to a copyable
   summary plus a mailto link. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var form = $('#quote-form');
  if (!form) return;

  var YG = window.YG || {};
  var cfg = (YG.pricing && YG.pricing.estimate) || {};
  var endpoint = YG.endpoint || '';
  var email = YG.email || '';
  var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var hasGsap = typeof window.gsap !== 'undefined' && !reduce && document.documentElement.classList.contains('motion');

  var steps = $$('.qstep', form), dots = $$('.qprogress li'), idx = 0;
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
  var val = function (name) { var el = form.elements[name]; return el && typeof el.value === 'string' ? el.value.trim() : ''; };

  /* ---------- preselect from ?situation= ---------- */
  // links from the pricing and branding pages can preselect ?situation=, ?size= and ?brand=essentials|identity
  try {
    var qs = new URLSearchParams(location.search);
    var preset = function (name, value) { if (!value) return; var pre = $('input[name="' + name + '"][value="' + value + '"]', form); if (pre) pre.checked = true; };
    preset('situation', qs.get('situation'));
    preset('size', qs.get('size'));
    var brandPick = qs.get('brand');
    if (brandPick === 'essentials') preset('logo', 'none');
    if (brandPick === 'identity') preset('logo', 'identity');
  } catch (e) {}

  /* ---------- state + estimate ---------- */
  var state = function () {
    return {
      situation: (checked('situation')[0] || {}).value || '',
      currentSite: val('currentSite'),
      business: val('business'),
      goals: checked('goals').map(function (i) { return i.value; }),
      size: (checked('size')[0] || {}).value || '',
      features: checked('features').map(function (i) { return i.value; }),
      logo: (checked('logo')[0] || {}).value || '',
      photos: (checked('photos')[0] || {}).value || '',
      copy: (checked('copy')[0] || {}).value || '',
      timeline: (checked('timeline')[0] || {}).value || '',
      budget: (checked('budget')[0] || {}).value || '',
      care: (checked('care')[0] || {}).value || ''
    };
  };
  var estimate = function (s) {
    if (!s.size || !cfg.size) return null;
    var base = cfg.size[s.size] || 0;
    var mult = (cfg.situationMultiplier && cfg.situationMultiplier[s.situation]) || 1;
    var feats = s.features.reduce(function (n, f) { return n + ((cfg.features || {})[f] || 0); }, 0);
    var add = cfg.addons || {};
    var brand = (YG.pricing && YG.pricing.branding) || {};
    var extra = 0;
    if (s.logo === 'refresh') extra += add.logoCleanup || 0;
    if (s.logo === 'none') extra += (brand.essentials && brand.essentials.price) || add.brand || 0;
    if (s.logo === 'identity') extra += (brand.identity && brand.identity.price) || 0;
    if (s.size === 'brandonly') {
      // branding on its own: no site, no copy or photo work; nothing to estimate until a package is picked
      if (s.logo !== 'none' && s.logo !== 'identity') return null;
      return { mid: extra, low: round50(extra), high: round50(extra) };
    }
    if (s.copy === 'none') extra += add.copy || 0;
    if (s.copy === 'some') extra += (add.copy || 0) / 2;
    if (s.photos === 'none') extra += add.photos || 0;
    var site = Math.max(base * mult + feats, cfg.minimum || 0);
    if (s.features.indexOf('store') > -1) site = Math.max(site, cfg.storeFloor || 0);   // stores start at the Custom tier
    var mid = site + extra;
    return { mid: mid, low: round50(mid * (cfg.rangeLow || 0.9)), high: round50(mid * (cfg.rangeHigh || 1.15)) };
  };
  var labelOf = function (name, value) {
    var i = $('input[name="' + name + '"][value="' + value + '"]', form);
    return i ? labelFor(i) : value;
  };
  var summaryRows = function (s) {
    var rows = [];
    if (s.situation) rows.push(['Starting point', labelOf('situation', s.situation)]);
    if (s.business) rows.push(['Business', s.business]);
    if (s.goals.length) rows.push(['Goals', s.goals.map(function (g) { return labelOf('goals', g); }).join(', ')]);
    if (s.size) rows.push(['Size', labelOf('size', s.size)]);
    if (s.features.length) rows.push(['Extras', s.features.map(function (f) { return labelOf('features', f); }).join(', ')]);
    if (s.logo) rows.push(['Logo', labelOf('logo', s.logo)]);
    if (s.photos) rows.push(['Photos', labelOf('photos', s.photos)]);
    if (s.copy) rows.push(['Words', labelOf('copy', s.copy)]);
    if (s.timeline) rows.push(['Timeline', labelOf('timeline', s.timeline)]);
    if (s.budget) rows.push(['Comfort zone', labelOf('budget', s.budget)]);
    if (s.care) rows.push(['Care plan', labelOf('care', s.care)]);
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
  var update = function () {
    var s = state();
    renderRange(estimate(s));
    if (summaryEl) {
      summaryEl.innerHTML = '';
      summaryRows(s).forEach(function (r) {
        var li = document.createElement('li'); var a = document.createElement('span'), b = document.createElement('span');
        a.textContent = r[0]; b.textContent = r[1]; li.appendChild(a); li.appendChild(b); summaryEl.appendChild(li);
      });
    }
    // the current-site field only matters when a site exists
    var siteField = $('[data-if-site]', form);
    if (siteField) siteField.hidden = !s.situation || s.situation === 'none';
    // mirror the business name into the contact step
    var bn = form.elements.businessName; if (bn && !bn.value && s.business) bn.placeholder = s.business;
  };
  form.addEventListener('change', update);
  form.addEventListener('input', function (e) { if (e.target && (e.target.name === 'business' || e.target.name === 'currentSite')) update(); });

  /* ---------- steps ---------- */
  var setErr = function (msg) { if (errBox) errBox.textContent = msg || ''; };
  var validate = function (n) {
    var step = steps[n], s = state();
    var need = step.getAttribute('data-require');
    if (need) {
      var names = need.split(/\s*,\s*/);
      for (var i = 0; i < names.length; i++) {
        var name = names[i], el = form.elements[name];
        if (!el) continue;
        var isRadio = el.length && el[0] && el[0].type === 'radio';
        if (isRadio && !checked(name).length) { setErr(step.getAttribute('data-require-msg') || 'Pick one to continue.'); return false; }
        if (!isRadio && typeof el.value === 'string' && !el.value.trim()) { setErr(step.getAttribute('data-require-msg') || 'Fill that in to continue.'); el.focus(); return false; }
      }
    }
    // native validation for typed fields on this step
    var fields = $$('input:not([type="radio"]):not([type="checkbox"]), textarea', step);
    for (var j = 0; j < fields.length; j++) {
      if (fields[j].offsetParent === null) continue;
      if (!fields[j].checkValidity()) { fields[j].reportValidity(); return false; }
    }
    if (n === steps.length - 1 && !(s.situation)) { setErr('Head back to step one and pick a starting point.'); return false; }
    setErr('');
    return true;
  };
  var paintProgress = function () {
    dots.forEach(function (d, i) { d.classList.toggle('is-done', i < idx); d.classList.toggle('is-current', i === idx); });
    if (prevBtn) prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    var last = idx === steps.length - 1;
    if (nextBtn) nextBtn.hidden = last;
    if (submitBtn) submitBtn.hidden = !last;
  };
  var show = function (n, dir) {
    var from = steps[idx], to = steps[n];
    idx = n;
    var reveal = function () {
      to.hidden = false;
      paintProgress();
      var top = form.getBoundingClientRect().top + (window.scrollY || 0) - 110;
      if ((window.scrollY || 0) > top + 40) window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      var first = $('input:not([type="hidden"]), textarea', to); if (first && first.type !== 'file' && window.innerWidth > 980) first.focus({ preventScroll: true });
      if (hasGsap) gsap.fromTo(to.children, { opacity: 0, x: 30 * dir }, { opacity: 1, x: 0, duration: 0.55, stagger: 0.05, ease: 'power3.out', clearProps: 'all' });
    };
    if (from === to) { reveal(); return; }
    if (hasGsap) gsap.to(from, { opacity: 0, x: -30 * dir, duration: 0.25, ease: 'power2.in', onComplete: function () { from.hidden = true; gsap.set(from, { clearProps: 'all' }); reveal(); } });
    else { from.hidden = true; reveal(); }
  };
  steps.forEach(function (s, i) { s.hidden = i !== 0; });
  paintProgress();
  if (nextBtn) nextBtn.addEventListener('click', function () { if (validate(idx)) show(Math.min(idx + 1, steps.length - 1), 1); });
  if (prevBtn) prevBtn.addEventListener('click', function () { setErr(''); show(Math.max(idx - 1, 0), -1); });
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA' && idx < steps.length - 1) { e.preventDefault(); nextBtn.click(); }
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
    $$('.socials input', form).forEach(function (i) { if (i.value.trim()) out[i.name.replace(/^social_/, '')] = i.value.trim(); });
    return out;
  };
  var composed = function (s, est) {
    var lines = ['Quote request: ' + (val('businessName') || s.business || 'my business'), ''];
    summaryRows(s).forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
    if (s.currentSite) lines.push('Current site: ' + s.currentSite);
    var soc = socialsOf(); Object.keys(soc).forEach(function (k) { lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + soc[k]); });
    if (est) lines.push('Planning estimate shown: ' + money(est.low) + ' to ' + money(est.high));
    lines.push('');
    var who = [val('name'), val('email'), val('phone')].filter(Boolean).join(' / ');
    if (who) lines.push('Reach me at: ' + who + (val('contactPref') ? ' (prefer ' + val('contactPref').toLowerCase() + ')' : ''));
    if (val('notes')) { lines.push(''); lines.push(val('notes')); }
    if (picked.length) lines.push('', 'I have ' + picked.length + ' file' + (picked.length > 1 ? 's' : '') + ' (logo, photos or examples) to send you.');
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
      var subject = 'Website quote request' + (val('businessName') ? ': ' + val('businessName') : '');
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
    var data = {
      name: val('name'), businessName: val('businessName') || s.business, email: val('email'), phone: val('phone'), contactPref: val('contactPref'), notes: val('notes'),
      situation: s.situation, situationLabel: labelOf('situation', s.situation), currentSite: s.currentSite, business: s.business,
      goals: s.goals.map(function (g) { return labelOf('goals', g); }), size: s.size, sizeLabel: labelOf('size', s.size),
      features: s.features.map(function (f) { return labelOf('features', f); }),
      logo: s.logo ? labelOf('logo', s.logo) : '', photos: s.photos ? labelOf('photos', s.photos) : '', copy: s.copy ? labelOf('copy', s.copy) : '',
      timeline: s.timeline ? labelOf('timeline', s.timeline) : '', budget: s.budget ? labelOf('budget', s.budget) : '', care: s.care ? labelOf('care', s.care) : '',
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
