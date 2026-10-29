# Yoergoods Digital website

Marketing site for Yoergoods Digital ("Websites that work harder"), Jordan's one-person web design studio in
Stow, Ohio. Audience: small businesses with no website, businesses with a stale site, professionals who want a
portfolio site, and buyers of the AI guides. Motion-rich, SEO-first, fully static.

- Live: https://www.yoergoodsdigital.com/ (GitHub Pages from `main` / `docs`, custom domain via `docs/CNAME`,
  HTTPS enforced). Repo: github.com/jgyoerger1/yoergoods-digital (PUBLIC; keep it technical, see "Public repo").
- The old address jordanyoerger.com/yoergoods-digital/ 301s to the domain automatically.

## Layout

```
src/data/site.json   THE config: domain, basePath, contact, service area, socials, every price, quote estimate
                     model, guide catalog, endpoints. Edit here, never hard-code prices in pages.
src/pages/<url>/index.html   front matter (title, description, path, canonical, ogtitle, robots, sitemap: no,
                     lastmod, ogimage, schematype...) + HTML body. One folder per URL.
src/partials/        head, nav, footer, mark.svg, pricing-tiers, branding-tiers, refresh-tiers, guide-buy
src/css/site.css, src/js/site.js (motion), src/js/quote.js (quote builder), src/js/lava.js (WebGL shader)
src/js/vendor/       self-hosted GSAP 3.12.5 + ScrollTrigger + Lenis 1.1.14; src/css/fonts/ Outfit + Inter
src/og/              templates rendered headless to og-image, apple-touch-icon, logo-512, lava texture
src/downloads/       lead-magnet HTML printed to PDF by the build
source/shots/        portfolio screenshots (PNG 1440x900 desktop + 390x844 mobile) -> resized to docs/img/work
source/render/       cached headless renders (reused with -SkipRender)
tools/               quote-mailer.gs (Apps Script), indexnow.ps1, go-live-domain.ps1, capture/recapture scripts
docs/                BUILD OUTPUT = the website. Never hand-edit; rebuild.
```

Template tokens (build.ps1): `{{base}}`, `{{site.a.b|money}}`, `{{price.<id>}}` / `{{price.<id>.raw}}`,
`{{#site.x}}..{{/site.x}}`, `{{^site.x}}..{{/site.x}}`, `{{include:partial|KEY=value}}`, `{{year}}`.
Unknown tokens, unknown partials or invalid JSON-LD stop the build (intended).

## Build, preview, deploy (verified against the scripts)

Requires Windows PowerShell 5.1 (`powershell.exe`, uses System.Drawing), Google Chrome or Edge for headless
renders, git. Node is only needed for the screenshot tools.

```
powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 [-SkipImages] [-SkipRender]
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 8777     # http://localhost:8777/
```
- `Build Site.cmd`, `Preview Site.cmd`, `Publish.cmd` (build + `git add -A` + commit "Update site" + push; Pages
  updates in 1-2 min). `.claude/launch.json` has a "yoergoods-site" preview entry on port 8777.
- `serve.ps1` honours `basePath` from site.json (currently "", so the root serves directly).
- After publishing, ping Bing/IndexNow: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1 -Live`
  (or `-ChangedSince yyyy-mm-dd`, `-DryRun`). Several URLs = ONE quoted comma string to `-Url` (positional binding
  is off on purpose). Submit only pages that really changed.
- Headless browser: `Find-Browser` in build.ps1 prefers Chrome, then Edge; set env `YG_BROWSER` to force one.

## Design decisions (Jordan's calls)

- Brand: navy `#0b1420`, cream `#f4efe6`, gold `#c8973f`; fonts Outfit + Inter (self-hosted).
- Logomark = two stroked SVG ribbons that braid (gold tucks under cream, crosses back lower on the stem), drawn in
  via stroke-dashoffset in the hero. Geometry lives in `src/partials/mark.svg`, `src/favicon.svg`,
  `src/img/logo-mark.svg`, `src/og/og.html`, `src/og/icon.html`: change all together.
- Hero/CTA/OG backdrop: WebGL "lava" shader baked to `img/lava.jpg` (SwiftShader headless); runs live at half
  res on pointer devices. Jordan liked the dark glossy flowing look; keep it.
- Motion: GSAP power3/power4.out easing, staggers <= 0.5s, no bounce; hooks `data-reveal`, `data-reveal-group`,
  `data-parallax`, `data-count`, `.tilt`; pinned horizontal process section; word-scrub statement.
  `prefers-reduced-motion` = static page. Content must never depend on JS (everything is in the HTML).
- Pricing comes only from `site.json` `pricing`. Tier card "Website Refresh from" must equal
  `pricing.refresh.essentials.price` (build throws otherwise). Refreshes are fixed packages (Tune-Up / Essentials /
  Plus) with opt-in extras, no payment plan. No struck-through "was" prices. The only hard-coded number is the
  Yoergoods bar on the /pricing/ comparison chart (`--lo`/`--hi` % of a $16k axis); market comparison figures in
  `src/pages/pricing/index.html` are hard-coded with cited sources (re-check every few months).
- Quote builder (`/quote/`): step 1 picks a path (site / refresh / pro / brand); `data-for`, `data-paths`,
  `data-sit`, `data-sit-not`, `data-skip-size` control visibility; "Step X of N" recounts per path. Presets via
  `?situation=`, `?size=` (tuneup|essentials|plus select refresh), `?brand=`. README has the full path table.
  With `quoteEndpoint` empty it falls back to a copyable summary + email-app button (verified working).
- AI consulting sessions were removed; `/ai/` is a noindex forward to `/guides/`. Only the guides are sold.
  Guides show "Coming soon" + notify form until `buyUrl` is set (then "Buy the guide" and Product/InStock schema).
- Portfolio page copy leads with "separate yourself from the rest of the pack".
- SEO: titles keyword-first <= 60 chars, descriptions <= 160, H1 = topic line + slogan, one JSON-LD `@graph` per
  page (LocalBusiness/WebSite/Person/WebPage), sitemap `lastmod` from git, `llms.txt`, IndexNow key file.
  Service-area wording lives only in `site.json` `serviceArea.summary`.
- Work section: five case studies (Yoerger Renovations, All Paws, June & Fern, Rutline, Jordan's portfolio) in a
  next-link chain. To add one: PNGs in `source/shots/`, copy a `src/pages/work/<x>/` folder, add cards on
  `work/index.html` and the home page.
- Writing style: plain, honest copy; the guides must be written fresh by Jordan, not from other materials.

## Gotchas

- `.ps1` files must stay ASCII (PowerShell 5.1 reads BOM-less files as ANSI). Use the Write tool for long scripts.
- Edge 150+ headless `--screenshot` / puppeteer launch silently wrote nothing on the old laptop; Chrome works.
- Plain headless screenshots catch sites mid-animation; use the puppeteer scripts in `tools/` (they nudge-scroll
  and wait). Desktop headless Chrome cannot go below ~500px wide; use puppeteer device emulation for phones.
- A hidden preview pane pauses requestAnimationFrame, so GSAP/ScrollTrigger cannot be verified there; drive
  headless Chrome. Puppeteer sets `navigator.webdriver`, which shows all reveal blocks; override it to test the
  real reveal path.
- Reveals use opacity + a failsafe, never `visibility:hidden` (that hid content from crawlers); counters must not
  render "$0" before scrolling.
- `source/shots${name}-desktop.png` and `-mobile.png` are stray files from an unexpanded template string; safe to
  delete (ask Jordan first).

## New machine

Hard-coded paths that will break (do not silently rewrite; fix deliberately):
- `tools/capture-new-work.cjs:6` and `tools/recapture-shots.cjs:2` require puppeteer-core from the old user's
  global HyperFrames install under AppData. Fix: `npm i -D puppeteer-core` (or a global install) and require it.
- `tools/capture-new-work.cjs:31`, `tools/recapture-shots.cjs:12`: Chrome at `C:/Program Files/Google/Chrome/...`.
- `tools/recapture-shots.cjs:4`: output dir hard-coded to `C:/Dev/yoergoods-digital/source/shots`.
- `tools/go-live-domain.ps1:85`: commits with a hard-coded author identity; change it to Jordan's personal or
  GitHub noreply identity before ever running it (the domain cut-over is already done, so it is rarely needed).
- `source/render/og.html:8`, `source/render/lava.html:6` contain `file:///C:/Dev/...` URLs, but they are
  regenerated by build.ps1 from `src/og/` on each full render, so they self-heal.
- README.md lines 74 and 139 point at the private business kit as `C:\Dev\yoergoods-business` (sibling folder).
- Set this repo's git identity to the GitHub noreply address before committing.

## Not in the repo (bring separately)

- `seo-audit/` is gitignored: the 2026-10-14 audit findings, PDF report, screenshots and test scripts
  (`seo-audit/work/refresh-test.cjs`, `verify-all.cjs`). Copy the folder over if you want them.
- The private business kit (contracts, invoices, guide outlines) is a separate private repo, yoergoods-business.
- Accounts: GitHub (Pages), the domain registrar/DNS, Google Apps Script (quote mailer, not deployed yet),
  Google Search Console, Bing Webmaster Tools, Google Business Profile, a guide storefront (Lemon Squeezy or
  Gumroad, not set up), a newsletter provider (not set up). No keys live in the repo; the IndexNow key is public
  by design.

## Open items

- `quoteEndpoint` empty: deploy `tools/quote-mailer.gs` (setup notes at its top) and paste the /exec URL.
- `newsletterEndpoint` and every guide `buyUrl` empty; guides not written yet.
- `socials.gbp`, `linkedinCompany`, `instagram`, `facebook` empty; filling them auto-adds `sameAs` / `hasMap`.
- Search Console Domain property + sitemap, Bing import, Google Business Profile, Bing Places, Apple Business
  Connect, credit links from client sites, honest reviews (all Jordan's steps, outside the repo).
- Deferred: Stow/Kent/Hudson local landing pages, WebP + srcset for work images (test files in seo-audit),
  phone number.
