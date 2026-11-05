// Excel template, upload parsing and report generation (runs in the browser; also works in Node for tests).
import ExcelJS from 'exceljs';
import { LIMITS } from './config';
import { deviceStatusLabel, formatDate, pageOverall, scoreBand, siteName, STATUS_LABEL, type ScoreBand } from './metrics';
import { normalizeUrl } from './urls';
import { DEVICE_LABEL, DEVICES, PAGE_TYPE_LABEL, type MetricStatus, type PageResult, type TestRun } from './types';

export const URL_COLUMN = 'Website URL';

// ---------------------------------------------------------------- template + upload

export async function createTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Websites');
  ws.columns = [{ header: URL_COLUMN, key: 'url', width: 45 }];
  ['https://example.com', 'https://example2.com', 'https://example3.com'].forEach((url) => ws.addRow({ url }));
  styleHeader(ws.getRow(1));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('hyperlink' in v && v.hyperlink) return String((v as ExcelJS.CellHyperlinkValue).text || v.hyperlink);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String((v as { text: unknown }).text ?? '');
  }
  return String(v);
}

export interface UrlParseResult {
  urls: string[];
  invalid: { row: number; value: string }[];
  duplicates: number;
  emptyRows: number;
  truncated: number;
}

/** Finds the "Website URL" column (case-insensitive, trimmed) and returns validated, de-duplicated URLs. */
export function extractUrls(rows: string[][]): UrlParseResult {
  const headerRow = rows.findIndex((r, i) => i < 10 && r.some((c) => c.trim().toLowerCase() === URL_COLUMN.toLowerCase()));
  if (headerRow < 0) throw new Error(`Column "${URL_COLUMN}" was not found. Add a header cell named "${URL_COLUMN}" in the first row.`);
  const col = rows[headerRow].findIndex((c) => c.trim().toLowerCase() === URL_COLUMN.toLowerCase());

  const seen = new Set<string>();
  const result: UrlParseResult = { urls: [], invalid: [], duplicates: 0, emptyRows: 0, truncated: 0 };
  rows.slice(headerRow + 1).forEach((r, i) => {
    const raw = (r[col] || '').trim();
    if (!raw) return void result.emptyRows++;
    const url = normalizeUrl(raw);
    if (!url) return void result.invalid.push({ row: headerRow + i + 2, value: raw });
    const key = url.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return void result.duplicates++;
    seen.add(key);
    if (result.urls.length >= LIMITS.maxUrlsPerUpload) return void result.truncated++;
    result.urls.push(url);
  });
  return result;
}

export async function parseUrlWorkbook(data: ArrayBuffer): Promise<UrlParseResult> {
  if (data.byteLength > LIMITS.maxUploadBytes) throw new Error(`File is too large. Maximum size is ${LIMITS.maxUploadBytes / 1024 / 1024} MB.`);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error('Could not read the file. Please upload a valid .xlsx Excel file.');
  }
  let lastError: Error | null = null;
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => (cells[c - 1] = cellText(cell.value)));
      rows[n - 1] = Array.from(cells, (c) => c ?? '');
    });
    try {
      return extractUrls(Array.from(rows, (r) => r ?? []));
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError || new Error('The workbook has no worksheets.');
}

// ---------------------------------------------------------------- report styling

const COLORS = {
  header: 'FF1F3864',
  white: 'FFFFFFFF',
  border: 'FFBFBFBF',
  title: 'FF1F3864',
  link: 'FF1155CC',
};
const SCORE_FILL: Record<ScoreBand, string> = { good: 'FFD9EAD3', average: 'FFFCE8B2', poor: 'FFF4CCCC', na: 'FFEEEEEE' };
const STATUS_FILL: Record<MetricStatus, string> = { pass: 'FFD9EAD3', warning: 'FFFCE8B2', fail: 'FFF4CCCC', na: 'FFEEEEEE' };

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin: ExcelJS.Border = { style: 'thin', color: { argb: COLORS.border } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = fill(COLORS.header);
    c.font = { bold: true, color: { argb: COLORS.white } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  row.height = 22;
}

function styleBody(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
    c.alignment = { vertical: 'top', wrapText: true, ...c.alignment };
  });
}

function addTitle(ws: ExcelJS.Worksheet, text: string) {
  const row = ws.addRow([text]);
  row.font = { bold: true, size: 16, color: { argb: COLORS.title } };
  row.height = 24;
}

function addSection(ws: ExcelJS.Worksheet, text: string) {
  ws.addRow([]);
  const row = ws.addRow([text]);
  row.font = { bold: true, size: 12, color: { argb: COLORS.title } };
}

function addInfo(ws: ExcelJS.Worksheet, label: string, value: string | number, band?: ScoreBand) {
  const row = ws.addRow([label, value]);
  row.getCell(1).font = { bold: true };
  if (band) {
    row.getCell(2).fill = fill(SCORE_FILL[band]);
    row.getCell(2).font = { bold: true };
  }
  row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
}

function link(cell: ExcelJS.Cell, url: string, text = url) {
  cell.value = { text, hyperlink: url };
  cell.font = { color: { argb: COLORS.link }, underline: true };
}

// ---------------------------------------------------------------- report sheets

const SUMMARY_HEADERS = ['Website Name', 'Website URL', 'Mobile Score', 'Desktop Score', 'Mobile Status', 'Desktop Status', 'Overall Status', 'Notes'];
const DETAIL_HEADERS = ['Device', 'Metric', 'Observed Value', 'Expected Value', 'Status', 'Evidence Link'];

function errorNote(p: PageResult): string {
  return DEVICES.filter((d) => p.errors[d]).map((d) => `${DEVICE_LABEL[d]} failed: ${p.errors[d]}`).join(' | ') || (p.status === 'cancelled' ? 'Cancelled' : '');
}

function addSummaryTable(ws: ExcelJS.Worksheet, run: TestRun): { headerRow: number; lastRow: number } {
  const header = ws.addRow(run.mode === 'website' ? ['Page Type', ...SUMMARY_HEADERS] : SUMMARY_HEADERS);
  styleHeader(header);
  const offset = run.mode === 'website' ? 1 : 0;
  for (const p of run.pages) {
    const overall = pageOverall(p);
    const values = [
      p.name,
      p.url,
      p.mobile?.score ?? 'N/A',
      p.desktop?.score ?? 'N/A',
      p.mobile ? deviceStatusLabel(p.mobile.score) : 'Failed',
      p.desktop ? deviceStatusLabel(p.desktop.score) : 'Failed',
      overall.label,
      errorNote(p),
    ];
    const row = ws.addRow(run.mode === 'website' ? [p.pageType ? PAGE_TYPE_LABEL[p.pageType] : '', ...values] : values);
    styleBody(row);
    link(row.getCell(2 + offset), p.url);
    DEVICES.forEach((d, i) => {
      const band = scoreBand(p[d]?.score);
      for (const c of [3 + i + offset, 5 + i + offset]) {
        row.getCell(c).fill = fill(SCORE_FILL[band]);
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'top' };
      }
    });
    row.getCell(7 + offset).fill = fill(SCORE_FILL[overall.band]);
    row.getCell(7 + offset).font = { bold: true };
  }
  return { headerRow: header.number, lastRow: ws.lastRow!.number };
}

function addDetailTable(ws: ExcelJS.Worksheet, p: PageResult, devices = DEVICES) {
  styleHeader(ws.addRow(DETAIL_HEADERS));
  for (const d of devices) {
    const r = p[d];
    if (!r) {
      const row = ws.addRow([DEVICE_LABEL[d], 'All metrics', 'N/A', '', `Test failed: ${p.errors[d] || 'not run'}`, '']);
      styleBody(row);
      row.getCell(5).fill = fill(STATUS_FILL.fail);
      continue;
    }
    const scoreRow = ws.addRow([DEVICE_LABEL[d], 'Performance Score', r.score ?? 'N/A', '90 - 100', deviceStatusLabel(r.score), '']);
    styleBody(scoreRow);
    scoreRow.getCell(3).fill = fill(SCORE_FILL[scoreBand(r.score)]);
    scoreRow.getCell(5).fill = fill(SCORE_FILL[scoreBand(r.score)]);
    link(scoreRow.getCell(6), r.evidenceUrl, `PageSpeed ${DEVICE_LABEL[d]} report`);
    for (const m of r.metrics) {
      const row = ws.addRow([DEVICE_LABEL[d], `${m.label} (${m.short})`, m.observed, m.expected, STATUS_LABEL[m.status], '']);
      styleBody(row);
      row.getCell(5).fill = fill(STATUS_FILL[m.status]);
      row.getCell(5).font = { bold: true };
      link(row.getCell(6), r.evidenceUrl, `PageSpeed ${DEVICE_LABEL[d]} report`);
    }
  }
}

function addPageInfo(ws: ExcelJS.Worksheet, p: PageResult) {
  addInfo(ws, 'Website Name', siteName(p.url));
  if (p.name !== siteName(p.url)) addInfo(ws, 'Page Name', p.name);
  addInfo(ws, 'Website URL', p.url);
  link(ws.lastRow!.getCell(2), p.url);
  if (p.pageType) addInfo(ws, 'Page Type', PAGE_TYPE_LABEL[p.pageType]);
  addInfo(ws, 'Test Date', formatDate(p.testedAt) || 'Not tested');
  addInfo(ws, 'Mobile Performance Score', p.mobile?.score ?? 'N/A', scoreBand(p.mobile?.score));
  addInfo(ws, 'Desktop Performance Score', p.desktop?.score ?? 'N/A', scoreBand(p.desktop?.score));
  addInfo(ws, 'Overall Status', pageOverall(p).label, pageOverall(p).band);
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Page';
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 26)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

const SUMMARY_WIDTHS = [28, 45, 13, 13, 20, 20, 24, 40];
const DETAIL_WIDTHS = [26, 34, 16, 16, 26, 28];

export async function buildExcelReport(run: TestRun): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PageSpeed Analyzer';
  wb.created = new Date(run.startedAt);
  const summary = wb.addWorksheet('Summary');

  addTitle(summary, 'Website PageSpeed Performance Report');
  addInfo(summary, 'Test Date', formatDate(run.startedAt));
  addInfo(summary, 'Testing Mode', { single: 'Single URL', bulk: 'Bulk URL (Excel)', website: 'Whole Website' }[run.mode]);
  addInfo(summary, 'Pages Tested', run.pages.length);
  if (run.cancelled) addInfo(summary, 'Note', 'Testing was cancelled; only completed results are included.');
  summary.addRow([]);

  const { headerRow, lastRow } = addSummaryTable(summary, run);
  const widths = run.mode === 'website' ? [24, ...SUMMARY_WIDTHS] : SUMMARY_WIDTHS;
  summary.columns.forEach((c, i) => (c.width = widths[i] ?? 18));
  summary.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: widths.length } };
  summary.views = [{ state: 'frozen', ySplit: headerRow }];

  if (run.mode === 'single') {
    const p = run.pages[0];
    for (const d of DEVICES) {
      addSection(summary, `${DEVICE_LABEL[d]} Results`);
      addDetailTable(summary, p, [d]);
    }
    return wb;
  }

  const used = new Set(['summary']);
  for (const p of run.pages) {
    const ws = wb.addWorksheet(uniqueSheetName(run.mode === 'website' ? p.name : siteName(p.url), used));
    addTitle(ws, run.mode === 'website' ? p.name : siteName(p.url));
    addPageInfo(ws, p);
    ws.addRow([]);
    const before = ws.rowCount + 1;
    addDetailTable(ws, p);
    ws.columns.forEach((c, i) => (c.width = DETAIL_WIDTHS[i] ?? 18));
    ws.views = [{ state: 'frozen', ySplit: before }];
  }
  return wb;
}

export async function excelReportBlob(run: TestRun): Promise<Blob> {
  const wb = await buildExcelReport(run);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
