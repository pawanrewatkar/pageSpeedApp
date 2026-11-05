import { describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@/lib/config';
import { runTests } from '@/lib/runner';
import { deviceResult } from './fixtures';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function apiMock(handler: (url: string, device: string, attempt: number) => Response | Promise<Response>) {
  const attempts = new Map<string, number>();
  let active = 0;
  let maxActive = 0;
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url, device } = JSON.parse(String(init?.body));
    const key = `${url}|${device}`;
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((r) => setTimeout(r, 5));
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return await handler(url, device, attempt);
    } finally {
      active--;
    }
  });
  return { fn: fn as unknown as typeof fetch, calls: fn, maxActive: () => maxActive };
}

const inputs = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://site${i}.com/`, name: `site${i}.com` }));

describe('runTests', () => {
  it('tests every page on mobile and desktop with limited concurrency', async () => {
    const api = apiMock((url, device) => json(deviceResult(url, device as 'mobile')));
    const updates: number[] = [];
    const pages = await runTests(inputs(4), { signal: new AbortController().signal, onUpdate: (p) => updates.push(p.length), fetchFn: api.fn, retryDelayMs: 1 });
    expect(api.calls).toHaveBeenCalledTimes(8);
    expect(api.maxActive()).toBeLessThanOrEqual(LIMITS.concurrency);
    expect(pages.every((p) => p.status === 'done' && p.mobile && p.desktop)).toBe(true);
    expect(updates.length).toBeGreaterThan(8);
  });

  it('continues after failures and preserves successful results (partial failure)', async () => {
    const api = apiMock((url, device) =>
      url.includes('site1') ? json({ error: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' }, 400)
        : url.includes('site2') && device === 'desktop' ? json({ error: 'bad' }, 400)
          : json(deviceResult(url, device as 'mobile')),
    );
    const pages = await runTests(inputs(3), { signal: new AbortController().signal, onUpdate: () => {}, fetchFn: api.fn, retryDelayMs: 1 });
    expect(pages.map((p) => p.status)).toEqual(['done', 'failed', 'partial']);
    expect(pages[1].errors.mobile).toContain('FAILED_DOCUMENT_REQUEST');
    expect(pages[2].mobile?.score).toBe(42);
    expect(api.calls).toHaveBeenCalledTimes(6); // 400 is not retried
  });

  it('retries rate-limit and server errors', async () => {
    const api = apiMock((url, device, attempt) => (attempt < 3 ? json({ error: 'Quota' }, 429) : json(deviceResult(url, device as 'mobile'))));
    const pages = await runTests(inputs(1), { signal: new AbortController().signal, onUpdate: () => {}, fetchFn: api.fn, retryDelayMs: 1 });
    expect(pages[0].status).toBe('done');
    expect(api.calls).toHaveBeenCalledTimes(6);
  });

  it('gives up after the retry limit', async () => {
    const api = apiMock(() => json({ error: 'Service unavailable' }, 503));
    const pages = await runTests(inputs(1), { signal: new AbortController().signal, onUpdate: () => {}, fetchFn: api.fn, retryDelayMs: 1 });
    expect(pages[0].status).toBe('failed');
    expect(api.calls).toHaveBeenCalledTimes(2 * (LIMITS.retries + 1));
  });

  it('does not retry when the API key is missing', async () => {
    const api = apiMock(() => json({ error: 'missing', code: 'MISSING_API_KEY' }, 500));
    await runTests(inputs(1), { signal: new AbortController().signal, onUpdate: () => {}, fetchFn: api.fn, retryDelayMs: 1 });
    expect(api.calls).toHaveBeenCalledTimes(2);
  });

  it('cancels remaining tests but keeps completed results', async () => {
    const controller = new AbortController();
    let done = 0;
    const api = apiMock((url, device) => {
      if (++done === 2) controller.abort();
      return json(deviceResult(url, device as 'mobile'));
    });
    const pages = await runTests(inputs(5), { signal: controller.signal, onUpdate: () => {}, fetchFn: api.fn, retryDelayMs: 1 });
    expect(api.calls.mock.calls.length).toBeLessThan(10);
    expect(pages.some((p) => p.mobile || p.desktop)).toBe(true);
    expect(pages.filter((p) => p.status === 'cancelled').length).toBeGreaterThan(0);
    expect(pages.some((p) => p.status === 'pending' || p.status === 'running')).toBe(false);
  });
});
