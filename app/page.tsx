import { connection } from 'next/server';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  // Render per request so a newly added API key is picked up. Only a boolean reaches the browser.
  await connection();
  return <Dashboard hasApiKey={Boolean(process.env.GOOGLE_PAGESPEED_API_KEY?.trim())} />;
}
