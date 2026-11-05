# PageSpeed Analyzer: Project Memory

A summary of how this project was built and the decisions made along the way, so anyone (or any AI assistant) picking up the project knows the context.

_Last updated: 5 Nov 2026_

---

## 1. What the app is

**PageSpeed Analyzer** is a one-page web dashboard that tests websites with the **Google PageSpeed Insights API v5** (Lighthouse) on **Mobile and Desktop**. It shows the results on screen, then lets you download **Excel** and **PDF** reports.

Three testing modes:

1. **Single URL Testing**: one page.
2. **Bulk URL Testing**: upload an `.xlsx` file with a `Website URL` column (max 50 URLs, 2 MB). A sample template can be downloaded from the app.
3. **Whole Website Testing**: automatically finds up to 15 important pages (homepage, collections, product pages, blog, categories, other key pages) from the sitemap and homepage links. It respects robots.txt and skips login, cart, checkout, account and search pages.

Results tabs: **Overview, Mobile Results, Desktop Results, Detailed Metrics, Developer Recommendations**.

## 2. Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, Lucide React icons
- ExcelJS (Excel upload and report), jsPDF + jspdf-autotable (PDF report)
- Vitest (unit tests), ESLint
- Deploys on Vercel; no database, no login, nothing stored on the server

## 3. Important settings

| Item | Where |
|---|---|
| Google API key | `.env.local` → `GOOGLE_PAGESPEED_API_KEY=...` (git-ignored, never commit it) |
| Metric thresholds, limits | `lib/config.ts` |
| GitHub repository | https://github.com/pawanrewatkar/pageSpeedApp (branch `main`) |
| Vercel | Add `GOOGLE_PAGESPEED_API_KEY` under Project Settings → Environment Variables |

Each real PageSpeed test uses your Google API quota.

### Metric thresholds (same for Mobile and Desktop)

| Metric | Pass | Warning | Fail |
|---|---|---|---|
| FCP | ≤ 1.8 s | ≤ 3.0 s | > 3.0 s |
| LCP | ≤ 2.5 s | ≤ 4.0 s | > 4.0 s |
| TBT | ≤ 200 ms | ≤ 600 ms | > 600 ms |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| Speed Index | ≤ 3.4 s | ≤ 5.8 s | > 5.8 s |

Performance score: 0–49 Poor (red), 50–89 Needs Improvement (orange), 90–100 Good (green).

## 4. How to run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run lint
npm run typecheck
npm run build      # production build
```

## 5. Change history (from the project chat)

| # | Request | Result |
|---|---|---|
| 1 | Build a page-speed checker | First simple Node.js version (later replaced) |
| 2 | Build the complete PageSpeed Analyzer (full spec) | Rebuilt in Next.js with all three testing modes, results tabs, Excel and PDF reports and recommendations. Old files removed. |
| 3 | Replace "Back to Testing", add re-run, nicer UI | **Refresh Page** button (clears everything), **Re-run Test** beside Analyze Website, gradient header and polished styling |
| 4 | Duplicate Refresh Page buttons | Removed the ones inside the testing panels; Refresh Page stays **only in the Test Results header** |
| 5 | Evidence link should open the real result | **Not possible**: the official API returns no analysis ID (verified with a real response). Those IDs come from Google's private pagespeed.web.dev service. |
| 6 | Attach screenshot as evidence | Tried the website screenshot from Lighthouse. **You rejected it**: you wanted a snapshot of the results table, not the website. |
| 7 | Evidence = snapshot of the results table | PDF now shows an **"Evidence Snapshot (test date and time)"** under each Mobile/Desktop table, drawn to look like the on-screen results table |
| 8 | Remove PageSpeed Insights links | Removed from the PDF and the results screen |
| 9 | Remove Excel columns | **Evidence Link** and **Notes** columns removed from all Excel sheets |
| 10 | Push to GitHub | Pushed to `main` (commits `797204e`, `5952d85`) |

## 6. Decisions to keep (don't undo these)

- **No links to pagespeed.web.dev** anywhere: PDF, Excel or the results screen.
- **Evidence = "Evidence Snapshot (date time)"** in the PDF, a copy of the results table. No website screenshots.
- **Excel has no "Evidence Link" or "Notes" columns.** Failed tests show as "Failed". The failure reason appears only on screen and in the PDF's "Failed or Incomplete Tests" table.
- **Refresh Page** appears only in the Test Results header. It clears results and inputs, stops running tests, and keeps the current tab.
- **Re-run Test** re-tests the last analyzed URL, not whatever is typed in the box.
- Keep the original rules: no database or login, API key stays on the server, white background, works on phones.

## 7. Working preferences

- **Change only what is asked.** If a change has a side effect, mention it instead of silently doing more.
- Change requests usually arrive as screenshots with a **red box** around the exact thing to change.
- **Push to GitHub only when asked**, directly to `main`, and never include `.env.local`.
- Before saying a change is done: run tests, type check, lint and build, and check the PDF/Excel output with real data.

## 8. Known limitations

- Websites must be **public**, because Google runs the test from its own servers.
- Page discovery reads the site's HTML; sites that build their menu entirely with JavaScript may only show the homepage plus sitemap pages.
- Each PageSpeed test takes about 15–60 seconds; bulk runs test 3 pages' worth of requests at a time.
