// Mocked Google PageSpeed v5 responses (shape matches the real API). Used by automated tests only.
import { parsePsiResponse } from '@/lib/psi-parse';
import { evidenceUrl } from '@/lib/config';
import type { Device, PageInput, PageResult, TestRun } from '@/lib/types';

interface Opts {
  score?: number;
  fcp?: number;
  lcp?: number;
  tbt?: number;
  cls?: number;
  si?: number;
}

export function psiResponse(url: string, o: Opts = {}) {
  const { score = 0.42, fcp = 2100, lcp = 4800, tbt = 350, cls = 0.02, si = 3900 } = o;
  return {
    id: url,
    analysisUTCTimestamp: '2026-11-05T10:00:00.000Z',
    lighthouseResult: {
      requestedUrl: url,
      finalDisplayedUrl: url,
      fetchTime: '2026-11-05T10:00:00.000Z',
      categories: {
        performance: {
          score,
          auditRefs: [
            { id: 'first-contentful-paint', group: 'metrics' },
            { id: 'largest-contentful-paint', group: 'metrics' },
            { id: 'total-blocking-time', group: 'metrics' },
            { id: 'cumulative-layout-shift', group: 'metrics' },
            { id: 'speed-index', group: 'metrics' },
            { id: 'render-blocking-resources', group: 'diagnostics' },
            { id: 'unused-javascript', group: 'diagnostics' },
            { id: 'modern-image-formats', group: 'diagnostics' },
            { id: 'unsized-images', group: 'diagnostics' },
            { id: 'uses-text-compression', group: 'diagnostics' },
            { id: 'mainthread-work-breakdown', group: 'diagnostics' },
            { id: 'render-blocking-insight', group: 'hidden' },
            { id: 'some-new-audit', group: 'diagnostics' },
          ],
        },
      },
      audits: {
        'first-contentful-paint': { id: 'first-contentful-paint', numericValue: fcp, score: 0.6 },
        'largest-contentful-paint': { id: 'largest-contentful-paint', numericValue: lcp, score: 0.2 },
        'total-blocking-time': { id: 'total-blocking-time', numericValue: tbt, score: 0.7 },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', numericValue: cls, score: 1 },
        'speed-index': { id: 'speed-index', numericValue: si, score: 0.8 },
        'render-blocking-resources': {
          id: 'render-blocking-resources', title: 'Eliminate render-blocking resources',
          description: 'Resources are blocking the first paint of your page. [Learn how to eliminate render-blocking resources](https://developer.chrome.com/docs/lighthouse).',
          score: 0, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 1,250 ms',
          details: { type: 'opportunity', overallSavingsMs: 1250 }, metricSavings: { FCP: 1250, LCP: 1250 },
        },
        'unused-javascript': {
          id: 'unused-javascript', title: 'Reduce unused JavaScript', description: 'Reduce unused JavaScript.',
          score: 0.5, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 180 KiB',
          details: { type: 'opportunity', overallSavingsMs: 450, overallSavingsBytes: 184000 }, metricSavings: { LCP: 450 },
        },
        'modern-image-formats': {
          id: 'modern-image-formats', title: 'Serve images in next-gen formats', description: 'WebP and AVIF are smaller.',
          score: 0.5, scoreDisplayMode: 'metricSavings', details: { type: 'opportunity', overallSavingsMs: 150, overallSavingsBytes: 90000 }, metricSavings: { LCP: 150 },
        },
        'unsized-images': { id: 'unsized-images', title: 'Image elements do not have explicit width and height', description: '', score: 0.5, scoreDisplayMode: 'metricSavings', metricSavings: { CLS: 0.05 } },
        'uses-text-compression': { id: 'uses-text-compression', title: 'Enable text compression', description: '', score: 1, scoreDisplayMode: 'metricSavings', details: { type: 'opportunity', overallSavingsMs: 0 } },
        'mainthread-work-breakdown': { id: 'mainthread-work-breakdown', title: 'Minimize main-thread work', description: '', score: 0.3, scoreDisplayMode: 'numeric', displayValue: '4.2 s', metricSavings: { TBT: 300 } },
        'render-blocking-insight': { id: 'render-blocking-insight', title: 'Render blocking requests', score: 0, scoreDisplayMode: 'metricSavings' },
        'some-new-audit': { id: 'some-new-audit', title: 'Some new Lighthouse audit', description: 'A brand new check.', score: 0.4, scoreDisplayMode: 'binary' },
      },
    },
  };
}

export function deviceResult(url: string, device: Device, o: Opts = {}) {
  return parsePsiResponse(psiResponse(url, o), url, device, evidenceUrl(url, device));
}

export function pageResult(input: PageInput, o: { mobile?: Opts | null; desktop?: Opts | null } = {}): PageResult {
  const p: PageResult = { ...input, id: input.url, status: 'done', testedAt: '2026-11-05T10:00:00.000Z', errors: {} };
  if (o.mobile === null) p.errors.mobile = 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST';
  else p.mobile = deviceResult(input.url, 'mobile', o.mobile);
  if (o.desktop === null) p.errors.desktop = 'Request timed out';
  else p.desktop = deviceResult(input.url, 'desktop', { score: 0.93, fcp: 700, lcp: 1200, tbt: 40, cls: 0.01, si: 1100, ...o.desktop });
  const ok = Number(!!p.mobile) + Number(!!p.desktop);
  p.status = ok === 2 ? 'done' : ok === 1 ? 'partial' : 'failed';
  return p;
}

export function sampleRun(mode: TestRun['mode'] = 'bulk'): TestRun {
  return {
    mode,
    startedAt: '2026-11-05T10:00:00.000Z',
    finishedAt: '2026-11-05T10:02:00.000Z',
    pages: [
      pageResult({ url: 'https://example.com/', name: 'example.com', pageType: mode === 'website' ? 'homepage' : undefined }),
      pageResult({ url: 'https://shop.example.org/products/blue-shirt', name: 'Blue Shirt', pageType: mode === 'website' ? 'product' : undefined }, { desktop: null }),
      pageResult({ url: 'https://broken.example.net/', name: 'broken.example.net' }, { mobile: null, desktop: null }),
    ],
  };
}
