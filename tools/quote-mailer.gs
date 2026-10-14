/**
 * Yoergoods Digital - quote builder mailer (Google Apps Script web app)
 *
 * The quote builder (src/js/quote.js) posts JSON here, files as base64, and this emails the request to
 * OWNER_EMAIL with the files attached. Reply in Gmail and it goes straight to the prospect.
 *
 * Setup (once, signed in to the Google account that should receive the quotes):
 *   1. script.google.com > New project. Replace the sample code with this file. Set OWNER_EMAIL. Save.
 *   2. Pick testSend in the toolbar and click Run. Approve the permissions (it is your own script, so
 *      "Google hasn't verified this app" > Advanced > Go to project is expected). A test email arrives.
 *   3. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy.
 *   4. Copy the Web app URL (ends in /exec) into "quoteEndpoint" in src/data/site.json, rebuild, publish.
 * After editing this script later: Deploy > Manage deployments > edit > Version: New version, so the
 * same URL keeps working.
 */

var OWNER_EMAIL = 'jgyoerger@gmail.com';
var FROM_NAME = 'Yoergoods Digital website';
var MAX_FILES = 8;
var MAX_TOTAL_BYTES = 20 * 1024 * 1024;   // Gmail caps a message at 25 MB
var MAX_PER_HOUR = 40;                     // spam brake
var ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif|svg\+xml)|application\/pdf)$/;

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.company) return reply_({ ok: true });            // honeypot filled: a bot, pretend it worked
    if (!underHourlyLimit_()) return reply_({ ok: false, error: 'busy' });

    var name = clean_(d.name, 120), email = clean_(d.email, 200);
    if (!name || !email) return reply_({ ok: false, error: 'missing' });

    var files = Array.isArray(d.files) ? d.files.slice(0, MAX_FILES) : [];
    var blobs = [], skipped = 0, total = 0;
    files.forEach(function (file, i) {
      var type = String((file && file.type) || '').toLowerCase();
      if (!ALLOWED_TYPES.test(type)) { skipped++; return; }
      var bytes = Utilities.base64Decode(String(file.data || ''));
      if (total + bytes.length > MAX_TOTAL_BYTES) { skipped++; return; }
      total += bytes.length;
      blobs.push(Utilities.newBlob(bytes, type, fileName_(file.name, i, type)));
    });

    var soc = (d.socials && typeof d.socials === 'object') ? d.socials : {};
    var socLine = Object.keys(soc).map(function (k) { return k + ': ' + clean_(soc[k], 200); }).join('\n');
    var est = d.estimate && d.estimate.low ? (d.estimate.low === d.estimate.high ? '
    var rows = [
      ['Name', name], ['Business', clean_(d.businessName || d.business, 160)], ['Email', email], ['Phone', clean_(d.phone, 40)],
      ['Best way to reach', clean_(d.contactPref, 20)],
      ['Looking for', clean_(d.situationLabel, 80)], ['Current site', clean_(d.currentSite, 300)],
      ['Role', clean_(d.role, 140)], ['Goals', list_(d.goals)], ['Portfolio is for', list_(d.pgoals)], ['Brand feel', list_(d.feel)],
      ['Size', clean_(d.sizeLabel, 80)], ['Branding package', clean_(d.package, 80)], ['Extras', list_(d.features)], ['Portfolio extras', list_(d.pfeatures)],
      ['Logo', clean_(d.logo, 60)], ['Photos', clean_(d.photos, 60)], ['Words', clean_(d.copy, 60)],
      ['Resume', clean_(d.resume, 60)], ['Work samples', clean_(d.samples, 60)], ['Headshot', clean_(d.headshot, 60)],
      ['Timeline', clean_(d.timeline, 60)], ['Comfort zone', clean_(d.budget, 60)], ['Care plan', clean_(d.care, 60)],
      ['Socials', socLine], ['Estimate shown', est],
      ['Files', blobs.length ? blobs.length + ' attached' + (skipped ? ' (' + skipped + ' skipped: too large or not an image/PDF)' : '') : 'none']
    ].filter(function (r) { return r[1]; });

    var notes = clean_(d.notes, 5000);
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + (notes || '(no notes)') + '\n\nSent from ' + clean_(d.page, 300);
    var html = '<div style="font:15px/1.5 Arial,sans-serif;color:#0b1420">' +
      '<h2 style="margin:0 0 12px;font-size:20px">New quote request from ' + esc_(name) + '</h2>' +
      '<table style="border-collapse:collapse;margin-bottom:16px">' + rows.map(function (r) {
        return '<tr><td style="padding:4px 16px 4px 0;color:#5d6a80;white-space:nowrap;vertical-align:top">' + esc_(r[0]) + '</td>' +
          '<td style="padding:4px 0;white-space:pre-wrap"><b>' + esc_(r[1]) + '</b></td></tr>';
      }).join('') + '</table>' +
      '<div style="white-space:pre-wrap;background:#f4efe6;border-left:3px solid #c8973f;padding:12px 14px">' + esc_(notes || '(no notes)') + '</div>' +
      '<p style="color:#5d6a80;font-size:13px">Reply to this email to answer ' + esc_(name.split(' ')[0]) + ' directly. Sent from ' + esc_(clean_(d.page, 300)) + '.</p></div>';

    var mail = {
      to: OWNER_EMAIL,
      subject: (clean_(d.title, 140) || ('Quote request: ' + name + (d.businessName || d.business ? ' - ' + clean_(d.businessName || d.business, 80) : ''))) + (est ? ' (' + est + ')' : ''),
      body: text, htmlBody: html, name: FROM_NAME, attachments: blobs
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) mail.replyTo = email;
    MailApp.sendEmail(mail);
    return reply_({ ok: true, files: blobs.length, skipped: skipped });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// Visiting the web app URL in a browser just confirms it is running.
function doGet() { return reply_({ ok: true, service: 'Yoergoods Digital quote mailer' }); }

// Run once from the editor to grant permission and confirm emails arrive.
function testSend() {
  var pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var res = doPost({ postData: { contents: JSON.stringify({
    name: 'Test Prospect', businessName: 'Test Landscaping', email: OWNER_EMAIL, phone: '(330) 555-0100', contactPref: 'Email',
    situationLabel: "I don't have a website", goals: ['Get found on Google', 'Get calls, quotes and leads'], sizeLabel: 'Small site',
    features: ['Photo gallery or portfolio'], logo: 'No logo yet', photos: 'Some, on my phone', copy: "I'd like help writing it",
    timeline: 'In the next month or two', budget: '$1,500 to $3,000', socials: { facebook: 'facebook.com/testlandscaping' },
    estimate: { low: 2850, high: 3650 }, notes: 'This is a test from the quote mailer setup. If you can read this, the form works.',
    page: 'testSend in the Apps Script editor', files: [{ name: 'test-logo.png', type: 'image/png', data: pixel }]
  }) } });
  console.log(res.getContent());
}

function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function list_(a) { return Array.isArray(a) ? a.map(function (x) { return clean_(x, 80); }).filter(Boolean).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fileName_(name, i, type) {
  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }[type] || 'bin';
  var base = String(name || '').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file-' + (i + 1);
  return base + '.' + ext;
}
function underHourlyLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'sent-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}
 + Number(d.estimate.low).toLocaleString('en-US') : '
    var rows = [
      ['Name', name], ['Business', clean_(d.businessName || d.business, 160)], ['Email', email], ['Phone', clean_(d.phone, 40)],
      ['Best way to reach', clean_(d.contactPref, 20)],
      ['Looking for', clean_(d.situationLabel, 80)], ['Current site', clean_(d.currentSite, 300)],
      ['Role', clean_(d.role, 140)], ['Goals', list_(d.goals)], ['Portfolio is for', list_(d.pgoals)], ['Brand feel', list_(d.feel)],
      ['Size', clean_(d.sizeLabel, 80)], ['Branding package', clean_(d.package, 80)], ['Extras', list_(d.features)], ['Portfolio extras', list_(d.pfeatures)],
      ['Logo', clean_(d.logo, 60)], ['Photos', clean_(d.photos, 60)], ['Words', clean_(d.copy, 60)],
      ['Resume', clean_(d.resume, 60)], ['Work samples', clean_(d.samples, 60)], ['Headshot', clean_(d.headshot, 60)],
      ['Timeline', clean_(d.timeline, 60)], ['Comfort zone', clean_(d.budget, 60)], ['Care plan', clean_(d.care, 60)],
      ['Socials', socLine], ['Estimate shown', est],
      ['Files', blobs.length ? blobs.length + ' attached' + (skipped ? ' (' + skipped + ' skipped: too large or not an image/PDF)' : '') : 'none']
    ].filter(function (r) { return r[1]; });

    var notes = clean_(d.notes, 5000);
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + (notes || '(no notes)') + '\n\nSent from ' + clean_(d.page, 300);
    var html = '<div style="font:15px/1.5 Arial,sans-serif;color:#0b1420">' +
      '<h2 style="margin:0 0 12px;font-size:20px">New quote request from ' + esc_(name) + '</h2>' +
      '<table style="border-collapse:collapse;margin-bottom:16px">' + rows.map(function (r) {
        return '<tr><td style="padding:4px 16px 4px 0;color:#5d6a80;white-space:nowrap;vertical-align:top">' + esc_(r[0]) + '</td>' +
          '<td style="padding:4px 0;white-space:pre-wrap"><b>' + esc_(r[1]) + '</b></td></tr>';
      }).join('') + '</table>' +
      '<div style="white-space:pre-wrap;background:#f4efe6;border-left:3px solid #c8973f;padding:12px 14px">' + esc_(notes || '(no notes)') + '</div>' +
      '<p style="color:#5d6a80;font-size:13px">Reply to this email to answer ' + esc_(name.split(' ')[0]) + ' directly. Sent from ' + esc_(clean_(d.page, 300)) + '.</p></div>';

    var mail = {
      to: OWNER_EMAIL,
      subject: (clean_(d.title, 140) || ('Quote request: ' + name + (d.businessName || d.business ? ' - ' + clean_(d.businessName || d.business, 80) : ''))) + (est ? ' (' + est + ')' : ''),
      body: text, htmlBody: html, name: FROM_NAME, attachments: blobs
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) mail.replyTo = email;
    MailApp.sendEmail(mail);
    return reply_({ ok: true, files: blobs.length, skipped: skipped });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// Visiting the web app URL in a browser just confirms it is running.
function doGet() { return reply_({ ok: true, service: 'Yoergoods Digital quote mailer' }); }

// Run once from the editor to grant permission and confirm emails arrive.
function testSend() {
  var pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var res = doPost({ postData: { contents: JSON.stringify({
    name: 'Test Prospect', businessName: 'Test Landscaping', email: OWNER_EMAIL, phone: '(330) 555-0100', contactPref: 'Email',
    situationLabel: "I don't have a website", goals: ['Get found on Google', 'Get calls, quotes and leads'], sizeLabel: 'Small site',
    features: ['Photo gallery or portfolio'], logo: 'No logo yet', photos: 'Some, on my phone', copy: "I'd like help writing it",
    timeline: 'In the next month or two', budget: '$1,500 to $3,000', socials: { facebook: 'facebook.com/testlandscaping' },
    estimate: { low: 2850, high: 3650 }, notes: 'This is a test from the quote mailer setup. If you can read this, the form works.',
    page: 'testSend in the Apps Script editor', files: [{ name: 'test-logo.png', type: 'image/png', data: pixel }]
  }) } });
  console.log(res.getContent());
}

function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function list_(a) { return Array.isArray(a) ? a.map(function (x) { return clean_(x, 80); }).filter(Boolean).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fileName_(name, i, type) {
  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }[type] || 'bin';
  var base = String(name || '').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file-' + (i + 1);
  return base + '.' + ext;
}
function underHourlyLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'sent-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}
 + Number(d.estimate.low).toLocaleString('en-US') + ' to 
    var rows = [
      ['Name', name], ['Business', clean_(d.businessName || d.business, 160)], ['Email', email], ['Phone', clean_(d.phone, 40)],
      ['Best way to reach', clean_(d.contactPref, 20)],
      ['Looking for', clean_(d.situationLabel, 80)], ['Current site', clean_(d.currentSite, 300)],
      ['Role', clean_(d.role, 140)], ['Goals', list_(d.goals)], ['Portfolio is for', list_(d.pgoals)], ['Brand feel', list_(d.feel)],
      ['Size', clean_(d.sizeLabel, 80)], ['Branding package', clean_(d.package, 80)], ['Extras', list_(d.features)], ['Portfolio extras', list_(d.pfeatures)],
      ['Logo', clean_(d.logo, 60)], ['Photos', clean_(d.photos, 60)], ['Words', clean_(d.copy, 60)],
      ['Resume', clean_(d.resume, 60)], ['Work samples', clean_(d.samples, 60)], ['Headshot', clean_(d.headshot, 60)],
      ['Timeline', clean_(d.timeline, 60)], ['Comfort zone', clean_(d.budget, 60)], ['Care plan', clean_(d.care, 60)],
      ['Socials', socLine], ['Estimate shown', est],
      ['Files', blobs.length ? blobs.length + ' attached' + (skipped ? ' (' + skipped + ' skipped: too large or not an image/PDF)' : '') : 'none']
    ].filter(function (r) { return r[1]; });

    var notes = clean_(d.notes, 5000);
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + (notes || '(no notes)') + '\n\nSent from ' + clean_(d.page, 300);
    var html = '<div style="font:15px/1.5 Arial,sans-serif;color:#0b1420">' +
      '<h2 style="margin:0 0 12px;font-size:20px">New quote request from ' + esc_(name) + '</h2>' +
      '<table style="border-collapse:collapse;margin-bottom:16px">' + rows.map(function (r) {
        return '<tr><td style="padding:4px 16px 4px 0;color:#5d6a80;white-space:nowrap;vertical-align:top">' + esc_(r[0]) + '</td>' +
          '<td style="padding:4px 0;white-space:pre-wrap"><b>' + esc_(r[1]) + '</b></td></tr>';
      }).join('') + '</table>' +
      '<div style="white-space:pre-wrap;background:#f4efe6;border-left:3px solid #c8973f;padding:12px 14px">' + esc_(notes || '(no notes)') + '</div>' +
      '<p style="color:#5d6a80;font-size:13px">Reply to this email to answer ' + esc_(name.split(' ')[0]) + ' directly. Sent from ' + esc_(clean_(d.page, 300)) + '.</p></div>';

    var mail = {
      to: OWNER_EMAIL,
      subject: (clean_(d.title, 140) || ('Quote request: ' + name + (d.businessName || d.business ? ' - ' + clean_(d.businessName || d.business, 80) : ''))) + (est ? ' (' + est + ')' : ''),
      body: text, htmlBody: html, name: FROM_NAME, attachments: blobs
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) mail.replyTo = email;
    MailApp.sendEmail(mail);
    return reply_({ ok: true, files: blobs.length, skipped: skipped });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// Visiting the web app URL in a browser just confirms it is running.
function doGet() { return reply_({ ok: true, service: 'Yoergoods Digital quote mailer' }); }

// Run once from the editor to grant permission and confirm emails arrive.
function testSend() {
  var pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var res = doPost({ postData: { contents: JSON.stringify({
    name: 'Test Prospect', businessName: 'Test Landscaping', email: OWNER_EMAIL, phone: '(330) 555-0100', contactPref: 'Email',
    situationLabel: "I don't have a website", goals: ['Get found on Google', 'Get calls, quotes and leads'], sizeLabel: 'Small site',
    features: ['Photo gallery or portfolio'], logo: 'No logo yet', photos: 'Some, on my phone', copy: "I'd like help writing it",
    timeline: 'In the next month or two', budget: '$1,500 to $3,000', socials: { facebook: 'facebook.com/testlandscaping' },
    estimate: { low: 2850, high: 3650 }, notes: 'This is a test from the quote mailer setup. If you can read this, the form works.',
    page: 'testSend in the Apps Script editor', files: [{ name: 'test-logo.png', type: 'image/png', data: pixel }]
  }) } });
  console.log(res.getContent());
}

function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function list_(a) { return Array.isArray(a) ? a.map(function (x) { return clean_(x, 80); }).filter(Boolean).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fileName_(name, i, type) {
  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }[type] || 'bin';
  var base = String(name || '').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file-' + (i + 1);
  return base + '.' + ext;
}
function underHourlyLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'sent-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}
 + Number(d.estimate.high).toLocaleString('en-US')) : '';
    var rows = [
      ['Name', name], ['Business', clean_(d.businessName || d.business, 160)], ['Email', email], ['Phone', clean_(d.phone, 40)],
      ['Best way to reach', clean_(d.contactPref, 20)],
      ['Looking for', clean_(d.situationLabel, 80)], ['Current site', clean_(d.currentSite, 300)],
      ['Role', clean_(d.role, 140)], ['Goals', list_(d.goals)], ['Portfolio is for', list_(d.pgoals)], ['Brand feel', list_(d.feel)],
      ['Size', clean_(d.sizeLabel, 80)], ['Branding package', clean_(d.package, 80)], ['Extras', list_(d.features)], ['Portfolio extras', list_(d.pfeatures)],
      ['Logo', clean_(d.logo, 60)], ['Photos', clean_(d.photos, 60)], ['Words', clean_(d.copy, 60)],
      ['Resume', clean_(d.resume, 60)], ['Work samples', clean_(d.samples, 60)], ['Headshot', clean_(d.headshot, 60)],
      ['Timeline', clean_(d.timeline, 60)], ['Comfort zone', clean_(d.budget, 60)], ['Care plan', clean_(d.care, 60)],
      ['Socials', socLine], ['Estimate shown', est],
      ['Files', blobs.length ? blobs.length + ' attached' + (skipped ? ' (' + skipped + ' skipped: too large or not an image/PDF)' : '') : 'none']
    ].filter(function (r) { return r[1]; });

    var notes = clean_(d.notes, 5000);
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + (notes || '(no notes)') + '\n\nSent from ' + clean_(d.page, 300);
    var html = '<div style="font:15px/1.5 Arial,sans-serif;color:#0b1420">' +
      '<h2 style="margin:0 0 12px;font-size:20px">New quote request from ' + esc_(name) + '</h2>' +
      '<table style="border-collapse:collapse;margin-bottom:16px">' + rows.map(function (r) {
        return '<tr><td style="padding:4px 16px 4px 0;color:#5d6a80;white-space:nowrap;vertical-align:top">' + esc_(r[0]) + '</td>' +
          '<td style="padding:4px 0;white-space:pre-wrap"><b>' + esc_(r[1]) + '</b></td></tr>';
      }).join('') + '</table>' +
      '<div style="white-space:pre-wrap;background:#f4efe6;border-left:3px solid #c8973f;padding:12px 14px">' + esc_(notes || '(no notes)') + '</div>' +
      '<p style="color:#5d6a80;font-size:13px">Reply to this email to answer ' + esc_(name.split(' ')[0]) + ' directly. Sent from ' + esc_(clean_(d.page, 300)) + '.</p></div>';

    var mail = {
      to: OWNER_EMAIL,
      subject: (clean_(d.title, 140) || ('Quote request: ' + name + (d.businessName || d.business ? ' - ' + clean_(d.businessName || d.business, 80) : ''))) + (est ? ' (' + est + ')' : ''),
      body: text, htmlBody: html, name: FROM_NAME, attachments: blobs
    };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) mail.replyTo = email;
    MailApp.sendEmail(mail);
    return reply_({ ok: true, files: blobs.length, skipped: skipped });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// Visiting the web app URL in a browser just confirms it is running.
function doGet() { return reply_({ ok: true, service: 'Yoergoods Digital quote mailer' }); }

// Run once from the editor to grant permission and confirm emails arrive.
function testSend() {
  var pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var res = doPost({ postData: { contents: JSON.stringify({
    name: 'Test Prospect', businessName: 'Test Landscaping', email: OWNER_EMAIL, phone: '(330) 555-0100', contactPref: 'Email',
    situationLabel: "I don't have a website", goals: ['Get found on Google', 'Get calls, quotes and leads'], sizeLabel: 'Small site',
    features: ['Photo gallery or portfolio'], logo: 'No logo yet', photos: 'Some, on my phone', copy: "I'd like help writing it",
    timeline: 'In the next month or two', budget: '$1,500 to $3,000', socials: { facebook: 'facebook.com/testlandscaping' },
    estimate: { low: 2850, high: 3650 }, notes: 'This is a test from the quote mailer setup. If you can read this, the form works.',
    page: 'testSend in the Apps Script editor', files: [{ name: 'test-logo.png', type: 'image/png', data: pixel }]
  }) } });
  console.log(res.getContent());
}

function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function list_(a) { return Array.isArray(a) ? a.map(function (x) { return clean_(x, 80); }).filter(Boolean).join(', ') : ''; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fileName_(name, i, type) {
  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }[type] || 'bin';
  var base = String(name || '').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file-' + (i + 1);
  return base + '.' + ext;
}
function underHourlyLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'sent-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}
