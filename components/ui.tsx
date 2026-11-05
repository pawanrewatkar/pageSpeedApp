import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { scoreBand, STATUS_LABEL, type ScoreBand } from '@/lib/metrics';
import type { MetricStatus } from '@/lib/types';
import type { Priority } from '@/lib/recommendations';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-blue-600 hover:bg-blue-50',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
};

export function Button({
  variant = 'primary',
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-green-200 bg-green-50 text-green-800',
  }[tone];
  return <div className={cn('rounded-lg border px-4 py-3 text-sm', styles)}>{children}</div>;
}

export const BAND_TEXT: Record<ScoreBand, string> = { good: 'text-green-600', average: 'text-orange-500', poor: 'text-red-600', na: 'text-slate-400' };
const BAND_STROKE: Record<ScoreBand, string> = { good: '#16a34a', average: '#f97316', poor: '#dc2626', na: '#cbd5e1' };
const BAND_BADGE: Record<ScoreBand, string> = {
  good: 'bg-green-50 text-green-700 ring-green-200',
  average: 'bg-orange-50 text-orange-700 ring-orange-200',
  poor: 'bg-red-50 text-red-700 ring-red-200',
  na: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function ScoreRing({ score, size = 72, label }: { score: number | null | undefined; size?: number; label?: string }) {
  const band = scoreBand(score);
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label ?? 'Score'}: ${score ?? 'N/A'}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={BAND_STROKE[band]} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${((score ?? 0) / 100) * c} ${c}`} transform="rotate(-90 50 50)"
        />
        <text x="50" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill={BAND_STROKE[band] === '#cbd5e1' ? '#64748b' : BAND_STROKE[band]}>
          {score ?? 'N/A'}
        </text>
      </svg>
      {label && <span className="text-xs font-medium text-slate-500">{label}</span>}
    </div>
  );
}

export function BandBadge({ band, children }: { band: ScoreBand; children: ReactNode }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', BAND_BADGE[band])}>{children}</span>;
}

const STATUS_STYLE: Record<MetricStatus, string> = {
  pass: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-orange-50 text-orange-700 ring-orange-200',
  fail: 'bg-red-50 text-red-700 ring-red-200',
  na: 'bg-slate-100 text-slate-500 ring-slate-200',
};
const STATUS_DOT: Record<MetricStatus, string> = { pass: 'bg-green-500', warning: 'bg-orange-500', fail: 'bg-red-500', na: 'bg-slate-400' };

export function StatusBadge({ status }: { status: MetricStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', STATUS_STYLE[status])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  High: 'bg-red-50 text-red-700 ring-red-200',
  Medium: 'bg-orange-50 text-orange-700 ring-orange-200',
  Low: 'bg-green-50 text-green-700 ring-green-200',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', PRIORITY_STYLE[priority])}>{priority} priority</span>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
        props.className,
      )}
    />
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
