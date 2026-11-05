import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelReport, createTemplate, extractUrls, parseUrlWorkbook } from '@/lib/excel';
import { buildPdfReport } from '@/lib/pdf';
import { buildRecommendations } from '@/lib/recommendations';
import { pageResult, sampleRun } from './fixtures';

async function workbookBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('Excel upload', () => {
  it('template round-trips through the parser', async () => {
    const result = await parseUrlWorkbook(await createTemplate());
    expect(result.urls).toEqual(['https://example.com/', 'https://example2.com/', 'https://example3.com/']);
  });

  it('matches the header case-insensitively, skips empty rows, removes duplicates and flags invalid URLs', async () => {
    const buf = await workbookBuffer([
      ['Client', '  website url  '],
      ['A', 'https://a.com'],
      ['B', ''],
      ['C', 'a.com/'],
      ['D', 'not a url'],
      ['E', { text: 'b.com', hyperlink: 'https://b.com' }],
      ['F', 'http://localhost:3000'],
    ]);
    const r = await parseUrlWorkbook(buf);
    expect(r.urls).toEqual(['https://a.com/', 'https://b.com/']);
    expect(r.duplicates).toBe(1);
    expect(r.emptyRows).toBe(1);
    expect(r.invalid.map((i) => i.row)).toEqual([5, 7]); // spreadsheet row numbers (header is row 1)
  });

  it('errors when the Website URL column is missing', async () => {
    await expect(parseUrlWorkbook(await workbookBuffer([['URL'], ['https://a.com']]))).rejects.toThrow(/Website URL/);
  });

  it('rejects non-Excel data', async () => {
    await expect(parseUrlWorkbook(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/valid .xlsx/);
  });

  it('limits URLs per upload', () => {
    const rows = [['Website URL'], ...Array.from({ length: 60 }, (_, i) => [`https://s${i}.com`])];
    const r = extractUrls(rows);
    expect(r.urls).toHaveLength(50);
    expect(r.truncated).toBe(10);
  });
});

describe('Excel report', () => {
  it('bulk: summary sheet + one sheet per website, formatted, matching UI data', async () => {
    const run = sampleRun('bulk');
    const wb = await buildExcelReport(run);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'example.com', 'shop.example.org', 'broken.example.net']);

    const summary = wb.getWorksheet('Summary')!;
    let headerRow = 0;
    summary.eachRow((row, n) => { if (row.getCell(1).value === 'Website Name') headerRow = n; });
    const header = summary.getRow(headerRow);
    expect(header.values).toEqual([undefined, 'Website Name', 'Website URL', 'Mobile Score', 'Desktop Score', 'Mobile Status', 'Desktop Status', 'Overall Status', 'Notes']);
    expect((header.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF1F3864');
    expect(header.getCell(1).font.bold).toBe(true);
    expect(summary.autoFilter).toBeTruthy();
    expect(summary.views[0]).toMatchObject({ state: 'frozen', ySplit: headerRow });

    const first = summary.getRow(headerRow + 1);
    expect(first.getCell(3).value).toBe(42);
    expect((first.getCell(3).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFF4CCCC'); // red
    expect((first.getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFD9EAD3'); // green (93)
    expect(first.getCell(2).value).toMatchObject({ hyperlink: 'https://example.com/' });

    const failed = summary.getRow(headerRow + 3);
    expect(failed.getCell(7).value).toBe('Failed');
    expect(String(failed.getCell(8).value)).toContain('FAILED_DOCUMENT_REQUEST');

    const site = wb.getWorksheet('example.com')!;
    const values: string[] = [];
    site.eachRow((r) => values.push(r.values ? (r.values as unknown[]).slice(1).map((v) => (typeof v === 'object' && v ? (v as { text?: string }).text : v)).join('|') : ''));
    expect(values).toContain('Device|Metric|Observed Value|Expected Value|Status|Evidence Link');
    expect(values).toContain('Mobile|Largest Contentful Paint (LCP)|4.8 s|≤ 2.5 s|Fail|PageSpeed Mobile report');
    expect(values).toContain('Desktop|Largest Contentful Paint (LCP)|1.2 s|≤ 2.5 s|Pass|PageSpeed Desktop report');
  });

  it('single: one summary worksheet with Mobile and Desktop sections', async () => {
    const run = { ...sampleRun('single'), pages: [sampleRun().pages[0]] };
    const wb = await buildExcelReport(run);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary']);
    const text: string[] = [];
    wb.getWorksheet('Summary')!.eachRow((r) => text.push(String(r.getCell(1).value)));
    expect(text).toContain('Mobile Results');
    expect(text).toContain('Desktop Results');
  });

  it('website: includes page type column and unique sheet names', async () => {
    const run = sampleRun('website');
    run.pages.push({ ...run.pages[0], id: 'dup', url: 'https://example.com/b' });
    const wb = await buildExcelReport(run);
    const names = wb.worksheets.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
    let found = false;
    wb.getWorksheet('Summary')!.eachRow((r) => { if (r.getCell(1).value === 'Page Type') found = true; });
    expect(found).toBe(true);
    await wb.xlsx.writeBuffer(); // must serialize without errors
  });
});

describe('Recommendations', () => {
  it('derives issues only from actual audits and failing metrics, grouped across pages', () => {
    const run = sampleRun();
    const recs = buildRecommendations(run.pages);
    const issues = recs.map((r) => r.issue);
    expect(issues).toContain('Slow Largest Contentful Paint (LCP)');
    expect(issues).toContain('Remove render-blocking resources');
    expect(issues).toContain('Convert images to WebP or AVIF');
    expect(issues).toContain('Some new Lighthouse audit'); // unknown audit falls back to Lighthouse text
    expect(issues).not.toContain('Enable text compression'); // passed audit
    expect(issues).not.toContain('High Cumulative Layout Shift (CLS)'); // CLS passed
    const lcp = recs.find((r) => r.key === 'metric:LCP')!;
    expect(lcp.priority).toBe('High');
    expect(lcp.action).toContain('Related findings');
    expect(recs[0].priority).toBe('High');
  });

  it('returns nothing for a perfect page', () => {
    const p = pageResult({ url: 'https://fast.com/', name: 'fast.com' }, { mobile: { score: 1, fcp: 500, lcp: 800, tbt: 0, cls: 0, si: 600 } });
    p.mobile!.audits = [];
    p.desktop!.audits = [];
    expect(buildRecommendations([p])).toEqual([]);
  });
});

describe('PDF report', () => {
  it('builds a multi-page PDF with summary, details, links and page numbers', () => {
    const doc = buildPdfReport(sampleRun('bulk'));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(3); // summary + 2 successful pages
    const raw = doc.output();
    expect(raw).toContain('Website PageSpeed Performance Report');
    expect(raw).toContain('Executive Summary');
    expect(raw).toContain('Failed or Incomplete Tests');
    expect(raw).toContain(`Page ${pages} of ${pages}`);
    expect(raw).toContain('pagespeed.web.dev/analysis/');
    expect(raw).toContain('Developer Recommendations');
    expect(raw).toContain('<= 2.5 s'); // unicode replaced for built-in fonts
  });

  it('builds a single URL report', () => {
    const run = { ...sampleRun('single'), pages: [sampleRun().pages[0]] };
    const raw = buildPdfReport(run).output();
    expect(raw).toContain('Overall Result');
    expect(raw).toContain('Mobile Results');
    expect(raw).toContain('Desktop Results');
  });
});
