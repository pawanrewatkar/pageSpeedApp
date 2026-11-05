// Discovers a small, representative set of important pages for a website.
// Pure helpers are exported for unit tests; network access happens only in discoverPages().
import { LIMITS } from './config';
import { baseDomain, isPrivateIp, normalizeUrl } from './urls';
import type { DiscoveredPage, PageType } from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; PageSpeedAnalyzerBot/1.0)';
const BOT_TOKEN = 'pagespeedanalyzerbot';

export class DiscoveryError extends Error {}

// ---------------------------------------------------------------- robots.txt

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export function parseRobots(txt: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap' && value) sitemaps.push(value);
    else if ((key === 'allow' || key === 'disallow') && current && value) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }

  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && BOT_TOKEN.includes(a)));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
  return { rules: chosen.flatMap((g) => g.rules), sitemaps };
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

/** Longest matching rule wins; Allow wins ties. No matching rule means allowed. */
export function isAllowedByRobots(pathAndQuery: string, rules: RobotsRule[]): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

// ---------------------------------------------------------------- HTML / sitemap parsing

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

export function extractSitemapLocs(xml: string): { isIndex: boolean; locs: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  return { isIndex: /<sitemapindex[\s>]/i.test(xml), locs };
}

export function extractLinks(html: string, baseUrl: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const raw = href && decodeEntities((href[1] ?? href[2] ?? href[3] ?? '').trim());
    if (!raw || /^(mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    try {
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      out.push({ url: new URL(raw, baseUrl).href, text });
    } catch {
      /* ignore malformed href */
    }
  }
  return out;
}

// ---------------------------------------------------------------- classification

const EXCLUDED =
  /(^|\/)(login|log-in|signin|sign-in|logout|log-out|signout|register|registration|signup|sign-up|cart|basket|bag|checkout|account|accounts|my-account|myaccount|customer|customers|profile|search|wishlist|password|reset-password|forgot-password|admin|wp-admin|wp-login\.php|auth|oauth|orders?|track-order|cdn-cgi|feed)(\/|$|\.|\?)/i;
const FILE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|xml|txt|json|css|js|mp4|webm|mp3|woff2?|ttf|gz|rss|atom|csv|xlsx?|docx?)$/i;

const TYPE_PATTERNS: [PageType, RegExp[]][] = [
  ['product', [/\/products?\/[^/]+/, /\/p\/[^/]+/, /\/dp\/[^/]+/, /\/items?\/[^/]+/, /-p-\d+/]],
  ['blog', [/\/(blogs?|news|articles?|posts?|stories|journal|insights)(\/|$)/, /\/\d{4}\/\d{2}\/[^/]+/]],
  ['category', [/\/(categor(y|ies)|product-categor(y|ies)|departments?|c)\/[^/]+/]],
  ['collection', [/\/collections?(\/[^/]+)?\/?$/, /^\/(shop|store)\/?$/]],
];

// Call-to-action link text is not a useful page name ("Shop Men", "Read more"); use the URL slug instead.
const GENERIC_LINK_TEXT = /^(shop|view|see|learn|read|buy|discover|explore|click|more|go|get|find|order|start|browse)\b|^(here|link)$/i;

const IMPORTANT_OTHER = /^\/(about|about-us|contact|contact-us|pricing|plans|services|solutions|features|faq|faqs|shipping|returns|support|help|locations|stores|careers|team|portfolio|work|menu|gallery)\/?$/i;

/** Returns the page type, or null if the URL should never be tested (account, cart, files, etc.). */
export function classifyUrl(url: string): PageType | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let path = u.pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    /* malformed % escapes: classify the raw path */
  }
  if (EXCLUDED.test(path) || FILE_EXT.test(path)) return null;
  if (path === '/' || path === '' || /^\/(index\.(html?|php))?$/.test(path)) return 'homepage';
  for (const [type, patterns] of TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(path))) return type;
  }
  return 'other';
}

export function pageNameFromUrl(url: string, type: PageType): string {
  if (type === 'homepage') return 'Homepage';
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  let seg = segments[segments.length - 1] || '';
  try {
    seg = decodeURIComponent(seg);
  } catch {
    /* keep raw */
  }
  seg = seg.replace(/\.(html?|php|aspx?)$/i, '');
  if (/^\d+$/.test(seg) && segments.length > 1) seg = `${segments[segments.length - 2]} ${seg}`;
  const name = seg.replace(/[-_+]+/g, ' ').trim();
  return name ? name.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) : url;
}

// ---------------------------------------------------------------- selection

interface Candidate {
  url: string;
  type: PageType;
  name: string;
  fromHomepage: boolean;
}

const QUOTA: Record<PageType, number> = { homepage: 1, collection: 3, product: 3, blog: 3, category: 3, other: 2 };
const FILL_ORDER: PageType[] = ['collection', 'product', 'category', 'blog', 'other'];

function rank(c: Candidate): number[] {
  const path = new URL(c.url).pathname;
  return [c.fromHomepage ? 0 : 1, c.type === 'other' && IMPORTANT_OTHER.test(path) ? 0 : 1, path.split('/').filter(Boolean).length, path.length];
}

function compareRank(a: Candidate, b: Candidate): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
}

/** Picks representative pages per type (max `limit`), redistributing unused quota. */
export function selectPages(candidates: Candidate[], limit = LIMITS.maxDiscoveredPages): DiscoveredPage[] {
  const byType = new Map<PageType, Candidate[]>();
  for (const c of candidates) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type)!.push(c);
  }
  for (const list of byType.values()) list.sort(compareRank);

  const picked: Candidate[] = [];
  const take = (type: PageType, n: number) => {
    const list = byType.get(type) || [];
    while (n-- > 0 && list.length && picked.length < limit) picked.push(list.shift()!);
  };
  take('homepage', QUOTA.homepage);
  for (const t of FILL_ORDER) take(t, QUOTA[t]);
  // Fill remaining slots round-robin from types that still have candidates.
  let progress = true;
  while (picked.length < limit && progress) {
    progress = false;
    for (const t of FILL_ORDER) {
      if ((byType.get(t) || []).length && picked.length < limit) {
        take(t, 1);
        progress = true;
      }
    }
  }
  const order: PageType[] = ['homepage', 'collection', 'product', 'blog', 'category', 'other'];
  return picked
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .map(({ url, name, type }) => ({ url, name, pageType: type }));
}

// ---------------------------------------------------------------- safe network access (SSRF protection)

async function assertPublicHost(hostname: string): Promise<void> {
  const { lookup } = await import('node:dns/promises');
  const addrs = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true }).catch(() => {
    throw new DiscoveryError(`Could not resolve ${hostname}. Check the website address.`);
  });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new DiscoveryError('This address points to a private or local network and cannot be crawled.');
  }
}

interface FetchResult {
  url: string;
  status: number;
  text: string;
}

/** Fetches a public URL, validating every redirect hop and limiting time and size. */
export async function safeFetch(url: string, deadline: number, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'): Promise<FetchResult> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const normalized = normalizeUrl(current);
    if (!normalized) throw new DiscoveryError('URL is not allowed (only public http/https websites).');
    const u = new URL(normalized);
    await assertPublicHost(u.hostname);

    const remaining = deadline - Date.now();
    if (remaining <= 500) throw new DiscoveryError('Discovery time limit reached.');
    const res = await fetch(normalized, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(Math.min(LIMITS.crawlTimeoutMs, remaining)),
      cache: 'no-store',
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, normalized).href;
      continue;
    }

    // Read the body with a size cap.
    let text = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (bytes > LIMITS.maxCrawlBytes) {
          await reader.cancel();
          break;
        }
      }
    }
    return { url: normalized, status: res.status, text };
  }
  throw new DiscoveryError('Too many redirects.');
}

// ---------------------------------------------------------------- main

export interface DiscoveryResult {
  homepage: string;
  pages: DiscoveredPage[];
  found: Partial<Record<PageType, number>>;
  sources: { sitemapUrls: number; homepageLinks: number; robotsTxt: boolean };
  notes: string[];
}

export async function discoverPages(inputUrl: string): Promise<DiscoveryResult> {
  const start = normalizeUrl(inputUrl);
  if (!start) throw new DiscoveryError('Enter a valid public website URL, for example https://example.com');
  const deadline = Date.now() + LIMITS.crawlBudgetMs;
  const notes: string[] = [];

  // 1. Homepage (follows redirects to the canonical origin).
  const home = await safeFetch(new URL('/', start).href, deadline).catch((e) => {
    throw new DiscoveryError(e instanceof DiscoveryError ? e.message : `Could not open the homepage (${(e as Error).message}).`);
  });
  const origin = new URL(home.url).origin;
  const site = baseDomain(new URL(home.url).hostname);
  const sameSite = (u: string) => {
    try {
      const x = new URL(u);
      return (x.protocol === 'https:' || x.protocol === 'http:') && baseDomain(x.hostname) === site;
    } catch {
      return false;
    }
  };

  // 2. robots.txt
  let rules: RobotsRule[] = [];
  let robotSitemaps: string[] = [];
  let robotsTxt = false;
  try {
    const r = await safeFetch(`${origin}/robots.txt`, deadline, 'text/plain');
    if (r.status === 200 && !/<html/i.test(r.text.slice(0, 500))) {
      ({ rules, sitemaps: robotSitemaps } = parseRobots(r.text));
      robotsTxt = true;
    }
  } catch {
    notes.push('robots.txt could not be read; continuing with standard rules.');
  }
  const allowed = (u: string) => {
    const x = new URL(u);
    return isAllowedByRobots(x.pathname + x.search, rules);
  };

  const candidates = new Map<string, Candidate>();
  const addCandidate = (raw: string, fromHomepage: boolean, text = '') => {
    try {
      addOne(raw, fromHomepage, text);
    } catch {
      /* one bad URL must never break discovery */
    }
  };
  const addOne = (raw: string, fromHomepage: boolean, text: string) => {
    if (!sameSite(raw)) return;
    const u = new URL(raw);
    if (u.search) return; // query-string URLs are usually filters/search results
    u.hash = '';
    const key = baseDomain(u.hostname) + (u.pathname.replace(/\/+$/, '') || '/');
    if (candidates.has(key)) return;
    const type = classifyUrl(u.href);
    if (!type || !allowed(u.href)) return;
    const usefulText = text.length >= 2 && text.length <= 60 && (type === 'collection' || !GENERIC_LINK_TEXT.test(text));
    const label = usefulText && type !== 'homepage' ? text : pageNameFromUrl(u.href, type);
    candidates.set(key, { url: u.href, type, name: label, fromHomepage });
  };

  // The homepage is the user's own input, so it is always included.
  candidates.set(baseDomain(new URL(home.url).hostname) + '/', { url: home.url, type: 'homepage', name: 'Homepage', fromHomepage: true });

  // 3. Internal homepage links
  let homepageLinks = 0;
  if (home.status < 400 && allowed(home.url)) {
    const links = extractLinks(home.text, home.url).filter((l) => sameSite(l.url));
    homepageLinks = links.length;
    for (const l of links) addCandidate(l.url, true, l.text);
  } else if (home.status >= 400) {
    notes.push(`Homepage returned HTTP ${home.status}.`);
  }

  // 4. Sitemaps (robots.txt entries, sitemap.xml, sitemap_index.xml)
  const queue = [...new Set([...robotSitemaps.filter(sameSite), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])];
  const seenSitemaps = new Set<string>();
  let sitemapUrls = 0;
  const pageUrls: string[] = [];
  while (queue.length && seenSitemaps.size < LIMITS.maxSitemaps && Date.now() < deadline - 1000) {
    const batch = queue.splice(0, LIMITS.maxSitemaps - seenSitemaps.size).filter((s) => !seenSitemaps.has(s) && !s.endsWith('.gz'));
    batch.forEach((s) => seenSitemaps.add(s));
    const results = await Promise.allSettled(batch.map((s) => safeFetch(s, deadline, 'application/xml,text/xml;q=0.9,*/*;q=0.5')));
    for (const r of results) {
      if (r.status !== 'fulfilled' || r.value.status !== 200) continue;
      const { isIndex, locs } = extractSitemapLocs(r.value.text);
      if (isIndex) {
        // Prefer child sitemaps that hint at important page types.
        const score = (s: string) => (/product|collection|categor|blog|post|page/i.test(s) ? 0 : 1);
        queue.push(...locs.filter(sameSite).sort((a, b) => score(a) - score(b)));
      } else {
        pageUrls.push(...locs.slice(0, 5000));
      }
    }
  }
  sitemapUrls = pageUrls.length;
  for (const u of pageUrls) addCandidate(u, false);

  if (!sitemapUrls) notes.push('No sitemap found; pages were discovered from homepage links.');
  if (candidates.size <= 1) notes.push('Only the homepage could be discovered. The site may load its navigation with JavaScript.');

  const all = [...candidates.values()];
  const found: Partial<Record<PageType, number>> = {};
  for (const c of all) found[c.type] = (found[c.type] || 0) + 1;

  return {
    homepage: home.url,
    pages: selectPages(all),
    found,
    sources: { sitemapUrls, homepageLinks, robotsTxt },
    notes,
  };
}
