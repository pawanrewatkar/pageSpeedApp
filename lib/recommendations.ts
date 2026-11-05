// Plain-English developer recommendations, built only from the actual Lighthouse results.
import { DEVICE_LABEL, DEVICES, type Audit, type Device, type PageResult } from './types';

export type Priority = 'High' | 'Medium' | 'Low';

export interface Recommendation {
  key: string;
  issue: string;
  what: string;
  why: string;
  action: string;
  priority: Priority;
  affected: { page: string; url: string; device: Device; detail: string }[];
}

interface Guide {
  issue: string;
  why: string;
  action: string;
}

// Lighthouse audit id -> human explanation. Older audit ids and newer "insight" ids share a guide.
const G = {
  renderBlocking: {
    issue: 'Remove render-blocking resources',
    why: 'CSS and JavaScript files loaded in the page head stop the browser from showing any content until they finish downloading.',
    action: 'Inline the small amount of CSS needed for the first screen, load the rest later, and add "defer" or "async" to scripts that are not needed immediately.',
  },
  unusedJs: {
    issue: 'Reduce unused JavaScript',
    why: 'The browser downloads, parses and runs JavaScript that the page does not use, which delays loading and blocks user interaction.',
    action: 'Remove unused libraries, split code so each page loads only what it needs, and lazy-load features that are used later.',
  },
  unusedCss: {
    issue: 'Reduce unused CSS',
    why: 'Large stylesheets with unused rules take longer to download and delay the first paint.',
    action: 'Remove unused CSS rules (for example with PurgeCSS or Tailwind content scanning) and split CSS per page.',
  },
  images: {
    issue: 'Optimize large images',
    why: 'Large image files take a long time to download, especially on mobile networks, and are often the slowest part of the page.',
    action: 'Compress images, serve them at the size they are displayed, and use responsive images (srcset/sizes).',
  },
  modernImages: {
    issue: 'Convert images to WebP or AVIF',
    why: 'Modern image formats are usually 25-50% smaller than JPEG or PNG at the same visual quality.',
    action: 'Serve WebP or AVIF versions of images, using a <picture> element or an image CDN with automatic format conversion.',
  },
  offscreen: {
    issue: 'Lazy-load offscreen images',
    why: 'Images below the visible area are downloaded immediately and compete with important content.',
    action: 'Add loading="lazy" to images that are not visible on first load (but never to the main LCP image).',
  },
  server: {
    issue: 'Improve server response time',
    why: 'The browser cannot start loading the page until the server sends the first byte of HTML.',
    action: 'Enable page caching or a CDN, optimize slow database queries and server code, and avoid unnecessary redirects.',
  },
  fonts: {
    issue: 'Optimize font loading',
    why: 'Web fonts that block text rendering cause invisible text and delay the first paint.',
    action: 'Use font-display: swap, preload the main font files, self-host fonts and limit the number of font weights.',
  },
  unsized: {
    issue: 'Specify image dimensions',
    why: 'Images without width and height make the layout jump when they load, which hurts Cumulative Layout Shift.',
    action: 'Add explicit width and height attributes (or CSS aspect-ratio) to images and videos.',
  },
  thirdParty: {
    issue: 'Reduce third-party scripts',
    why: 'Chat widgets, trackers, ads and tag managers add network requests and main-thread work you do not control.',
    action: 'Remove unused third-party tags, load the remaining ones with defer or after user interaction, and use facades for embeds.',
  },
  cache: {
    issue: 'Improve caching',
    why: 'Static files with short cache lifetimes are downloaded again on every visit.',
    action: 'Set long Cache-Control max-age headers for versioned static assets (images, CSS, JS, fonts).',
  },
  mainThread: {
    issue: 'Reduce main-thread work',
    why: 'When the main thread is busy running scripts and calculating layout, the page cannot respond to the user.',
    action: 'Reduce JavaScript execution, split long tasks into smaller chunks, and move heavy work to web workers.',
  },
  jsExec: {
    issue: 'Reduce JavaScript execution time',
    why: 'Scripts that take a long time to run delay interactivity and increase Total Blocking Time.',
    action: 'Profile the slowest scripts, remove or defer non-essential code, and minify and compress bundles.',
  },
  minify: {
    issue: 'Minify CSS and JavaScript',
    why: 'Unminified files contain whitespace and comments that increase download size.',
    action: 'Enable minification in your build tool or CDN.',
  },
  compression: {
    issue: 'Enable text compression',
    why: 'Text files sent without compression are several times larger than needed.',
    action: 'Enable Gzip or Brotli compression on the server or CDN for HTML, CSS, JS and JSON.',
  },
  redirects: {
    issue: 'Avoid multiple page redirects',
    why: 'Each redirect adds a full network round trip before the page can start loading.',
    action: 'Link directly to the final URL and remove redirect chains (for example http -> https -> www).',
  },
  payload: {
    issue: 'Reduce total page size',
    why: 'Large pages take longer to download, especially on mobile connections.',
    action: 'Compress and resize images, remove unused code and defer non-critical resources.',
  },
  dom: {
    issue: 'Reduce DOM size',
    why: 'A very large number of HTML elements slows down styling, layout and memory use.',
    action: 'Simplify the HTML structure, paginate or virtualize long lists, and avoid hidden duplicate markup.',
  },
  lcpImage: {
    issue: 'Prioritize the Largest Contentful Paint image',
    why: 'The main hero image is discovered or downloaded too late, delaying the largest visible element.',
    action: 'Do not lazy-load the LCP image, add fetchpriority="high" or a preload hint, and make it discoverable in the initial HTML.',
  },
  lcpElement: {
    issue: 'Speed up the Largest Contentful Paint element',
    why: 'The largest visible element takes too long to appear, which users experience as a slow page.',
    action: 'Review the LCP breakdown in the evidence report and reduce the slowest phase (server time, resource load delay, load time or render delay).',
  },
  layoutShift: {
    issue: 'Avoid large layout shifts',
    why: 'Content that moves after it appears frustrates users and increases Cumulative Layout Shift.',
    action: 'Reserve space for images, ads, embeds and banners, and avoid inserting content above existing content.',
  },
  longTasks: {
    issue: 'Split long main-thread tasks',
    why: 'Tasks longer than 50 ms block the browser from responding to clicks and taps.',
    action: 'Break up long JavaScript tasks, yield to the main thread, and defer non-urgent work.',
  },
  legacyJs: {
    issue: 'Avoid serving legacy JavaScript',
    why: 'Polyfills and transpiled code for old browsers add unnecessary bytes for modern browsers.',
    action: 'Target modern browsers in your build configuration and only ship polyfills that are needed.',
  },
  duplicateJs: {
    issue: 'Remove duplicate JavaScript modules',
    why: 'The same library bundled more than once wastes download and parse time.',
    action: 'Deduplicate dependencies and check your bundles with a bundle analyzer.',
  },
  preconnect: {
    issue: 'Preconnect to required origins',
    why: 'Connecting to other domains (CDNs, font hosts) late adds connection setup time.',
    action: 'Add <link rel="preconnect"> for the most important third-party origins.',
  },
  video: {
    issue: 'Use video formats for animated content',
    why: 'Animated GIFs are much larger than equivalent videos.',
    action: 'Replace large GIFs with MP4 or WebM videos.',
  },
  animations: {
    issue: 'Avoid non-composited animations',
    why: 'Animations that change layout properties are janky and can cause layout shifts.',
    action: 'Animate only transform and opacity, and avoid animating width, height, top or left.',
  },
  requestChains: {
    issue: 'Shorten critical request chains',
    why: 'Resources that depend on each other load one after another, delaying rendering.',
    action: 'Reduce the depth of dependency chains, preload key resources and inline small critical files.',
  },
  reflow: {
    issue: 'Avoid forced reflows',
    why: 'JavaScript that reads layout immediately after changing styles forces expensive layout recalculation.',
    action: 'Batch DOM reads and writes and avoid querying layout properties inside loops.',
  },
  http: {
    issue: 'Use HTTP/2 or HTTP/3',
    why: 'Older HTTP versions load many resources less efficiently.',
    action: 'Enable HTTP/2 or HTTP/3 on your server or CDN.',
  },
  viewport: {
    issue: 'Optimize the viewport for mobile',
    why: 'A missing or incorrect viewport tag can delay taps and render the page at desktop size on phones.',
    action: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  },
} satisfies Record<string, Guide>;

const AUDIT_GUIDES: Record<string, Guide> = {
  'render-blocking-resources': G.renderBlocking,
  'render-blocking-insight': G.renderBlocking,
  'unused-javascript': G.unusedJs,
  'unused-css-rules': G.unusedCss,
  'uses-optimized-images': G.images,
  'uses-responsive-images': G.images,
  'image-delivery-insight': G.images,
  'modern-image-formats': G.modernImages,
  'offscreen-images': G.offscreen,
  'server-response-time': G.server,
  'document-latency-insight': G.server,
  'font-display': G.fonts,
  'font-display-insight': G.fonts,
  'unsized-images': G.unsized,
  'third-party-summary': G.thirdParty,
  'third-parties-insight': G.thirdParty,
  'third-party-facades': G.thirdParty,
  'uses-long-cache-ttl': G.cache,
  'cache-insight': G.cache,
  'mainthread-work-breakdown': G.mainThread,
  'bootup-time': G.jsExec,
  'unminified-javascript': G.minify,
  'unminified-css': G.minify,
  'uses-text-compression': G.compression,
  redirects: G.redirects,
  'total-byte-weight': G.payload,
  'dom-size': G.dom,
  'dom-size-insight': G.dom,
  'lcp-lazy-loaded': G.lcpImage,
  'prioritize-lcp-image': G.lcpImage,
  'lcp-discovery-insight': G.lcpImage,
  'largest-contentful-paint-element': G.lcpElement,
  'lcp-breakdown-insight': G.lcpElement,
  'layout-shifts': G.layoutShift,
  'layout-shift-elements': G.layoutShift,
  'cls-culprits-insight': G.layoutShift,
  'long-tasks': G.longTasks,
  'legacy-javascript': G.legacyJs,
  'legacy-javascript-insight': G.legacyJs,
  'duplicated-javascript': G.duplicateJs,
  'duplicated-javascript-insight': G.duplicateJs,
  'uses-rel-preconnect': G.preconnect,
  'efficient-animated-content': G.video,
  'non-composited-animations': G.animations,
  'critical-request-chains': G.requestChains,
  'network-dependency-tree-insight': G.requestChains,
  'forced-reflow-insight': G.reflow,
  'uses-http2': G.http,
  'modern-http-insight': G.http,
  'viewport-insight': G.viewport,
};

// Metric failures: what to do, depending on which metric is slow.
const METRIC_GUIDES: Record<string, Guide> = {
  LCP: {
    issue: 'Slow Largest Contentful Paint (LCP)',
    why: 'LCP measures when the main content becomes visible. A slow LCP makes the page feel slow to load.',
    action: 'Optimize and correctly size the hero image, prioritize the LCP resource (preload / fetchpriority="high"), and reduce server response time.',
  },
  FCP: {
    issue: 'Slow First Contentful Paint (FCP)',
    why: 'FCP measures when the first text or image appears. Until then, the user sees a blank screen.',
    action: 'Inline critical CSS, remove render-blocking resources and improve server response time.',
  },
  TBT: {
    issue: 'High Total Blocking Time (TBT)',
    why: 'TBT measures how long the page is unresponsive to clicks and taps while scripts run.',
    action: 'Reduce unused JavaScript, split long tasks, and defer or remove heavy third-party scripts.',
  },
  CLS: {
    issue: 'High Cumulative Layout Shift (CLS)',
    why: 'CLS measures how much content jumps around while loading, which causes mis-clicks and frustration.',
    action: 'Specify image and video dimensions and reserve space for ads, embeds and dynamically loaded content.',
  },
  SI: {
    issue: 'Slow Speed Index',
    why: 'Speed Index measures how quickly the visible part of the page fills in.',
    action: 'Prioritize above-the-fold content and optimize image and resource delivery.',
  },
};

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

function auditPriority(a: Audit): Priority {
  if (a.savingsMs >= 1000 || a.score === 0) return 'High';
  if (a.savingsMs >= 300 || (a.score !== null && a.score < 0.5)) return 'Medium';
  return 'Low';
}

function auditDetail(a: Audit): string {
  const parts: string[] = [];
  if (a.displayValue) parts.push(a.displayValue);
  else if (a.savingsMs) parts.push(`Est. savings ${(a.savingsMs / 1000).toFixed(1)} s`);
  else if (a.savingsBytes) parts.push(`Est. savings ${Math.round(a.savingsBytes / 1024)} KiB`);
  return parts.join(', ');
}

/** Groups findings by issue across all pages/devices. Only issues present in the results are returned. */
export function buildRecommendations(pages: PageResult[]): Recommendation[] {
  const map = new Map<string, Recommendation>();

  const add = (key: string, base: Omit<Recommendation, 'key' | 'affected' | 'priority'>, priority: Priority, aff: Recommendation['affected'][number]) => {
    const existing = map.get(key);
    if (existing) {
      existing.affected.push(aff);
      if (PRIORITY_RANK[priority] < PRIORITY_RANK[existing.priority]) existing.priority = priority;
    } else {
      map.set(key, { key, ...base, priority, affected: [aff] });
    }
  };

  for (const page of pages) {
    for (const device of DEVICES) {
      const r = page[device];
      if (!r) continue;

      for (const m of r.metrics) {
        if (m.status !== 'fail' && m.status !== 'warning') continue;
        const g = METRIC_GUIDES[m.short];
        const related = r.audits.filter((a) => a.metrics.includes(m.short)).slice(0, 3).map((a) => a.title);
        add(
          `metric:${m.short}`,
          {
            issue: g.issue,
            what: `${m.label} is above the recommended value (${m.expected}).`,
            why: g.why,
            action: g.action + (related.length ? ` Related findings: ${related.join('; ')}.` : ''),
          },
          m.status === 'fail' ? 'High' : 'Medium',
          { page: page.name, url: page.url, device, detail: `${m.observed} vs expected ${m.expected}` },
        );
      }

      for (const a of r.audits) {
        const g = AUDIT_GUIDES[a.id];
        const firstSentence = a.description.split(/(?<=\.)\s/)[0];
        const sameAsTitle = firstSentence.replace(/\.$/, '').toLowerCase() === a.title.replace(/\.$/, '').toLowerCase();
        add(
          g ? `guide:${g.issue}` : `audit:${a.id}`,
          {
            issue: g?.issue || a.title,
            what: `Lighthouse: ${a.title}${firstSentence && !sameAsTitle ? `. ${firstSentence}` : ''}`,
            why: g?.why || a.description || 'Lighthouse flagged this as affecting page load performance.',
            action: g?.action || 'Review this audit in the PageSpeed evidence report and fix the listed resources.',
          },
          auditPriority(a),
          { page: page.name, url: page.url, device, detail: auditDetail(a) },
        );
      }
    }
  }

  return [...map.values()].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.affected.length - a.affected.length,
  );
}

export const affectedLabel = (a: Recommendation['affected'][number]) => `${a.page} (${DEVICE_LABEL[a.device]})`;
