// All tunable settings live here: metric thresholds, score bands and safety limits.

export type MetricId =
  | 'first-contentful-paint'
  | 'largest-contentful-paint'
  | 'total-blocking-time'
  | 'cumulative-layout-shift'
  | 'speed-index';

export interface MetricConfig {
  id: MetricId;
  short: string;
  label: string;
  /** Display unit. Lighthouse reports time in ms; 's' metrics are converted to seconds. */
  unit: 's' | 'ms' | '';
  /** Value <= pass is Pass, <= warn is Warning, above is Fail (in display units). */
  pass: number;
  warn: number;
}

// Same thresholds are used for Mobile and Desktop.
export const METRICS: MetricConfig[] = [
  { id: 'first-contentful-paint', short: 'FCP', label: 'First Contentful Paint', unit: 's', pass: 1.8, warn: 3.0 },
  { id: 'largest-contentful-paint', short: 'LCP', label: 'Largest Contentful Paint', unit: 's', pass: 2.5, warn: 4.0 },
  { id: 'total-blocking-time', short: 'TBT', label: 'Total Blocking Time', unit: 'ms', pass: 200, warn: 600 },
  { id: 'cumulative-layout-shift', short: 'CLS', label: 'Cumulative Layout Shift', unit: '', pass: 0.1, warn: 0.25 },
  { id: 'speed-index', short: 'SI', label: 'Speed Index', unit: 's', pass: 3.4, warn: 5.8 },
];

/** Lighthouse performance score bands (0-49 poor, 50-89 needs improvement, 90-100 good). */
export const SCORE_BANDS = { good: 90, average: 50 };

export const LIMITS = {
  maxUploadBytes: 2 * 1024 * 1024, // 2 MB Excel upload
  maxUrlsPerUpload: 50,
  maxDiscoveredPages: 15,
  concurrency: 3, // parallel PageSpeed requests from the browser
  retries: 2, // extra attempts for 429 / 5xx / timeouts
  apiTimeoutMs: 55_000, // server -> Google timeout (fits Vercel's 60 s function limit)
  clientTimeoutMs: 65_000, // browser -> our API timeout
  crawlTimeoutMs: 8_000, // per request during page discovery
  crawlBudgetMs: 25_000, // total time for discovery
  maxCrawlBytes: 5 * 1024 * 1024,
  maxSitemaps: 6,
};

export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/** Public PageSpeed Insights page for a URL and device. No analysis ID is available from the API. */
export function evidenceUrl(url: string, device: 'mobile' | 'desktop'): string {
  return `https://pagespeed.web.dev/analysis/${encodeURIComponent(url)}?form_factor=${device}`;
}
