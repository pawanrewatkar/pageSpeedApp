'use client';

import { CheckCircle2, Clock, Loader2, XCircle, AlertTriangle, Ban } from 'lucide-react';
import type { PageResult, PageStatus } from '@/lib/types';
import { Button, Card } from './ui';

const ICON: Record<PageStatus, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-slate-400" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  partial: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  failed: <XCircle className="h-4 w-4 text-red-600" />,
  cancelled: <Ban className="h-4 w-4 text-slate-400" />,
};

export default function Progress({ pages, onCancel }: { pages: PageResult[]; onCancel: () => void }) {
  const completed = pages.filter((p) => p.status === 'done' || p.status === 'partial').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const pending = pages.length - completed - failed;
  const testsDone = pages.reduce((n, p) => n + (p.mobile || p.errors.mobile ? 1 : 0) + (p.desktop || p.errors.desktop ? 1 : 0), 0);
  const pct = pages.length ? Math.round((testsDone / (pages.length * 2)) * 100) : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Testing in progress…
          </h2>
          <p className="text-sm text-slate-500">Each PageSpeed test usually takes 15–60 seconds. Results appear when testing finishes.</p>
        </div>
        <Button variant="danger" onClick={onCancel}>Cancel Remaining Tests</Button>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span>{testsDone} of {pages.length * 2} tests ({pct}%)</span>
        <span className="text-green-700">Completed: {completed}</span>
        <span className="text-red-700">Failed: {failed}</span>
        <span className="text-slate-500">Pending: {pending}</span>
      </div>

      {pages.length > 1 && (
        <ul className="mt-4 max-h-60 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 text-sm">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              {ICON[p.status]}
              <span className="font-medium">{p.name}</span>
              <span className="truncate text-slate-400">{p.url}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
