# Yoergoods Digital website

Static, motion-rich marketing site for Yoergoods Digital ("Websites that work harder"), with a seven-step
quote builder. No installs needed: Windows PowerShell 5.1 plus Microsoft Edge (already on the machine) build
everything. Motion comes from GSAP 3 + ScrollTrigger and Lenis smooth scroll, loaded from public CDNs.

```
yoergoods-digital\
  src\
    data\site.json          <- THE place to edit: domain, email, quote endpoint, socials, prices, tiers
    pages\                  <- one folder per URL; each index.html = front matter + body
      index.html            <- home
      quote\                <- quote builder
      work\ + 3 case studies
      new-website\          <- landing page for "I don't have a website"
      website-refresh\      <- landing page for "my site is stale"
      404.html
    partials\               <- head.html, nav.html, footer.html, mark.svg (the logomark)
    css\site.css  js\site.js (motion)  js\quote.js (quote builder)
    og\                     <- templates rendered to og-image.png and apple-touch-icon.png
  source\
    shots\                  <- portfolio screenshots (PNG, 1440x900 desktop + 390x844 mobile)
    people\                 <- headshot
    render\                 <- last rendered og-image.png / apple-touch-icon.png (kept between builds)
  tools\quote-mailer.gs     <- Google Apps Script that turns quote submissions into emails
  build.ps1                 <- the generator
  serve.ps1                 <- tiny local web server for docs\
  Build Site.cmd / Preview Site.cmd / Publish.cmd
  docs\                     <- OUTPUT. This folder is the website. Deploy it as-is (GitHub Pages: main / docs).
```

## Build and preview

```
powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 8777
```
then open http://localhost:8777/. `-SkipImages` and `-SkipRender` speed up text-only rebuilds.
Or double-click `Build Site.cmd` and `Preview Site.cmd`.

## Where it lives

- Live: **https://www.yoergoodsdigital.com/** since 2026-10-09 (domain registered at Squarespace Domains; DNS there: four A
  records @ -> 185.199.108-111.153, CNAME www -> jgyoerger1.github.io; Squarespace Defaults preset removed).
  The apex and the old jordanyoerger.com/yoergoods-digital/ address 301 to www. HTTPS enforced.
- Repo: https://github.com/jgyoerger1/yoergoods-digital (public, GitHub Pages from `main` / `docs`).
  `Publish.cmd` = build + commit + push; live in a minute or two.
- Headless renders (social image, lava texture, icon, lead-magnet PDF) use Chrome first; Edge 150+ headless
  stopped writing files on this laptop. Set YG_BROWSER to force a browser.

## Moving to the custom domain

Checked 2026-10-09: yoergoodsdigital.com, yoergoods.com, yoergoods.digital, yoergoods.co and yoergoods.net were all
unregistered. Plan: register **yoergoodsdigital.com** (the site, email, and every mention already use it) and
**yoergoods.com** (hold it for the umbrella brand; forward it later).

1. **Register** at Cloudflare Registrar (dash.cloudflare.com > Domain Registration > Register Domains; about $11
   a year for a .com, at cost, auto-renew on, WHOIS privacy included). Squarespace Domains or Porkbun work too.
2. **DNS records** (Cloudflare: DNS > Records; set each to "DNS only", the grey cloud, so GitHub can issue the
   certificate):
   - `CNAME  www  ->  jgyoerger1.github.io`
   - `A  @  ->  185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. **Wait a few minutes**, then from the repo root:
   `powershell -NoProfile -ExecutionPolicy Bypass -File tools\go-live-domain.ps1 -Check`
   until it reports both records OK.
4. **Switch**: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\go-live-domain.ps1`
   It sets domain/basePath in site.json, rebuilds (writes `docs\CNAME`, re-renders the social image with the new
   host), commits and pushes, sets the custom domain on GitHub Pages, waits for the certificate, enforces HTTPS and
   checks the live URLs. If the certificate is still pending it says so; run again later with `-EnableHttps`.
5. The old jordanyoerger.com/yoergoods-digital/ address 301s to the new domain automatically. Add the new property
   in Google Search Console and submit `/sitemap.xml`.
6. **Email**: the site uses jgyoerger@gmail.com everywhere (site.json `email`) since 2026-10-11. A Squarespace forwarding rule for hello@yoergoodsdigital.com also exists but nothing on the site uses it.
7. If you'd rather host on Cloudflare Pages than GitHub Pages, see `C:\Dev\yoergoods-business\docs\cloudflare-hosting.md`;
   the site.json change in step 4 is the same, and `Publish.cmd` keeps working either way.

## Before going live (checklist)

1. **Domain.** `yoergoodsdigital.com` was not registered as of 2026-09-30. Register it (or pick another) and
   follow "Moving to the custom domain" above. Until then the site runs at jordanyoerger.com/yoergoods-digital/.
2. **Email.** `email` in site.json is jgyoerger@gmail.com. It appears in
   the footer, CTAs and the mailto fallback of the quote builder.
3. **Quote inbox.** Follow the setup notes at the top of `tools\quote-mailer.gs` (Apps Script web app, about
   ten minutes). Paste the `/exec` URL into `quoteEndpoint` in site.json and rebuild. Until then the quote
   builder still works: it shows the prospect a copyable summary and an "open in my email app" button.
4. **Prices.** The tier "from" prices, the care plan and the estimate model (base by size, feature add-ons,
   refresh multiplier) are all in site.json under `pricing`. They are placeholders to confirm. The quote builder
   and every price on the site read from there, so one edit updates everything.
5. **Location and socials.** `location` is "Stow, Ohio"; `socials.linkedin` is set, Instagram and Facebook are
   empty (empty ones are simply not shown).
6. **GitHub Pages.** Done: repo created and Pages enabled from `main` / `docs` on 2026-09-30. For the custom domain, add the
   custom domain and turn on Enforce HTTPS. Point DNS: `www` CNAME to `<user>.github.io`, apex A records to
   GitHub's four IPs (same recipe as yoergerrenovations.com).
7. **Search Console.** Verify the domain, submit `/sitemap.xml`.

## Refreshing portfolio screenshots

`node toolsecapture-shots.cjs` re-captures the three live sites (desktop 1440x900 and phone 390x844) into
`sourceshots` after their entrance animations finish, using the puppeteer-core that ships inside the global
HyperFrames install. Plain headless Edge screenshots catch those sites mid-animation (clipped headlines), so use
the script. Then run `build.ps1`.

## Editing content

- Pages are plain HTML with a short front matter block (`title`, `description`, `path`, `ogtitle`, `bodyclass`,
  optional `scripts`, `robots`, `sitemap: no`). Tokens: `{{base}}`, `{{site.email}}`, `{{site.location}}`,
  `{{price.launch}}` (formatted) or `{{price.launch.raw}}`, `{{include:mark}}`, `{{year}}`.
- Motion hooks: add `data-reveal` (or `data-reveal="left|right|scale"`) to an element, `data-reveal-group` to a
  container whose children should stagger in, `data-parallax="6"` to an image, `data-count="1200"
  data-prefix="$"` to a number. `.tilt` adds a 3D hover tilt. The build never requires JS for content:
  everything is in the HTML for search engines, and with `prefers-reduced-motion` the page is simply static.
- Adding a portfolio piece: drop `name-desktop.png` (1440x900) and `name-mobile.png` (390x844) in
  `source\shots\`, copy one of the case-study folders under `src\pages\work\`, add a card to `work\index.html`
  and the home page. Screenshots can be captured with Edge:
  `msedge --headless=new --window-size=1440,900 --timeout=15000 --screenshot="C:\...\name-desktop.png" https://site`
- Pricing tiers (names, blurbs, bullet lists) live in site.json for the quote builder and the structured data,
  and are also written out in `src\pages\index.html` under the Pricing section; keep the two in step.

## Brand pieces

- **Logomark** (`src\partials\mark.svg`, `src\favicon.svg`, `src\img\logo-mark.svg`): two stroked ribbons that braid.
  The gold tucks under the cream at the junction and crosses back over lower down the stem. The hero draws it in
  stroke by stroke. Change the geometry in all three files (and `src\og\og.html`, `icon.html`) together.
- **Lava texture** (`src\js\lava.js`): a WebGL shader (domain-warped noise + specular ridges). The build bakes a
  frame to `docs\img\lava.jpg` / `lava-sm.jpg` through headless Edge (SwiftShader) and uses it in the hero, the
  CTA boxes and the social image; on pointer devices the hero also runs it live at half resolution, paused when
  offscreen. Tune colours in the FRAG string; re-run `build.ps1` (without `-SkipRender`) to re-bake.
- **Pricing page** (`/pricing/`): tiers plus a market comparison (range bars + table) with six cited sources,
  checked 30 Sep 2026. Market numbers are hard-coded in `src\pages\pricing\index.html`; your own prices come
  from site.json. Re-check the sources every few months.

## AI guides, portfolio sites (added 2026-10-04; AI sessions removed 2026-10-13)

- AI sessions were dropped on 2026-10-13. `/ai/` is now a noindex page that forwards to `/guides/` (canonical
  /guides/) so old links still land. Only `ai.bundlePrice` remains in site.json.
- `/guides/` and `/guides/<slug>/` are the five guide sales pages. The catalog is site.json `guides` (title, price,
  tag, promise, pages, buyUrl). With `buyUrl` empty a page shows "Coming soon" with a notify form; paste the
  Lemon Squeezy or Gumroad checkout URL and it flips to "Buy the guide" (structured data flips PreOrder to InStock).
  Guide outlines and prompt libraries to write from are in `C:\Dev\yoergoods-business\guides\`.
- Lead magnet: `src\downloads\yoergoods-ten-ai-prompts.html` is printed to `docs\downloads\...pdf` by the build.
  The forms on /ai/ and /guides/ post the email to `newsletterEndpoint` (Buttondown: `https://buttondown.com/api/emails/embed-subscribe/<username>`;
  MailerLite and Kit have equivalents) and then show the PDF. With the endpoint empty they still hand over the
  PDF but say honestly that the list isn't connected and offer a one-line email instead.
- `/portfolio-websites/` targets professionals and job seekers; `pricing.portfolio.from` sets the price, and the
  quote builder has its own portfolio path (`?situation=pro`), see the table under Pricing structure.
- Services is now a dropdown (Websites, Portfolio sites, Branding, AI guides) on desktop and grouped in the mobile menu.

## Pricing structure (2026-10-13)

Modelled on a local competitor's tiers, priced 10 to 20% under them as introductory rates. All prices live in
`src/data/site.json` under `pricing`; the cards come from `src/partials/pricing-tiers.html` (home + pricing) and
`src/partials/branding-tiers.html` (pricing + /branding/), so edit them once.

| Offer | id / token | From |
|---|---|---|
| One-Page Website | launch / {{price.launch}} | $500 |
| Small Business Website | grow / {{price.grow}} | $1,800 |
| Custom Business Website | custom / {{price.custom}} | $3,500 |
| Website Refresh | refresh / {{price.refresh}} | $500 |
| Portfolio Site | pricing.portfolio.from | $500 |
| Brand Essentials | pricing.branding.essentials | $300 |
| Brand Identity System | pricing.branding.identity | $1,750 |

Quote builder: step 1 picks a path and the rest of the form follows it. Elements carry `data-for="site pro brand"`
(shown only on those paths) and whole steps carry `data-paths`; step numbers ("Step 2 of 6") and the progress bar
recount per path.

| Path | Step 1 choice | Asks | Estimate |
|---|---|---|---|
| site (7 steps) | none / refresh / rebuild | business, goals, size, features, logo/photos/words, socials | size x situation + features + addons |
| pro (6 steps) | pro | role, goals, portfolio extras, resume/samples/headshot, LinkedIn | `size.portfolio` + extras (`casestudies` 300, `testimonials` 100, shared gallery/blog/booking/languages) |
| brand (6 steps) | brand | business, brand feel, package (essentials / identity / cleanup) | fixed package price |

Sizes one/small/full/large = 500/1,800/2,600/3,800; refresh x0.65; nothing below `minimum` (500); an online store
never below `storeFloor` (3,500); on the site path logo none adds Brand Essentials, identity adds the Identity
System, refresh adds `logoCleanup` (200). Links can preselect `?situation=`, `?size=` and `?brand=essentials|identity|cleanup`
(which jumps to the branding path). Email subjects read "Website quote request", "Portfolio site request" or
"Branding request". The only hard-coded number is the Yoergoods bar on the pricing comparison chart
(`--lo`/`--hi` as a % of a $16k axis).

## SEO built in

Per-page titles and descriptions, canonical URLs, Open Graph + Twitter cards with a rendered 1200x630 image,
`robots.txt` + `sitemap.xml`, JSON-LD (ProfessionalService with offers on every page, FAQPage on the home and
landing pages, BreadcrumbList and CreativeWork on subpages, Service on the landing pages), one H1 per page,
semantic landmarks, alt text and explicit image dimensions, lazy-loaded images, preconnected fonts, and a
404 page marked noindex. Lenis and GSAP load deferred and never block first paint.
