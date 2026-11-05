'use client';

import { useState } from 'react';
import { Link2, RefreshCw, Search } from 'lucide-react';
import { siteName } from '@/lib/metrics';
import { normalizeUrl } from '@/lib/urls';
import type { PageInput } from '@/lib/types';
import { Alert, Button, Card, Input, PanelHeader } from './ui';

export default function SingleTest({
  disabled,
  onStart,
}: {
  disabled: boolean;
  onStart: (pages: PageInput[]) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [lastUrl, setLastUrl] = useState(''); // last analyzed URL, enables "Re-run Test"

  function run(url: string) {
    setLastUrl(url);
    onStart([{ url, name: siteName(url) }]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(value);
    if (!url) {
      setError('Please enter a valid public website URL, for example https://example.com');
      return;
    }
    setError('');
    setValue(url);
    run(url);
  }

  return (
    <Card>
      <PanelHeader icon={<Link2 className="h-5 w-5" />} title="Single URL Testing" description="Runs separate Mobile and Desktop PageSpeed tests for one page." />
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
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
        {lastUrl && (
          <Button
            variant="secondary"
            disabled={disabled}
            icon={<RefreshCw className="h-4 w-4" />}
            className="shrink-0"
            title={`Run the PageSpeed test again for ${lastUrl}`}
            onClick={() => run(lastUrl)}
          >
            Re-run Test
          </Button>
        )}
      </form>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
    </Card>
  );
}
