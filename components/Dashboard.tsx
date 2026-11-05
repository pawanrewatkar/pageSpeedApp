'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Gauge, Globe, KeyRound, Link2, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { runTests } from '@/lib/runner';
import type { PageInput, TestMode, TestRun } from '@/lib/types';
import { Alert, cn } from './ui';
import SingleTest from './SingleTest';
import BulkTest from './BulkTest';
import WebsiteTest from './WebsiteTest';
import Progress from './Progress';
import Results from './Results';

const MODES: { id: TestMode; title: string; desc: string; icon: typeof Link2 }[] = [
  { id: 'single', title: 'Single URL Testing', desc: 'Test one page on Mobile and Desktop', icon: Link2 },
  { id: 'bulk', title: 'Bulk URL Testing', desc: 'Upload an Excel file of website URLs', icon: FileSpreadsheet },
  { id: 'website', title: 'Whole Website Testing', desc: 'Auto-discover and test important pages', icon: Globe },
];

export default function Dashboard({ hasApiKey }: { hasApiKey: boolean }) {
  const [mode, setMode] = useState<TestMode>('single');
  const [run, setRun] = useState<TestRun | null>(null);
  const [running, setRunning] = useState(false);
  const [resetKey, setResetKey] = useState(0); // changing it remounts the panels with empty inputs
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function start(inputs: PageInput[], testMode: TestMode) {
    if (running || !inputs.length) return;
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = new Date().toISOString();
    setRunning(true);
    setRun({ mode: testMode, startedAt, pages: [] });
    try {
      const pages = await runTests(inputs, {
        signal: controller.signal,
        onUpdate: (p) => runId === runIdRef.current && setRun((r) => (r ? { ...r, pages: p } : r)),
      });
      if (runId !== runIdRef.current) return; // page was refreshed while testing
      setRun({ mode: testMode, startedAt, finishedAt: new Date().toISOString(), cancelled: controller.signal.aborted, pages });
    } finally {
      if (runId === runIdRef.current) {
        setRunning(false);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    }
  }

  /** Refresh Page: stop any running test, erase results and inputs, and show a fresh dashboard. */
  function refresh() {
    runIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setRun(null);
    setRunning(false);
    setResetKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const disabled = running || !hasApiKey;

  return (
    <div className="min-h-screen bg-white">
      <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">PageSpeed Analyzer</h1>
              <p className="text-sm text-slate-500">Mobile &amp; Desktop performance testing powered by Google PageSpeed Insights</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1"><Smartphone className="h-3.5 w-3.5 text-blue-600" /> Mobile</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1"><Monitor className="h-3.5 w-3.5 text-blue-600" /> Desktop</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1"><ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Real Lighthouse data</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {!hasApiKey && (
          <Alert tone="warning">
            <div className="flex gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Google PageSpeed API key is not configured</p>
                <p className="mt-1">
                  Open <code className="rounded bg-amber-100 px-1">.env.local</code> in the project folder, paste your key after{' '}
                  <code className="rounded bg-amber-100 px-1">GOOGLE_PAGESPEED_API_KEY=</code> and restart <code className="rounded bg-amber-100 px-1">npm run dev</code>.
                  On Vercel, add it under Project Settings → Environment Variables. Get a free key from{' '}
                  <a className="font-semibold underline" href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey" target="_blank" rel="noreferrer">
                    Google
                  </a>
                  . Page discovery still works without a key.
                </p>
              </div>
            </div>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Testing options">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'group flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                  mode === m.id
                    ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50/60 shadow-md shadow-blue-100 ring-2 ring-blue-100'
                    : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition',
                    mode === m.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600',
                  )}
                >
                  <m.icon className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{m.title}</span>
                  <span className="block text-xs text-slate-500">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Panels stay mounted so their inputs survive switching tabs; Refresh Page remounts them via the key. */}
          <div hidden={mode !== 'single'}>
            <SingleTest key={`single-${resetKey}`} disabled={disabled} onStart={(p) => start(p, 'single')} />
          </div>
          <div hidden={mode !== 'bulk'}>
            <BulkTest key={`bulk-${resetKey}`} disabled={disabled} onStart={(p) => start(p, 'bulk')} />
          </div>
          <div hidden={mode !== 'website'}>
            <WebsiteTest key={`website-${resetKey}`} disabled={disabled} onStart={(p) => start(p, 'website')} />
          </div>
        </section>

        {running && run && <Progress pages={run.pages} onCancel={() => abortRef.current?.abort()} />}

        <div ref={resultsRef} className="scroll-mt-4">
          {!running && run && run.pages.length > 0 && <Results run={run} onRefresh={refresh} />}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50/60 py-6 text-center text-xs text-slate-400">
        PageSpeed Analyzer · Results from Google PageSpeed Insights API v5 (Lighthouse)
      </footer>
    </div>
  );
}
