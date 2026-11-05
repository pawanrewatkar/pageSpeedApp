import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeUrl, isPrivateIp } from '@/lib/urls';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => (host.includes('internal-corp') ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '93.184.215.14', family: 4 }])),
}));

const { classifyUrl, discoverPages, extractLinks, extractSitemapLocs, isAllowedByRobots, pageNameFromUrl, parseRobots, selectPages } = await import('@/lib/discover');

describe('URL validation / SSRF', () => {
  it('normalizes and validates public URLs', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl(' https://Example.com/a#x ')).toBe('https://example.com/a');
    for (const bad of ['', 'hello', 'http://localhost', 'http://127.0.0.1', 'http://10.1.2.3', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://printer.local', 'javascript:alert(1)', 'https://user:pw@example.com', 'ftp://example.com']) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });

  it('detects private IP ranges', () => {
    expect(['10.0.0.1', '172.16.5.4', '192.168.0.1', '127.0.0.1', '100.64.0.1', '::ffff:192.168.1.1', 'fd00::1', 'fe80::1'].every(isPrivateIp)).toBe(true);
    expect(['8.8.8.8', '93.184.215.14', '172.32.0.1', '192.0.78.9', '2606:4700::1111'].some(isPrivateIp)).toBe(false);
    expect(isPrivateIp('192.0.2.10')).toBe(true);
  });
});

describe('robots.txt', () => {
  const robots = `
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private/
Disallow: /*?sort=
Allow: /private/public-page
Sitemap: https://shop.test/sitemap_custom.xml
`;
  const { rules, sitemaps } = parseRobots(robots);

  it('uses the * group and reads sitemaps', () => {
    expect(sitemaps).toEqual(['https://shop.test/sitemap_custom.xml']);
    expect(isAllowedByRobots('/', rules)).toBe(true);
    expect(isAllowedByRobots('/private/secret', rules)).toBe(false);
    expect(isAllowedByRobots('/private/public-page', rules)).toBe(true);
    expect(isAllowedByRobots('/collections/all?sort=price', rules)).toBe(false);
  });
});

describe('classification', () => {
  it.each([
    ['https://s.test/', 'homepage'],
    ['https://s.test/collections/summer', 'collection'],
    ['https://s.test/collections/summer/products/hat', 'product'],
    ['https://s.test/products/blue-shirt', 'product'],
    ['https://s.test/product/blue-shirt/', 'product'],
    ['https://s.test/blogs/news/launch-day', 'blog'],
    ['https://s.test/blog', 'blog'],
    ['https://s.test/2025/03/my-post', 'blog'],
    ['https://s.test/product-category/shoes/', 'category'],
    ['https://s.test/category/garden', 'category'],
    ['https://s.test/about-us', 'other'],
    ['https://s.test/account/login', null],
    ['https://s.test/cart', null],
    ['https://s.test/checkout', null],
    ['https://s.test/search', null],
    ['https://s.test/register', null],
    ['https://s.test/my-account/orders', null],
    ['https://s.test/image.jpg', null],
    ['https://s.test/blog/100%-natural', 'blog'], // malformed % escape must not throw
  ])('%s -> %s', (url, type) => {
    expect(classifyUrl(url)).toBe(type);
  });

  it('builds readable page names', () => {
    expect(pageNameFromUrl('https://s.test/products/blue-cotton_shirt', 'product')).toBe('Blue Cotton Shirt');
    expect(pageNameFromUrl('https://s.test/', 'homepage')).toBe('Homepage');
  });
});

describe('parsing', () => {
  it('extracts links with text and resolves relative URLs', () => {
    const links = extractLinks('<a href="/about">About <b>Us</b></a><a href=\'mailto:x@y.z\'>Mail</a><a class="x" href=https://s.test/blog>Blog</a>', 'https://s.test/');
    expect(links).toEqual([{ url: 'https://s.test/about', text: 'About Us' }, { url: 'https://s.test/blog', text: 'Blog' }]);
  });

  it('reads sitemap and sitemap index locs', () => {
    expect(extractSitemapLocs('<urlset><url><loc>https://s.test/a?x=1&amp;y=2</loc></url></urlset>')).toEqual({ isIndex: false, locs: ['https://s.test/a?x=1&y=2'] });
    expect(extractSitemapLocs('<sitemapindex><sitemap><loc><![CDATA[https://s.test/s1.xml]]></loc></sitemap></sitemapindex>').isIndex).toBe(true);
  });

  it('selects at most 15 representative pages and redistributes quota', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ url: `https://s.test/products/p${i}`, type: 'product' as const, name: `P${i}`, fromHomepage: false }));
    const pages = selectPages([{ url: 'https://s.test/', type: 'homepage', name: 'Homepage', fromHomepage: true }, ...many]);
    expect(pages).toHaveLength(15);
    expect(pages[0].pageType).toBe('homepage');
  });
});

describe('discoverPages (mocked website)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const site: Record<string, { status?: number; body: string; location?: string }> = {
    'https://shop.test/': { status: 301, body: '', location: 'https://www.shop.test/' },
    'https://www.shop.test/': {
      body: `<nav><a href="/collections/summer">Summer Sale</a><a href="/products/red-hat">Shop Now</a><a href="/account/login">Login</a><a href="/cart">Cart</a>
        <a href="/pages/about-us">About Us</a><a href="https://other-site.test/x">External</a><a href="/private/secret">Secret</a>
        <a href="/search?q=hat">Search</a><a href="/blogs/news">News</a></nav>`,
    },
    'https://www.shop.test/robots.txt': { body: 'User-agent: *\nDisallow: /private/\nSitemap: https://www.shop.test/sitemap.xml' },
    'https://www.shop.test/sitemap.xml': {
      body: `<sitemapindex><sitemap><loc>https://www.shop.test/sitemap_products_1.xml</loc></sitemap><sitemap><loc>https://evil.test/s.xml</loc></sitemap></sitemapindex>`,
    },
    'https://www.shop.test/sitemap_products_1.xml': {
      body: `<urlset>${['red-hat', 'blue-shirt', 'green-socks', 'yellow-scarf'].map((p) => `<url><loc>https://www.shop.test/products/${p}</loc></url>`).join('')}
        <url><loc>https://www.shop.test/blogs/news/spring-launch</loc></url><url><loc>https://www.shop.test/checkout</loc></url></urlset>`,
    },
  };

  it('discovers important pages from links and sitemaps, staying on-site and respecting robots.txt', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url);
      const page = site[url];
      if (!page) return new Response('not found', { status: 404 });
      return new Response(page.body, { status: page.status || 200, headers: page.location ? { location: page.location } : {} });
    }));

    const result = await discoverPages('shop.test');
    const urls = result.pages.map((p) => p.url);

    expect(result.homepage).toBe('https://www.shop.test/');
    expect(result.pages[0]).toEqual({ url: 'https://www.shop.test/', name: 'Homepage', pageType: 'homepage' });
    expect(urls).toContain('https://www.shop.test/collections/summer');
    expect(urls).toContain('https://www.shop.test/products/red-hat');
    expect(urls).toContain('https://www.shop.test/blogs/news/spring-launch');
    expect(result.pages.find((p) => p.url.endsWith('/collections/summer'))?.name).toBe('Summer Sale');
    expect(result.pages.find((p) => p.url.endsWith('/products/red-hat'))?.name).toBe('Red Hat'); // CTA text ignored
    expect(urls.some((u) => /login|cart|checkout|search|private|other-site/.test(u))).toBe(false);
    expect(requested).not.toContain('https://evil.test/s.xml');
    expect(result.pages.length).toBeLessThanOrEqual(15);
    expect(result.sources.robotsTxt).toBe(true);
  });

  it('blocks hosts that resolve to private networks', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(discoverPages('https://internal-corp.test')).rejects.toThrow(/private or local network/);
  });

  it('blocks redirects to private addresses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })));
    await expect(discoverPages('https://redirector.test')).rejects.toThrow(/not allowed/);
  });

  it('gives a helpful error when the homepage is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(discoverPages('https://down.test')).rejects.toThrow(/Could not open the homepage/);
  });
});
