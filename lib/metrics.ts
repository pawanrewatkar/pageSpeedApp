import { METRICS, SCORE_BANDS, type MetricConfig } from './config';
import { DEVICES, type Metric, type MetricStatus, type PageResult, type TestRun } from './types';

export const STATUS_LABEL: Record<MetricStatus, string> = {
  pass: 'Pass',
  warning: 'Warning',
  fail: 'Fail',
  na: 'Not Available',
};

export type ScoreBand = 'good' | 'average' | 'poor' | 'na';
export const SCORE_LABEL: Record<ScoreBand, string> = {
  good: 'Good',
  average: 'Needs Improvement',
  poor: 'Poor',
  na: 'Failed',
};

function formatValue(cfg: MetricConfig, v: number): string {
  if (cfg.unit === 's') return `${v.toFixed(1)} s`;
  if (cfg.unit === 'ms') return `${Math.round(v).toLocaleString('en-US')} ms`;
  return v.toFixed(3);
}

export function expectedText(cfg: MetricConfig): string {
  const v = cfg.unit === '' ? String(cfg.pass) : formatValue(cfg, cfg.pass);
  return `≤ ${v}`;
}

/** Converts a raw Lighthouse numericValue (ms, or unitless for CLS) into an evaluated metric. */
export function evaluateMetric(cfg: MetricConfig, raw: number | null | undefined): Metric {
  const base = { id: cfg.id, short: cfg.short, label: cfg.label, expected: expectedText(cfg) };
  if (raw == null || !Number.isFinite(raw)) {
    return { ...base, value: null, observed: 'N/A', status: 'na' };
  }
  // Round to the displayed precision first so the shown value and the status always agree.
  const converted = cfg.unit === 's' ? raw / 1000 : raw;
  const value =
    cfg.unit === 's' ? Math.round(converted * 10) / 10 : cfg.unit === 'ms' ? Math.round(converted) : Math.round(converted * 1000) / 1000;
  const status: MetricStatus = value <= cfg.pass ? 'pass' : value <= cfg.warn ? 'warning' : 'fail';
  return { ...base, value, observed: formatValue(cfg, value), status };
}

export function evaluateAll(numeric: Partial<Record<string, number | null | undefined>>): Metric[] {
  return METRICS.map((cfg) => evaluateMetric(cfg, numeric[cfg.id]));
}

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score == null) return 'na';
  if (score >= SCORE_BANDS.good) return 'good';
  if (score >= SCORE_BANDS.average) return 'average';
  return 'poor';
}

export function deviceStatusLabel(score: number | null | undefined): string {
  return SCORE_LABEL[scoreBand(score)];
}

/** Overall page result: based on the lower of the two device scores. */
export function pageOverall(page: PageResult): { band: ScoreBand; label: string } {
  const scores = DEVICES.map((d) => page[d]?.score).filter((s): s is number => s != null);
  if (!scores.length) return { band: 'na', label: page.status === 'cancelled' ? 'Cancelled' : 'Failed' };
  const band = scoreBand(Math.min(...scores));
  const partial = scores.length < 2 ? ' (partial)' : '';
  return { band, label: SCORE_LABEL[band] + partial };
}

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summarizeRun(run: TestRun) {
  const pages = run.pages;
  let success = 0;
  let failed = 0;
  for (const p of pages) {
    for (const d of DEVICES) {
      if (p[d]) success++;
      else if (p.errors[d]) failed++;
    }
  }
  return {
    websites: new Set(pages.map((p) => siteName(p.url))).size,
    pages: pages.length,
    success,
    failed,
    avgMobile: avg(pages.map((p) => p.mobile?.score).filter((s): s is number => s != null)),
    avgDesktop: avg(pages.map((p) => p.desktop?.score).filter((s): s is number => s != null)),
  };
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
