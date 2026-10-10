// Captures portfolio screenshots for Rutline and June & Fern into source\shots (desktop 1440x900, phone 390x844),
// plus a few extra views used inside the case studies. Uses system Chrome via the puppeteer-core that ships with
// the global HyperFrames install (Edge headless does not write files on this laptop).
// Run: node tools\capture-new-work.cjs
const { createRequire } = require('module');
const req = createRequire('C:/Users/Jordan.Yoerger/AppData/Local/Programs/nodejs/node_modules/hyperframes/node_modules/puppeteer-core/package.json');
const puppeteer = req('puppeteer-core');
const path = require('path');
const OUT = path.join(__dirname, '..', 'source', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Rutline: skip sign-in (local-only), onboarding (home set) and the once-per-session splash.
const rutlineSettings = JSON.stringify({
  home: { lat: 41.2185, lon: -81.4537, label: 'Portage County, Ohio' },
  units: 'imperial', mapLayer: 'satellite', localOnly: true, parcelsEnabled: true,
  hunter: { name: '', phone: '', email: '' }
});
const rutlinePrep = `try { localStorage.setItem('rutline.settings.v1', ${JSON.stringify(rutlineSettings)});
  sessionStorage.setItem('rutline.splash.seen', '1'); } catch (e) {}`;

const jobs = [
  { name: 'rutline', url: 'https://jordanyoerger.com/rutline/#/map', prep: rutlinePrep, wait: 7000 },
  { name: 'rutline-huntcast', url: 'https://jordanyoerger.com/rutline/#/huntcast', prep: rutlinePrep, wait: 6000, only: 'both' },
  { name: 'rutline-guide', url: 'https://jordanyoerger.com/rutline/#/guide/scoring-a-buck', prep: rutlinePrep, wait: 6000, only: 'desktop' },
  { name: 'june-and-fern', url: 'https://jordanyoerger.com/june-and-fern/', prep: `try { sessionStorage.setItem('jf.intro','1') } catch (e) {}`, wait: 9000 },
  { name: 'june-and-fern-shop', url: 'https://jordanyoerger.com/june-and-fern/shop/', prep: '', wait: 5000, only: 'desktop' }
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  for (const j of jobs) {
    const sizes = [];
    if (j.only !== 'phone') sizes.push(['desktop', { width: 1440, height: 900 }]);
    if (!j.only || j.only === 'both' || j.only === 'phone') sizes.push(['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }]);
    for (const [suffix, vp] of sizes) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      if (j.prep) await page.evaluateOnNewDocument(j.prep);
      try { await page.goto(j.url, { waitUntil: 'networkidle2', timeout: 60000 }); }
      catch (e) { console.log('  (slow load)', j.name, suffix, e.message.split('\n')[0]); }
      await sleep(j.wait);
      const file = path.join(OUT, `${j.name}-${suffix}.png`);
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => ({ title: document.title, hash: location.hash, h: document.body.innerText.slice(0, 80).replace(/\s+/g, ' ') }));
      console.log('captured', path.basename(file), JSON.stringify(info));
      await page.close();
    }
  }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
