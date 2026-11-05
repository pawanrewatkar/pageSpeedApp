// Browser-side test queue: limited concurrency, retries, timeouts and cancellation.
import { LIMITS } from './config';
import { DEVICES, type Device, type DeviceResult, type PageInput, type PageResult, type PageStatus } from './types';

class ApiError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('Aborted', 'AbortError'))), { once: true });
  });

async function callApi(url: string, device: Device, signal: AbortSignal, fetchFn: typeof fetch): Promise<DeviceResult> {
  const timeout = AbortSignal.timeout(LIMITS.clientTimeoutMs);
  let res: Response;
  try {
    res = await fetchFn('/api/pagespeed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, device }),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError(timeout.aborted ? 'Request timed out' : 'Network error', true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const missingKey = data?.code === 'MISSING_API_KEY';
    throw new ApiError(data?.error || `HTTP ${res.status}`, !missingKey && RETRYABLE.has(res.status));
  }
  return data as DeviceResult;
}

export async function testWithRetry(url: string, device: Device, signal: AbortSignal, fetchFn: typeof fetch = fetch, retryDelayMs = 3000): Promise<DeviceResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callApi(url, device, signal, fetchFn);
    } catch (e) {
      if (signal.aborted || !(e instanceof ApiError) || !e.retryable || attempt >= LIMITS.retries) throw e;
      await sleep(retryDelayMs * (attempt + 1), signal);
    }
  }
}

function pageStatus(p: PageResult, cancelled: boolean): PageStatus {
  const ok = DEVICES.filter((d) => p[d]).length;
  const failed = DEVICES.filter((d) => p.errors[d]).length;
  if (ok + failed === DEVICES.length) return ok === 2 ? 'done' : ok === 1 ? 'partial' : 'failed';
  if (cancelled) return ok ? 'partial' : 'cancelled';
  return 'running';
}

export function createPages(inputs: PageInput[]): PageResult[] {
  return inputs.map((p, i) => ({ ...p, id: `${i}-${p.url}`, status: 'pending', errors: {} }));
}

/**
 * Runs Mobile + Desktop tests for every page. Each page/device is an independent API call,
 * so one failure never affects other results. Calls onUpdate with a fresh array after each change.
 */
export async function runTests(
  inputs: PageInput[],
  opts: { signal: AbortSignal; onUpdate: (pages: PageResult[]) => void; fetchFn?: typeof fetch; retryDelayMs?: number },
): Promise<PageResult[]> {
  let pages = createPages(inputs);
  const update = (i: number, patch: Partial<PageResult>) => {
    pages = pages.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    opts.onUpdate(pages);
  };
  opts.onUpdate(pages);

  const tasks = pages.flatMap((_, i) => DEVICES.map((device) => ({ i, device })));
  let next = 0;

  const worker = async () => {
    while (next < tasks.length && !opts.signal.aborted) {
      const { i, device } = tasks[next++];
      if (pages[i].status === 'pending') update(i, { status: 'running' });
      try {
        const result = await testWithRetry(pages[i].url, device, opts.signal, opts.fetchFn, opts.retryDelayMs);
        const p = { ...pages[i], [device]: result, testedAt: pages[i].testedAt || result.fetchTime };
        update(i, { ...p, status: pageStatus(p, false) });
      } catch (e) {
        if (opts.signal.aborted) break;
        const p = { ...pages[i], errors: { ...pages[i].errors, [device]: (e as Error).message } };
        update(i, { ...p, status: pageStatus(p, false) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(LIMITS.concurrency, tasks.length) }, worker));

  if (opts.signal.aborted) {
    pages = pages.map((p) => (p.status === 'pending' || p.status === 'running' ? { ...p, status: pageStatus(p, true) } : p));
    opts.onUpdate(pages);
  }
  return pages;
}
