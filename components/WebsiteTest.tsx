'use client';

import { useMemo, useState } from 'react';
import { Play, ScanSearch } from 'lucide-react';
import type { DiscoveryResult } from '@/lib/discover';
import { normalizeUrl } from '@/lib/urls';
import { PAGE_TYPE_LABEL, type PageInput, type PageType } from '@/lib/types';
import { Alert, Button, Card, Input } from './ui';

export default function WebsiteTest({ disabled, onStart }: { disabled: boolean; onStart: (pages: PageInput[]) => void }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<PageType>>(new Set());

  const availableTypes = useMemo(() => [...new Set(result?.pages.map((p) => p.pageType))], [result]);
  const visible = result?.pages.filter((p) => types.has(p.pageType)) || [];
  const chosen = visible.filter((p) => selected.has(p.url));

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(value);
    if (!url) return setError('Please enter a valid public homepage URL, for example https://example.com');
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Page discovery failed.');
      const r = data as DiscoveryResult;
      setResult(r);
      setValue(r.homepage);
      setSelected(new Set(r.pages.map((p) => p.url)));
      setTypes(new Set(r.pages.map((p) => p.pageType)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const toggle = <T,>(set: Set<T>, item: T) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Test Important Pages of Website</h2>
      <p className="mt-1 text-sm text-slate-500">
        Finds representative pages (homepage, collections, products, blog, categories and key pages) from the sitemap and homepage links.
        Respects robots.txt and skips login, cart, checkout, account and search pages.
      </p>
      <form onSubmit={discover} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input type="text" inputMode="url" placeholder="https://example.com" aria-label="Website homepage URL" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" loading={loading} icon={<ScanSearch className="h-4 w-4" />} className="shrink-0">
          {loading ? 'Discovering…' : 'Discover Pages'}
        </Button>
      </form>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      {result && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-600">
            Found {result.pages.length} important page{result.pages.length === 1 ? '' : 's'} from {result.sources.sitemapUrls} sitemap URLs and{' '}
            {result.sources.homepageLinks} homepage links{result.sources.robotsTxt ? ' (robots.txt respected)' : ''}.
          </p>
          {result.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Page types</p>
            <div className="flex flex-wrap gap-2">
              {availableTypes.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={types.has(t)} onChange={() => setTypes((s) => toggle(s, t))} />
                  {PAGE_TYPE_LABEL[t]} <span className="text-slate-400">({result.pages.filter((p) => p.pageType === t).length})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-150 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Page Type</th>
                  <th className="px-3 py-2">Page Name</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2 text-center">Selected</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.url} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{PAGE_TYPE_LABEL[p.pageType]}</td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="break-all px-3 py-2">
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{p.url}</a>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        className="h-4 w-4 accent-blue-600"
                        checked={selected.has(p.url)}
                        onChange={() => setSelected((s) => toggle(s, p.url))}
                      />
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No page types selected.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Button
            disabled={disabled || !chosen.length}
            icon={<Play className="h-4 w-4" />}
            onClick={() => onStart(chosen.map((p) => ({ url: p.url, name: p.name, pageType: p.pageType })))}
          >
            Start Website Testing ({chosen.length} page{chosen.length === 1 ? '' : 's'})
          </Button>
        </div>
      )}
    </Card>
  );
}
