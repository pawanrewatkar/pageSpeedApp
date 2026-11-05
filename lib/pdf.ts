// PDF report (runs in the browser; also works in Node for tests).
import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { deviceStatusLabel, formatDate, pageOverall, scoreBand, siteName, STATUS_LABEL, summarizeRun, type ScoreBand } from './metrics';
import { buildRecommendations, type Priority } from './recommendations';
import { DEVICE_LABEL, DEVICES, PAGE_TYPE_LABEL, type Device, type MetricStatus, type PageResult, type TestRun } from './types';

type RGB = [number, number, number];
const NAVY: RGB = [31, 56, 100];
const GREY: RGB = [100, 100, 100];

// Colours of the on-screen results table (Tailwind slate/green/orange/red), used for the evidence snapshot.
const UI = {
  white: [255, 255, 255] as RGB,
  border: [226, 232, 240] as RGB,
  headBg: [248, 250, 252] as RGB,
  rowLine: [241, 245, 249] as RGB,
  text: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  faint: [148, 163, 184] as RGB,
  link: [37, 99, 235] as RGB,
  band: { good: [22, 163, 74], average: [234, 88, 12], poor: [220, 38, 38], na: [148, 163, 184] } as Record<ScoreBand, RGB>,
  status: {
    pass: { bg: [240, 253, 244], ring: [187, 247, 208], dot: [34, 197, 94], text: [21, 128, 61] },
    warning: { bg: [255, 247, 237], ring: [254, 215, 170], dot: [249, 115, 22], text: [194, 65, 12] },
    fail: { bg: [254, 242, 242], ring: [254, 202, 202], dot: [239, 68, 68], text: [185, 28, 28] },
    na: { bg: [241, 245, 249], ring: [226, 232, 240], dot: [148, 163, 184], text: [100, 116, 139] },
  } as Record<MetricStatus, { bg: RGB; ring: RGB; dot: RGB; text: RGB }>,
};
const SCORE_RGB: Record<ScoreBand, RGB> = { good: [217, 234, 211], average: [252, 232, 178], poor: [244, 204, 204], na: [238, 238, 238] };
const STATUS_RGB: Record<MetricStatus, RGB> = { pass: [217, 234, 211], warning: [252, 232, 178], fail: [244, 204, 204], na: [238, 238, 238] };
const PRIORITY_RGB: Record<Priority, RGB> = { High: [244, 204, 204], Medium: [252, 232, 178], Low: [217, 234, 211] };

const INTRO = [
  'PageSpeed testing has been completed for the website. The website was analyzed separately for Mobile and Desktop devices using Google\'s PageSpeed Insights and Lighthouse testing engine.',
  'This report identifies website loading performance issues and provides practical recommendations to help developers improve page speed and user experience.',
];

const MARGIN = 40;
const TOP = 60;
const BOTTOM = 50;

/** Built-in PDF fonts only support Latin-1, so replace common unicode characters. */
const pdfText = (s: string) =>
  s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

export function buildPdfReport(run: TestRun): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  let y = TOP;

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (h: number) => {
    if (y + h > pageH - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };
  const heading = (text: string, size = 14) => {
    ensure(size + 30);
    doc.setFont('helvetica', 'bold').setFontSize(size).setTextColor(...NAVY);
    doc.text(pdfText(text), MARGIN, y);
    y += size + 8;
  };
  const paragraph = (text: string, size = 10) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(40, 40, 40);
    const lines: string[] = doc.splitTextToSize(pdfText(text), contentW);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, MARGIN, y);
      y += size + 4;
    }
    y += 6;
  };
  const table = (head: string[], body: (string | number)[][], opts: Parameters<typeof autoTable>[1] = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(pdfText)],
      body: body.map((r) => r.map((c) => pdfText(String(c)))),
      margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
      styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak', valign: 'top', lineColor: [210, 210, 210], lineWidth: 0.5 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      rowPageBreak: 'avoid',
      ...opts,
    });
    y = lastY() + 16;
  };

  const stats = summarizeRun(run);
  const success = run.pages.filter((p) => p.mobile || p.desktop);
  const single = run.pages.length === 1 ? run.pages[0] : null;

  // ---------------- Executive summary
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...NAVY);
  doc.text('Website PageSpeed Performance Report', MARGIN, y + 4);
  y += 32;
  heading('Executive Summary');
  INTRO.forEach((p) => paragraph(p));

  const info: (string | number)[][] = single
    ? [
        ['Website Name', siteName(single.url)],
        ['Website URL', single.url],
        ['Test Date', formatDate(single.testedAt || run.startedAt)],
        ['Mobile Score', single.mobile?.score ?? 'N/A'],
        ['Desktop Score', single.desktop?.score ?? 'N/A'],
        ['Overall Result', pageOverall(single).label],
      ]
    : [
        ['Website(s)', [...new Set(run.pages.map((p) => siteName(p.url)))].slice(0, 5).join(', ') + (stats.websites > 5 ? ` and ${stats.websites - 5} more` : '')],
        ['Test Date', formatDate(run.startedAt)],
        ['Pages Tested', stats.pages],
        ['Successful / Failed Tests', `${stats.success} / ${stats.failed}`],
        ['Average Mobile Score', stats.avgMobile ?? 'N/A'],
        ['Average Desktop Score', stats.avgDesktop ?? 'N/A'],
      ];
  const bandFor = (label: string, value: string | number) =>
    /Score/.test(label) && typeof value === 'number' ? scoreBand(value) : label === 'Overall Result' && single ? pageOverall(single).band : null;
  table(['Item', 'Value'], info, {
    theme: 'grid',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170 } },
    didParseCell: (d: CellHookData) => {
      if (d.section !== 'body' || d.column.index !== 1) return;
      const band = bandFor(String(info[d.row.index][0]), info[d.row.index][1]);
      if (band) d.cell.styles.fillColor = SCORE_RGB[band];
    },
  });
  if (run.cancelled) paragraph('Note: testing was cancelled before completion. Only completed results are included.');

  if (!single) {
    heading('Results Summary', 12);
    const rows = run.pages.map((p) => [p.name, p.url, p.mobile?.score ?? 'N/A', p.desktop?.score ?? 'N/A', pageOverall(p).label]);
    table(['Website / Page', 'URL', 'Mobile', 'Desktop', 'Overall'], rows, {
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 200 }, 2: { cellWidth: 50, halign: 'center' }, 3: { cellWidth: 50, halign: 'center' } },
      didParseCell: (d: CellHookData) => {
        if (d.section !== 'body') return;
        const p = run.pages[d.row.index];
        if (d.column.index === 2) d.cell.styles.fillColor = SCORE_RGB[scoreBand(p.mobile?.score)];
        if (d.column.index === 3) d.cell.styles.fillColor = SCORE_RGB[scoreBand(p.desktop?.score)];
        if (d.column.index === 4) d.cell.styles.fillColor = SCORE_RGB[pageOverall(p).band];
      },
    });
    const failed = run.pages.filter((p) => DEVICES.some((d) => p.errors[d]) || p.status === 'cancelled');
    if (failed.length) {
      heading('Failed or Incomplete Tests', 12);
      table(
        ['URL', 'Details'],
        failed.map((p) => [p.url, DEVICES.filter((d) => p.errors[d]).map((d) => `${DEVICE_LABEL[d]}: ${p.errors[d]}`).join('\n') || 'Cancelled']),
        { columnStyles: { 0: { cellWidth: 220 } } },
      );
    }
  }

  // ---------------- Detailed results per page
  for (const p of success) {
    doc.addPage();
    y = TOP;
    heading(single ? 'Detailed Results' : `Detailed Results: ${p.name}`, 15);
    paragraph(`URL: ${p.url}${p.pageType ? `   |   Page type: ${PAGE_TYPE_LABEL[p.pageType]}` : ''}   |   Tested: ${formatDate(p.testedAt)}`, 9);
    addDeviceTables(p);
    addRecommendations(p);
  }
  if (!success.length) {
    heading('Detailed Results', 12);
    paragraph('No test completed successfully, so there are no detailed results to report.');
  }

  function addDeviceTables(p: PageResult) {
    for (const d of DEVICES) {
      const r = p[d];
      heading(`${DEVICE_LABEL[d]} Results`, 12);
      if (!r) {
        paragraph(`${DEVICE_LABEL[d]} test failed: ${p.errors[d] || 'not completed'}`);
        continue;
      }
      const rows = [
        ['Performance Score', String(r.score ?? 'N/A'), '90 - 100', deviceStatusLabel(r.score)],
        ...r.metrics.map((m) => [`${m.label} (${m.short})`, m.observed, m.expected, STATUS_LABEL[m.status]]),
      ];
      table(['Metric', 'Observed Value', 'Expected Value', 'Status'], rows, {
        columnStyles: { 0: { cellWidth: 200 }, 3: { fontStyle: 'bold' } },
        didParseCell: (c: CellHookData) => {
          if (c.section !== 'body' || c.column.index !== 3) return;
          c.cell.styles.fillColor = c.row.index === 0 ? SCORE_RGB[scoreBand(r.score)] : STATUS_RGB[r.metrics[c.row.index - 1].status];
        },
      });
      addEvidenceSnapshot(p, d);
      y += 6;
    }
  }

  /** Draws the app's "Mobile/Desktop Results" table exactly as it looks on screen, as an evidence snapshot. */
  function addEvidenceSnapshot(p: PageResult, device: Device) {
    const r = p[device]!;
    const cols = [140, 140, 82, 80, 73]; // Website/Page, Metric, Observed, Expected, Status (= content width)
    const x = cols.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
    const headH = 24;
    const rowH = 27;
    const boxH = headH + rowH * r.metrics.length;

    ensure(boxH + 22);
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...GREY);
    doc.text(pdfText(`Evidence Snapshot (${formatDate(r.fetchTime)})`), MARGIN, y);
    y += 6;
    const top = y;

    // Card with header row
    doc.setFillColor(...UI.white).setDrawColor(...UI.border).setLineWidth(0.75);
    doc.roundedRect(MARGIN, top, contentW, boxH, 6, 6, 'FD');
    doc.setFillColor(...UI.headBg).rect(MARGIN + 0.5, top + 0.5, contentW - 1, headH - 0.5, 'F');
    doc.setDrawColor(...UI.border).line(MARGIN, top + headH, MARGIN + contentW, top + headH);
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...UI.muted);
    ['WEBSITE/PAGE', 'METRIC', 'OBSERVED VALUE', 'EXPECTED VALUE', 'STATUS'].forEach((h, i) => doc.text(h, x[i] + 10, top + 15));
    doc.setDrawColor(...UI.rowLine).line(x[1], top + headH, x[1], top + boxH);

    // Website/Page cell (spans all metric rows)
    const fit = (s: string, w: number) => (doc.splitTextToSize(pdfText(s), w) as string[])[0];
    let cy = top + headH + 16;
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...UI.text);
    doc.text(fit(p.name, cols[0] - 20), x[0] + 10, cy);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...UI.muted);
    doc.text(fit(p.url, cols[0] - 20), x[0] + 10, (cy += 11));
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...UI.band[scoreBand(r.score)]);
    const perfLines = (doc.splitTextToSize(`Performance: ${r.score ?? 'N/A'} (${deviceStatusLabel(r.score)})`, cols[0] - 20) as string[]).slice(0, 2);
    doc.text(perfLines, x[0] + 10, (cy += 13), { lineHeightFactor: 1.3 });

    // Metric rows
    r.metrics.forEach((m, i) => {
      const rowTop = top + headH + i * rowH;
      const mid = rowTop + rowH / 2 + 3;
      if (i > 0) doc.setDrawColor(...UI.rowLine).line(x[1], rowTop, MARGIN + contentW, rowTop);
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...UI.text);
      doc.text(m.label, x[1] + 10, mid);
      doc.setTextColor(...UI.faint).text(`(${m.short})`, x[1] + 10 + doc.getTextWidth(m.label) + 3, mid);
      doc.setFont('helvetica', 'bold').setTextColor(...UI.text).text(pdfText(m.observed), x[2] + 10, mid);
      doc.setFont('helvetica', 'normal').setTextColor(...UI.muted).text(pdfText(m.expected), x[3] + 10, mid);

      // Status pill with dot
      const s = UI.status[m.status];
      const label = STATUS_LABEL[m.status];
      doc.setFont('helvetica', 'bold').setFontSize(7);
      const pillW = doc.getTextWidth(label) + 20;
      const pillX = x[4] + 8;
      doc.setFillColor(...s.bg).setDrawColor(...s.ring).setLineWidth(0.5);
      doc.roundedRect(pillX, mid - 9, pillW, 13, 6.5, 6.5, 'FD');
      doc.setFillColor(...s.dot).circle(pillX + 7, mid - 2.5, 1.8, 'F');
      doc.setTextColor(...s.text).text(label, pillX + 12, mid);
    });

    y = top + boxH + 14;
  }

  function addRecommendations(p: PageResult) {
    const recs = buildRecommendations([p]);
    heading('Developer Recommendations', 12);
    if (!recs.length) {
      paragraph('Lighthouse did not report any significant performance issues for this page.');
      return;
    }
    const rows = recs.map((r) => [
      `${r.issue}\n\n${r.what}\nSeen on: ${r.affected.map((a) => `${DEVICE_LABEL[a.device]}${a.detail ? ` (${a.detail})` : ''}`).join(', ')}`,
      r.why,
      r.action,
      r.priority,
    ]);
    table(['Issue', 'Why it affects performance', 'What the developer should do', 'Priority'], rows, {
      styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak', valign: 'top', lineColor: [210, 210, 210], lineWidth: 0.5 },
      columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 140 }, 3: { cellWidth: 55, halign: 'center', fontStyle: 'bold' } },
      rowPageBreak: 'auto',
      didParseCell: (c: CellHookData) => {
        if (c.section === 'body' && c.column.index === 3) c.cell.styles.fillColor = PRIORITY_RGB[recs[c.row.index].priority];
        if (c.section === 'body' && c.column.index === 0) c.cell.styles.fontStyle = 'normal';
      },
    });
  }

  // ---------------- Header and footer on every page
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY);
    doc.text('PageSpeed Analyzer', MARGIN, 30);
    doc.setFont('helvetica', 'normal').setTextColor(...GREY);
    doc.text('Website PageSpeed Performance Report', pageW - MARGIN, 30, { align: 'right' });
    doc.setDrawColor(210, 210, 210).line(MARGIN, 38, pageW - MARGIN, 38);
    doc.line(MARGIN, pageH - 36, pageW - MARGIN, pageH - 36);
    doc.setFontSize(8);
    doc.text(`Generated ${formatDate(run.finishedAt || run.startedAt)} using Google PageSpeed Insights`, MARGIN, pageH - 22);
    doc.text(`Page ${i} of ${total}`, pageW - MARGIN, pageH - 22, { align: 'right' });
  }
  return doc;
}

export function pdfReportBlob(run: TestRun): Blob {
  return buildPdfReport(run).output('blob');
}
