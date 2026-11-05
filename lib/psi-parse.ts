import { METRICS } from './config';
import { evaluateAll } from './metrics';
import type { Audit, Device, DeviceResult } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Google API JSON */

const METRIC_IDS = new Set<string>(METRICS.map((m) => m.id));
const SKIP_MODES = new Set(['notApplicable', 'manual', 'error']);

/** Removes markdown links ("[Learn more](https://...)") from Lighthouse descriptions. */
export function plainText(md: string | undefined): string {
  return (md || '')
    .replace(/\s*\[Learn[^\]]*\]\([^)]*\)\.?/gi, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim();
}

function toAudit(a: any): Audit {
  const metricSavings: Record<string, number> = a.metricSavings || {};
  const timeSavings = ['LCP', 'FCP', 'TBT', 'INP'].map((k) => Number(metricSavings[k]) || 0);
  return {
    id: a.id,
    title: plainText(a.title),
    description: plainText(a.description),
    displayValue: a.displayValue || '',
    score: typeof a.score === 'number' ? a.score : null,
    savingsMs: Math.round(Number(a.details?.overallSavingsMs) || Math.max(0, ...timeSavings)),
    savingsBytes: Math.round(Number(a.details?.overallSavingsBytes) || 0),
    metrics: Object.entries(metricSavings).filter(([, v]) => Number(v) > 0).map(([k]) => k),
  };
}

/** Converts a raw PageSpeed v5 response into the compact result the app uses everywhere. */
export function parsePsiResponse(data: any, url: string, device: Device, evidence: string): DeviceResult {
  const lr = data?.lighthouseResult || {};
  const audits = lr.audits || {};
  const perf = lr.categories?.performance;
  const score = typeof perf?.score === 'number' ? Math.round(perf.score * 100) : null;

  const numeric: Record<string, number | undefined> = {};
  for (const id of METRIC_IDS) numeric[id] = audits[id]?.numericValue;

  // Diagnostics/insights from the performance category, excluding metric audits and hidden duplicates.
  const refs: any[] = perf?.auditRefs || [];
  const failing = refs
    .filter((r) => r.group !== 'metrics' && r.group !== 'hidden' && !METRIC_IDS.has(r.id))
    .map((r) => audits[r.id])
    .filter((a) => a && !SKIP_MODES.has(a.scoreDisplayMode))
    .map(toAudit)
    .filter((a) => (a.score !== null && a.score < 0.9) || a.savingsMs > 0 || a.savingsBytes > 0)
    .filter((a) => a.score === null || a.score < 1)
    .sort((a, b) => b.savingsMs - a.savingsMs || (a.score ?? 1) - (b.score ?? 1));

  return {
    device,
    score,
    metrics: evaluateAll(numeric),
    audits: failing,
    evidenceUrl: evidence,
    fetchTime: lr.fetchTime || data?.analysisUTCTimestamp || new Date().toISOString(),
    finalUrl: lr.finalDisplayedUrl || lr.finalUrl || url,
  };
}
