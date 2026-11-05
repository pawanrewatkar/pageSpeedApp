import { NextResponse } from 'next/server';
import { PsiError, runPageSpeed } from '@/lib/pagespeed';
import { normalizeUrl } from '@/lib/urls';
import type { Device } from '@/lib/types';

// One URL + one device per request keeps each call well inside Vercel Hobby limits.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = normalizeUrl(body?.url);
  const device = body?.device as Device;

  if (!url) return NextResponse.json({ error: 'Invalid URL. Use a public http:// or https:// address.', code: 'INVALID_URL' }, { status: 400 });
  if (device !== 'mobile' && device !== 'desktop') {
    return NextResponse.json({ error: 'device must be "mobile" or "desktop".', code: 'INVALID_DEVICE' }, { status: 400 });
  }

  try {
    const result = await runPageSpeed(url, device, req.signal);
    return NextResponse.json(result);
  } catch (e) {
    const err = e instanceof PsiError ? e : new PsiError('Unexpected error while running PageSpeed test.', 500);
    if (!(e instanceof PsiError)) console.error('[pagespeed]', e);
    // Google returns 400/500 for unreachable sites; pass a clean status through.
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
}
