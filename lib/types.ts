import type { MetricId } from './config';

export type Device = 'mobile' | 'desktop';
export const DEVICES: Device[] = ['mobile', 'desktop'];
export const DEVICE_LABEL: Record<Device, string> = { mobile: 'Mobile', desktop: 'Desktop' };

export type MetricStatus = 'pass' | 'warning' | 'fail' | 'na';

export interface Metric {
  id: MetricId;
  short: string;
  label: string;
  value: number | null; // in display units (s, ms or unitless)
  observed: string;
  expected: string;
  status: MetricStatus;
}

export interface Audit {
  id: string;
  title: string;
  description: string;
  displayValue: string;
  score: number | null;
  savingsMs: number;
  savingsBytes: number;
  metrics: string[]; // metrics this audit affects, e.g. ['LCP', 'FCP']
}

export interface DeviceResult {
  device: Device;
  score: number | null;
  metrics: Metric[];
  audits: Audit[];
  evidenceUrl: string;
  fetchTime: string;
  finalUrl: string;
}

export type PageType = 'homepage' | 'collection' | 'product' | 'blog' | 'category' | 'other';

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  homepage: 'Homepage',
  collection: 'Collection Pages',
  product: 'Product Detail Pages (PDP)',
  blog: 'Blog Pages',
  category: 'Category Pages',
  other: 'Other Important Pages',
};

export interface PageInput {
  url: string;
  name: string;
  pageType?: PageType;
}

export type PageStatus = 'pending' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled';

export interface PageResult extends PageInput {
  id: string;
  status: PageStatus;
  testedAt?: string;
  mobile?: DeviceResult;
  desktop?: DeviceResult;
  errors: Partial<Record<Device, string>>;
}

export type TestMode = 'single' | 'bulk' | 'website';

export interface TestRun {
  mode: TestMode;
  startedAt: string;
  finishedAt?: string;
  cancelled?: boolean;
  pages: PageResult[];
}

export interface DiscoveredPage {
  url: string;
  name: string;
  pageType: PageType;
}
