import { NextResponse } from 'next/server';
import { DiscoveryError, discoverPages } from '@/lib/discover';

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.url !== 'string' || !body.url.trim()) {
    return NextResponse.json({ error: 'Enter the website homepage URL.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await discoverPages(body.url));
  } catch (e) {
    if (e instanceof DiscoveryError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[discover]', e);
    return NextResponse.json({ error: 'Page discovery failed. Check that the website is public and try again, or use Single URL testing.' }, { status: 500 });
  }
}
