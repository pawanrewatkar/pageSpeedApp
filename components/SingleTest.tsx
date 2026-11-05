'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { siteName } from '@/lib/metrics';
import { normalizeUrl } from '@/lib/urls';
import type { PageInput } from '@/lib/types';
import { Alert, Button, Card, Input } from './ui';

export default function SingleTest({ disabled, onStart }: { disabled: boolean; onStart: (pages: PageInput[]) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(value);
    if (!url) {
      setError('Please enter a valid public website URL, for example https://example.com');
      return;
    }
    setError('');
    setValue(url);
    onStart([{ url, name: siteName(url) }]);
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Single URL Testing</h2>
      <p className="mt-1 text-sm text-slate-500">Runs separate Mobile and Desktop PageSpeed tests for one page.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          aria-label="Website URL"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={disabled} icon={<Search className="h-4 w-4" />} className="shrink-0">
          Analyze Website
        </Button>
      </form>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
    </Card>
  );
}
