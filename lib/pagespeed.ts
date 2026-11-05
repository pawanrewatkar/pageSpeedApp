import 'server-only';
import { LIMITS, PSI_ENDPOINT, evidenceUrl } from './config';
import { parsePsiResponse } from './psi-parse';
import type { Device, DeviceResult } from './types';

export class PsiError extends Error {
  constructor(message: string, public status: number, public code = 'PSI_ERROR') {
    super(message);
  }
}

/** Calls Google PageSpeed Insights v5 for one URL + device. Runs on the server only. */
export async function runPageSpeed(url: string, device: Device, signal?: AbortSignal): Promise<DeviceResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY?.trim();
  if (!apiKey) {
    throw new PsiError('Google PageSpeed API key is not configured. Add GOOGLE_PAGESPEED_API_KEY to .env.local (or Vercel environment variables) and restart the server.', 500, 'MISSING_API_KEY');
  }

  const params = new URLSearchParams({ url, strategy: device, category: 'performance', key: apiKey });
  const timeout = AbortSignal.timeout(LIMITS.apiTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${PSI_ENDPOINT}?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
    });
  } catch (e) {
    if (timeout.aborted) throw new PsiError('Google PageSpeed API timed out. Try again.', 504, 'TIMEOUT');
    throw new PsiError(`Could not reach Google PageSpeed API: ${(e as Error).message}`, 502, 'NETWORK');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Never echo the request URL (it contains the API key).
    const raw: string = body?.error?.message || `Google PageSpeed API returned HTTP ${res.status}`;
    throw new PsiError(raw.replace(apiKey, '***'), res.status, res.status === 429 ? 'RATE_LIMIT' : 'PSI_ERROR');
  }
  if (!body?.lighthouseResult) throw new PsiError('Google PageSpeed API returned no Lighthouse result.', 502);

  return parsePsiResponse(body, url, device, evidenceUrl(url, device));
}
