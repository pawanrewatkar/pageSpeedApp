# PageSpeed Analyzer

A lightweight, one-page dashboard that tests websites with the **Google PageSpeed Insights API v5** (Lighthouse) on **Mobile and Desktop**, shows the full results in the browser, and lets you download client-ready **Excel** and **PDF** reports.

## Features

- **Single URL Testing**: one page on Mobile and Desktop.
- **Bulk URL Testing**: upload an `.xlsx` file with a `Website URL` column. A sample template can be downloaded from the app.
- **Whole Website Testing**: automatically finds up to 15 important pages (homepage, collections, products, blog, categories, key pages) from the sitemap and homepage links. It respects robots.txt and skips login, cart, checkout, account and search pages.
- **Results preview** with five tabs: Overview, Mobile Results, Desktop Results, Detailed Metrics and Developer Recommendations.
- **Excel report**: colour-formatted, hyperlinked evidence, frozen headers and filters.
- **PDF report**: executive summary, detailed tables, recommendations, headers, footers and page numbers.
- **Recommendations** in plain English, generated only from the actual Lighthouse audits.

## 1. Add your Google API key

1. Get a free key at https://developers.google.com/speed/docs/insights/v5/get-started#APIKey, or in Google Cloud Console enable **PageSpeed Insights API** and create an API key.
2. Open `.env.local` in the project folder and paste it:
   ```
   GOOGLE_PAGESPEED_API_KEY=your-key-here
   ```
3. Restart the app.

The key is only used on the server. It is never sent to the browser.

## 2. Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Production mode: `npm run build` then `npm start`.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository. `.env.local` is git-ignored and will not be uploaded.
2. On https://vercel.com, click **Add New → Project** and import the repository. The framework (Next.js) is detected automatically.
3. Under **Environment Variables**, add `GOOGLE_PAGESPEED_API_KEY` with your key.
4. Click **Deploy**.

Alternatively, use the CLI: `npx vercel`, then `npx vercel env add GOOGLE_PAGESPEED_API_KEY`, then `npx vercel --prod`.

**Vercel Hobby limits:** each API call tests one URL on one device, so every function call stays under the 60-second limit. Bulk runs are queued in the browser with 3 requests in parallel, retries and timeouts. Nothing is stored on the server.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (mocked API responses) |

## Project structure

```
app/
  page.tsx                 Dashboard page
  api/pagespeed/route.ts   Runs one PageSpeed test (server-side, uses the API key)
  api/discover/route.ts    Finds important pages of a website
components/                Dashboard, testing panels, progress, results tabs, UI helpers
lib/
  config.ts                Metric thresholds, score colours, limits (edit here)
  pagespeed.ts             Google API call
  psi-parse.ts             Turns the API response into metrics and audits
  metrics.ts               Pass / Warning / Fail logic and summaries
  recommendations.ts       Plain-English developer recommendations
  discover.ts              Sitemap, robots.txt and link discovery (SSRF-safe)
  runner.ts                Browser-side test queue (concurrency, retry, cancel)
  excel.ts / pdf.ts        Template, upload parsing and report generation
tests/                     Vitest unit tests
```

## Thresholds

Defined in `lib/config.ts`. The same thresholds apply to Mobile and Desktop.

| Metric | Pass | Warning | Fail |
|---|---|---|---|
| FCP | ≤ 1.8 s | ≤ 3.0 s | > 3.0 s |
| LCP | ≤ 2.5 s | ≤ 4.0 s | > 4.0 s |
| TBT | ≤ 200 ms | ≤ 600 ms | > 600 ms |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| Speed Index | ≤ 3.4 s | ≤ 5.8 s | > 5.8 s |

Performance score: 0–49 Poor (red), 50–89 Needs Improvement (orange), 90–100 Good (green).

## Security

- The API key stays server-side, and Google error messages are scrubbed of it.
- All URLs are validated. Localhost, private and link-local IPs, and credentials in URLs are rejected.
- Discovery resolves DNS and checks every redirect hop to prevent SSRF. It also has time and size limits and stays on the same domain.
- Uploads are limited to 2 MB and 50 URLs.

## Limitations

- PageSpeed Insights runs from Google's servers, so pages must be publicly reachable.
- Discovery reads the HTML the server sends. Sites that build their navigation entirely with JavaScript may only show the homepage plus sitemap pages.
- Evidence links open the public PageSpeed Insights page for the URL and device, which runs a fresh analysis. The API does not return a report ID, so none is invented.
