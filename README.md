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

- Repo: https://github.com/jgyoerger1/yoergoods-digital (public, GitHub Pages from `main` / `docs`).
- Live: https://jordanyoerger.com/yoergoods-digital/ . Jordan's user site owns the jordanyoerger.com domain, so
  project repos publish under it (All Paws works the same way). `Publish.cmd` = build + commit + push; live
  in a minute or two.

## Moving to the custom domain (when yoergoodsdigital.com is registered)

1. In `src\data\site.json` set `"domain": "https://www.yoergoodsdigital.com"` and `"basePath": ""`.
   The build then writes `docs\CNAME`, and every canonical, Open Graph, sitemap and structured-data URL follows.
2. DNS at the registrar: `www` CNAME -> `jgyoerger1.github.io`; apex A records -> 185.199.108.153,
   185.199.109.153, 185.199.110.153, 185.199.111.153 (same recipe as yoergerrenovations.com).
3. Run `Publish.cmd`. In the repo Settings > Pages, confirm the custom domain shows and tick Enforce HTTPS once
   the certificate is issued (usually within the hour).
4. The old jordanyoerger.com/yoergoods-digital/ address will 301 to the new domain automatically.

## Before going live (checklist)

1. **Domain.** `yoergoodsdigital.com` was not registered as of 2026-09-30. Register it (or pick another) and
   follow "Moving to the custom domain" above. Until then the site runs at jordanyoerger.com/yoergoods-digital/.
2. **Email.** Set `email` in site.json (currently the placeholder `hello@yoergoodsdigital.com`). It appears in
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

## AI help, guides, portfolio sites (added 2026-10-04)

- `/ai/` sells two live sessions (AI Power Hour, AI Tune-Up). Prices and booking links live in site.json under
  `ai`. With `bookUrl` empty the buttons are "Book by email"; paste a Cal.com or Calendly event URL (with its Stripe
  payment step) and they become "Pick a time".
- `/guides/` and `/guides/<slug>/` are the five guide sales pages. The catalog is site.json `guides` (title, price,
  tag, promise, pages, buyUrl). With `buyUrl` empty a page shows "Coming soon" with a notify form; paste the
  Lemon Squeezy or Gumroad checkout URL and it flips to "Buy the guide" (structured data flips PreOrder to InStock).
  Guide outlines and prompt libraries to write from are in `C:\Dev\yoergoods-business\guides\`.
- Lead magnet: `src\downloads\yoergoods-ten-ai-prompts.html` is printed to `docs\downloads\...pdf` by the build.
  The forms on /ai/ and /guides/ post the email to `newsletterEndpoint` (Buttondown: `https://buttondown.com/api/emails/embed-subscribe/<username>`;
  MailerLite and Kit have equivalents) and then show the PDF. With the endpoint empty they still hand over the
  PDF but say honestly that the list isn't connected and offer a one-line email instead.
- `/portfolio-websites/` targets professionals and job seekers; `pricing.portfolio.from` sets the price, and the
  quote builder has a "professional, not a business" starting point plus a "Portfolio site" size ($750 base).
- Services is now a dropdown (Websites, Portfolio sites, AI help, Guides) on desktop and grouped in the mobile menu.

## SEO built in

Per-page titles and descriptions, canonical URLs, Open Graph + Twitter cards with a rendered 1200x630 image,
`robots.txt` + `sitemap.xml`, JSON-LD (ProfessionalService with offers on every page, FAQPage on the home and
landing pages, BreadcrumbList and CreativeWork on subpages, Service on the landing pages), one H1 per page,
semantic landmarks, alt text and explicit image dimensions, lazy-loaded images, preconnected fonts, and a
404 page marked noindex. Lenis and GSAP load deferred and never block first paint.
