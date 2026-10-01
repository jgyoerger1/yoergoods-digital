const { createRequire } = require('module');
const req = createRequire('C:/Users/Jordan.Yoerger/AppData/Local/Programs/nodejs/node_modules/hyperframes/node_modules/puppeteer-core/package.json');
const puppeteer = req('puppeteer-core');
const OUT = 'C:/Dev/yoergoods-digital/source/shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sites = [
  ['yoerger-renovations', 'https://www.yoergerrenovations.com/'],
  ['all-paws', 'https://jordanyoerger.com/all-paws/'],
  ['jordan-portfolio', 'https://jordanyoerger.com/']
];
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--hide-scrollbars'] });
  for (const [name, url] of sites) {
    for (const [suffix, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }]]) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      // nudge the page so scroll-triggered reveals fire, then return to the top and let the entrance finish
      await page.evaluate(() => window.scrollTo(0, 40));
      await sleep(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(5000);
      await page.screenshot({ path: `${OUT}/${name}-${suffix}.png` });
      console.log('captured', name, suffix);
      await page.close();
    }
  }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
