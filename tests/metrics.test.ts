import { describe, expect, it } from 'vitest';
import { METRICS } from '@/lib/config';
import { evaluateMetric, pageOverall, scoreBand, summarizeRun } from '@/lib/metrics';
import { parsePsiResponse, plainText } from '@/lib/psi-parse';
import { psiResponse, sampleRun } from './fixtures';

const cfg = (short: string) => METRICS.find((m) => m.short === short)!;

describe('metric thresholds', () => {
  it.each([
    ['FCP', 1800, 'pass', '1.8 s'],
    ['FCP', 1840, 'pass', '1.8 s'], // rounds to displayed 1.8 s, so status agrees with what is shown
    ['FCP', 1860, 'warning', '1.9 s'],
    ['FCP', 3000, 'warning', '3.0 s'],
    ['FCP', 3100, 'fail', '3.1 s'],
    ['LCP', 2500, 'pass', '2.5 s'],
    ['LCP', 4000, 'warning', '4.0 s'],
    ['LCP', 4100, 'fail', '4.1 s'],
    ['TBT', 200, 'pass', '200 ms'],
    ['TBT', 600, 'warning', '600 ms'],
    ['TBT', 1234, 'fail', '1,234 ms'],
    ['CLS', 0.1, 'pass', '0.100'],
    ['CLS', 0.25, 'warning', '0.250'],
    ['CLS', 0.31, 'fail', '0.310'],
    ['SI', 3400, 'pass', '3.4 s'],
    ['SI', 5800, 'warning', '5.8 s'],
    ['SI', 5900, 'fail', '5.9 s'],
  ])('%s %d -> %s', (short, raw, status, observed) => {
    const m = evaluateMetric(cfg(short), raw);
    expect(m.status).toBe(status);
    expect(m.observed).toBe(observed);
  });

  it('marks missing values as Not Available', () => {
    expect(evaluateMetric(cfg('LCP'), undefined).status).toBe('na');
    expect(evaluateMetric(cfg('LCP'), NaN).observed).toBe('N/A');
  });

  it('shows expected values with units', () => {
    expect(METRICS.map((m) => evaluateMetric(m, 0).expected)).toEqual(['≤ 1.8 s', '≤ 2.5 s', '≤ 200 ms', '≤ 0.1', '≤ 3.4 s']);
  });
});

describe('score bands', () => {
  it.each([[0, 'poor'], [49, 'poor'], [50, 'average'], [89, 'average'], [90, 'good'], [100, 'good'], [null, 'na']] as const)('%s -> %s', (s, band) => {
    expect(scoreBand(s)).toBe(band);
  });
});

describe('parsePsiResponse', () => {
  const r = parsePsiResponse(psiResponse('https://example.com/'), 'https://example.com/', 'mobile', 'https://evidence');

  it('reads score x100 rounded and all five metrics', () => {
    expect(r.score).toBe(42);
    expect(r.metrics.map((m) => [m.short, m.observed, m.status])).toEqual([
      ['FCP', '2.1 s', 'warning'],
      ['LCP', '4.8 s', 'fail'],
      ['TBT', '350 ms', 'warning'],
      ['CLS', '0.020', 'pass'],
      ['SI', '3.9 s', 'warning'],
    ]);
  });

  it('keeps only failing diagnostic audits, skipping metrics, passed and hidden audits', () => {
    const ids = r.audits.map((a) => a.id);
    expect(ids).toContain('render-blocking-resources');
    expect(ids).toContain('some-new-audit');
    expect(ids).not.toContain('uses-text-compression');
    expect(ids).not.toContain('render-blocking-insight');
    expect(ids).not.toContain('largest-contentful-paint');
    expect(ids[0]).toBe('render-blocking-resources'); // sorted by savings
    expect(r.audits[0].description).toBe('Resources are blocking the first paint of your page.');
  });

  it('handles a response without Lighthouse data', () => {
    const empty = parsePsiResponse({}, 'https://x.com', 'desktop', '');
    expect(empty.score).toBeNull();
    expect(empty.metrics.every((m) => m.status === 'na')).toBe(true);
  });

  it('strips markdown links', () => {
    expect(plainText('See [docs](https://a.b) now. [Learn more](https://c.d).')).toBe('See docs now.');
  });
});

describe('run summary', () => {
  it('counts successes and failures per device test', () => {
    const run = sampleRun();
    expect(summarizeRun(run)).toEqual({ websites: 3, pages: 3, success: 3, failed: 3, avgMobile: 42, avgDesktop: 93 });
    expect(pageOverall(run.pages[0]).label).toBe('Poor');
    expect(pageOverall(run.pages[1]).label).toBe('Poor (partial)');
    expect(pageOverall(run.pages[2]).label).toBe('Failed');
  });
});
