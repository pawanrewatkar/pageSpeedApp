'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Gauge, Globe, KeyRound, Link2 } from 'lucide-react';
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
  const abortRef = useRef<AbortController | null>(null);
  const testingRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function start(inputs: PageInput[], testMode: TestMode) {
    if (running || !inputs.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = new Date().toISOString();
    setRunning(true);
    setRun({ mode: testMode, startedAt, pages: [] });
    try {
      const pages = await runTests(inputs, {
        signal: controller.signal,
        onUpdate: (p) => setRun((r) => (r ? { ...r, pages: p } : r)),
      });
      setRun({ mode: testMode, startedAt, finishedAt: new Date().toISOString(), cancelled: controller.signal.aborted, pages });
    } finally {
      setRunning(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  const disabled = running || !hasApiKey;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">PageSpeed Analyzer</h1>
            <p className="text-xs text-slate-500">Mobile &amp; Desktop performance testing powered by Google PageSpeed Insights</p>
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

        <section ref={testingRef} className="scroll-mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Testing options">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition',
                  mode === m.id ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <m.icon className={cn('mt-0.5 h-5 w-5 shrink-0', mode === m.id ? 'text-blue-600' : 'text-slate-400')} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{m.title}</span>
                  <span className="block text-xs text-slate-500">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Panels stay mounted so their inputs survive switching tabs. */}
          <div hidden={mode !== 'single'}>
            <SingleTest disabled={disabled} onStart={(p) => start(p, 'single')} />
          </div>
          <div hidden={mode !== 'bulk'}>
            <BulkTest disabled={disabled} onStart={(p) => start(p, 'bulk')} />
          </div>
          <div hidden={mode !== 'website'}>
            <WebsiteTest disabled={disabled} onStart={(p) => start(p, 'website')} />
          </div>
        </section>

        {running && run && <Progress pages={run.pages} onCancel={() => abortRef.current?.abort()} />}

        <div ref={resultsRef} className="scroll-mt-4">
          {!running && run && run.pages.length > 0 && (
            <Results run={run} onBack={() => testingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        PageSpeed Analyzer · Results from Google PageSpeed Insights API v5 (Lighthouse)
      </footer>
    </div>
  );
}
