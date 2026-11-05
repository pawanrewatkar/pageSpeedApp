'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FileSpreadsheet, FileText, Monitor, Smartphone } from 'lucide-react';
import { formatDate, pageOverall, scoreBand, siteName, summarizeRun, deviceStatusLabel } from '@/lib/metrics';
import { affectedLabel, buildRecommendations } from '@/lib/recommendations';
import { DEVICE_LABEL, DEVICES, PAGE_TYPE_LABEL, type Device, type PageResult, type TestRun } from '@/lib/types';
import { Alert, BAND_TEXT, BandBadge, Button, Card, PriorityBadge, RefreshButton, ScoreRing, StatusBadge, cn, downloadBlob } from './ui';

const TABS = ['Overview', 'Mobile Results', 'Desktop Results', 'Detailed Metrics', 'Developer Recommendations'] as const;
type Tab = (typeof TABS)[number];

function fileBase(run: TestRun) {
  const name = run.pages.length === 1 || run.mode === 'website' ? siteName(run.pages[0].url) : 'bulk';
  return `pagespeed-report-${name.replace(/[^a-z0-9.-]/gi, '_')}-${run.startedAt.slice(0, 10)}`;
}

export default function Results({ run, onRefresh }: { run: TestRun; onRefresh: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [selectedId, setSelectedId] = useState(run.pages[0]?.id);
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const stats = useMemo(() => summarizeRun(run), [run]);
  const recs = useMemo(() => buildRecommendations(run.pages), [run]);
  const selected = run.pages.find((p) => p.id === selectedId) || run.pages[0];

  async function download(kind: 'excel' | 'pdf') {
    setDownloading(kind);
    setDownloadError('');
    try {
      if (kind === 'excel') {
        const { excelReportBlob } = await import('@/lib/excel');
        downloadBlob(await excelReportBlob(run), `${fileBase(run)}.xlsx`);
      } else {
        const { pdfReportBlob } = await import('@/lib/pdf');
        downloadBlob(pdfReportBlob(run), `${fileBase(run)}.pdf`);
      }
    } catch (e) {
      console.error(e);
      setDownloadError(`Could not generate the ${kind === 'excel' ? 'Excel' : 'PDF'} report: ${(e as Error).message}`);
    } finally {
      setDownloading(null);
    }
  }

  const viewDetails = (id: string) => {
    setSelectedId(id);
    setTab('Detailed Metrics');
  };

  return (
    <section className="space-y-4" aria-label="Test results">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent">Test Results</h2>
          <p className="text-sm text-slate-500">
            Tested {formatDate(run.startedAt)} · Review the results below, then download the report.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0">
          <RefreshButton onClick={onRefresh} />
          <Button loading={downloading === 'excel'} icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => download('excel')}>Download Excel Report</Button>
          <Button loading={downloading === 'pdf'} icon={<FileText className="h-4 w-4" />} onClick={() => download('pdf')}>Download PDF Report</Button>
        </div>
      </div>
      {run.cancelled && <Alert tone="warning">Testing was cancelled. Completed results are shown below and included in downloads.</Alert>}
      {downloadError && <Alert tone="error">{downloadError}</Alert>}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-slate-200" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition',
                tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t}
              {t === 'Developer Recommendations' && recs.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{recs.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Websites tested" value={stats.websites} />
            <Stat label="Pages tested" value={stats.pages} />
            <Stat label="Successful tests" value={stats.success} className="text-green-600" />
            <Stat label="Failed tests" value={stats.failed} className={stats.failed ? 'text-red-600' : undefined} />
            <Stat label="Avg. Mobile score" value={stats.avgMobile ?? 'N/A'} className={BAND_TEXT[scoreBand(stats.avgMobile)]} />
            <Stat label="Avg. Desktop score" value={stats.avgDesktop ?? 'N/A'} className={BAND_TEXT[scoreBand(stats.avgDesktop)]} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {run.pages.map((p) => <PageCard key={p.id} page={p} onDetails={() => viewDetails(p.id)} />)}
          </div>
        </div>
      )}

      {(tab === 'Mobile Results' || tab === 'Desktop Results') && (
        <DeviceTable pages={run.pages} device={tab === 'Mobile Results' ? 'mobile' : 'desktop'} />
      )}

      {tab === 'Detailed Metrics' && selected && (
        <div className="space-y-4">
          {run.pages.length > 1 && (
            <label className="block max-w-xl text-sm font-medium text-slate-700">
              Select website / page
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {run.pages.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.url}</option>)}
              </select>
            </label>
          )}
          <Card className="p-4">
            <p className="font-semibold text-slate-900">{selected.name}</p>
            <a href={selected.url} target="_blank" rel="noreferrer" className="break-all text-sm text-blue-600 hover:underline">{selected.url}</a>
            <p className="mt-1 text-xs text-slate-500">
              {selected.pageType && `${PAGE_TYPE_LABEL[selected.pageType]} · `}Tested {formatDate(selected.testedAt) || '—'}
            </p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {DEVICES.map((d) => <DeviceDetail key={d} page={selected} device={d} />)}
          </div>
        </div>
      )}

      {tab === 'Developer Recommendations' && (
        <div className="space-y-3">
          {!recs.length && <Alert tone="success">No performance issues were reported by Lighthouse for the tested pages.</Alert>}
          {recs.map((r) => (
            <Card key={r.key}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{r.issue}</h3>
                <PriorityBadge priority={r.priority} />
              </div>
              <p className="mt-1 text-sm text-slate-500">{r.what}</p>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-700">Why it matters</dt>
                  <dd className="text-slate-600">{r.why}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Recommended developer action</dt>
                  <dd className="text-slate-600">{r.action}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.affected.slice(0, 12).map((a, i) => (
                  <span key={i} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600" title={a.url}>
                    {affectedLabel(a)}{a.detail && `: ${a.detail}`}
                  </span>
                ))}
                {r.affected.length > 12 && <span className="px-2 py-1 text-xs text-slate-400">+{r.affected.length - 12} more</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold text-slate-900', className)}>{value}</p>
    </Card>
  );
}

function PageCard({ page, onDetails }: { page: PageResult; onDetails: () => void }) {
  const overall = pageOverall(page);
  const errors = DEVICES.filter((d) => page.errors[d]);
  return (
    <Card className="flex flex-col">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900" title={page.name}>{page.name}</p>
        <p className="truncate text-xs text-slate-500" title={page.url}>{page.url}</p>
        {page.pageType && <p className="mt-0.5 text-xs text-slate-400">{PAGE_TYPE_LABEL[page.pageType]}</p>}
      </div>
      <div className="my-4 flex justify-around">
        <ScoreRing score={page.mobile?.score} label="Mobile" />
        <ScoreRing score={page.desktop?.score} label="Desktop" />
      </div>
      {errors.map((d) => (
        <p key={d} className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{DEVICE_LABEL[d]} failed: {page.errors[d]}</p>
      ))}
      <div className="mt-auto flex items-center justify-between">
        <BandBadge band={overall.band}>{overall.label}</BandBadge>
        <Button variant="ghost" className="px-2 py-1" onClick={onDetails}>View Details</Button>
      </div>
    </Card>
  );
}

function DeviceTable({ pages, device }: { pages: PageResult[]; device: Device }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-160 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Website/Page</th>
            <th className="px-4 py-3">Metric</th>
            <th className="px-4 py-3">Observed Value</th>
            <th className="px-4 py-3">Expected Value</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => {
            const r = p[device];
            const pageCell = (rows: number) => (
              <td rowSpan={rows} className="border-r border-slate-100 px-4 py-3 align-top">
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="break-all text-xs text-slate-500">{p.url}</p>
                <p className={cn('mt-1 text-xs font-semibold', BAND_TEXT[scoreBand(r?.score)])}>
                  Performance: {r?.score ?? 'N/A'} ({deviceStatusLabel(r?.score)})
                </p>
                {r && (
                  <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    Evidence <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </td>
            );
            if (!r) {
              return (
                <tr key={p.id} className="border-t border-slate-200">
                  {pageCell(1)}
                  <td colSpan={4} className="px-4 py-3 text-red-700">
                    {p.errors[device] ? `Test failed: ${p.errors[device]}` : 'Test not completed (cancelled).'}
                  </td>
                </tr>
              );
            }
            return r.metrics.map((m, i) => (
              <tr key={`${p.id}-${m.id}`} className={i === 0 ? 'border-t border-slate-200' : 'border-t border-slate-100'}>
                {i === 0 && pageCell(r.metrics.length)}
                <td className="px-4 py-2.5">{m.label} <span className="text-slate-400">({m.short})</span></td>
                <td className="px-4 py-2.5 font-medium">{m.observed}</td>
                <td className="px-4 py-2.5 text-slate-500">{m.expected}</td>
                <td className="px-4 py-2.5"><StatusBadge status={m.status} /></td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeviceDetail({ page, device }: { page: PageResult; device: Device }) {
  const r = page[device];
  const Icon = device === 'mobile' ? Smartphone : Monitor;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Icon className="h-4 w-4 text-blue-600" /> {DEVICE_LABEL[device]}
        </h3>
        {r && (
          <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            PageSpeed evidence <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {!r ? (
        <div className="mt-4"><Alert tone="error">{page.errors[device] ? `Test failed: ${page.errors[device]}` : 'Test not completed.'}</Alert></div>
      ) : (
        <>
          <div className="my-4 flex items-center gap-4">
            <ScoreRing score={r.score} size={88} />
            <div>
              <p className="text-sm text-slate-500">Performance score</p>
              <BandBadge band={scoreBand(r.score)}>{deviceStatusLabel(r.score)}</BandBadge>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {r.metrics.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{m.label}</span> <span className="text-slate-400">({m.short})</span>
                  <span className="block text-xs text-slate-400">Expected {m.expected}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{m.observed}</span>
                  <StatusBadge status={m.status} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
