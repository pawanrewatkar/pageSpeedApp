'use client';

import { useRef, useState } from 'react';
import { Download, Play, Upload, X } from 'lucide-react';
import { LIMITS } from '@/lib/config';
import { siteName } from '@/lib/metrics';
import type { UrlParseResult } from '@/lib/excel';
import type { PageInput } from '@/lib/types';
import { Alert, Button, Card, downloadBlob } from './ui';

export default function BulkTest({ disabled, onStart }: { disabled: boolean; onStart: (pages: PageInput[]) => void }) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<UrlParseResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    const { createTemplate } = await import('@/lib/excel');
    downloadBlob(new Blob([await createTemplate()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'pagespeed-url-template.xlsx');
  }

  async function onFile(file: File | undefined) {
    setError('');
    setParsed(null);
    setFileName(file?.name || '');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return setError('Please upload an Excel .xlsx file.');
    if (file.size > LIMITS.maxUploadBytes) return setError(`File is too large. Maximum size is ${LIMITS.maxUploadBytes / 1024 / 1024} MB.`);
    setBusy(true);
    try {
      const { parseUrlWorkbook } = await import('@/lib/excel');
      const result = await parseUrlWorkbook(await file.arrayBuffer());
      if (!result.urls.length) setError('No valid website URLs were found in the "Website URL" column.');
      setParsed(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setParsed(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Upload Website URLs</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Upload an Excel file containing a column named <strong>Website URL</strong>. The application will automatically test all listed websites.
          </p>
        </div>
        <Button variant="secondary" onClick={downloadTemplate} icon={<Download className="h-4 w-4" />} className="shrink-0">
          Download Sample Template
        </Button>
      </div>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
        <Upload className="h-6 w-6 text-blue-600" />
        <span className="text-sm font-medium text-slate-700">{fileName || 'Click to choose an .xlsx file'}</span>
        <span className="text-xs text-slate-400">Max {LIMITS.maxUploadBytes / 1024 / 1024} MB · up to {LIMITS.maxUrlsPerUpload} URLs</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Upload Excel file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {busy && <p className="mt-3 text-sm text-slate-500">Reading file…</p>}
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      {parsed && parsed.urls.length > 0 && (
        <div className="mt-4 space-y-3">
          <Alert tone="success">
            <strong>{parsed.urls.length} valid URL{parsed.urls.length === 1 ? '' : 's'}</strong> ready for testing
            {parsed.duplicates > 0 && ` · ${parsed.duplicates} duplicate${parsed.duplicates === 1 ? '' : 's'} removed`}
            {parsed.emptyRows > 0 && ` · ${parsed.emptyRows} empty row${parsed.emptyRows === 1 ? '' : 's'} skipped`}
          </Alert>
          {parsed.invalid.length > 0 && (
            <Alert tone="warning">
              {parsed.invalid.length} invalid URL{parsed.invalid.length === 1 ? '' : 's'} skipped:{' '}
              {parsed.invalid.slice(0, 5).map((i) => `row ${i.row} "${i.value}"`).join(', ')}
              {parsed.invalid.length > 5 && '…'}
            </Alert>
          )}
          {parsed.truncated > 0 && (
            <Alert tone="warning">Only the first {LIMITS.maxUrlsPerUpload} URLs will be tested; {parsed.truncated} more were skipped.</Alert>
          )}
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Website</th><th className="px-3 py-2">URL</th></tr>
              </thead>
              <tbody>
                {parsed.urls.map((u, i) => (
                  <tr key={u} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{siteName(u)}</td>
                    <td className="break-all px-3 py-2 text-slate-600">{u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled} icon={<Play className="h-4 w-4" />} onClick={() => onStart(parsed.urls.map((url) => ({ url, name: siteName(url) })))}>
              Start Bulk Testing
            </Button>
            <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={clear}>Clear</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
