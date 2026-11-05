import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { psiResponse } from './fixtures';

vi.mock('server-only', () => ({}));
const { POST } = await import('@/app/api/pagespeed/route');

const call = (body: unknown) =>
  POST(new Request('http://localhost/api/pagespeed', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

describe('POST /api/pagespeed', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GOOGLE_PAGESPEED_API_KEY', 'test-secret-key');
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('calls Google with url, strategy, performance category and key, and never returns the key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(psiResponse('https://example.com/')), { status: 200 }));
    const res = await call({ url: 'example.com', device: 'desktop' });
    const body = await res.json();

    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(requested.origin + requested.pathname).toBe('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    expect(requested.searchParams.get('url')).toBe('https://example.com/');
    expect(requested.searchParams.get('strategy')).toBe('desktop');
    expect(requested.searchParams.get('category')).toBe('performance');
    expect(requested.searchParams.get('key')).toBe('test-secret-key');

    expect(res.status).toBe(200);
    expect(body.score).toBe(42);
    expect(body.evidenceUrl).toBe('https://pagespeed.web.dev/analysis/https%3A%2F%2Fexample.com%2F?form_factor=desktop');
    expect(JSON.stringify(body)).not.toContain('test-secret-key');
  });

  it('returns a setup message when the API key is missing', async () => {
    vi.stubEnv('GOOGLE_PAGESPEED_API_KEY', '');
    const res = await call({ url: 'https://example.com', device: 'mobile' });
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('MISSING_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid, localhost and private URLs and bad devices', async () => {
    for (const url of ['not a url', 'http://localhost:3000', 'http://192.168.1.1', 'ftp://example.com']) {
      expect((await call({ url, device: 'mobile' })).status).toBe(400);
    }
    expect((await call({ url: 'https://example.com', device: 'tablet' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes Google API errors through without leaking the key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Quota exceeded for key test-secret-key' } }), { status: 429 }));
    const res = await call({ url: 'https://example.com', device: 'mobile' });
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe('RATE_LIMIT');
    expect(body.error).toBe('Quota exceeded for key ***');
  });

  it('reports network failures as 502', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await call({ url: 'https://example.com', device: 'mobile' });
    expect(res.status).toBe(502);
  });
});
