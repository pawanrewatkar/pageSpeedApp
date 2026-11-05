// URL helpers shared by browser and server (no Node APIs here).

/** Returns a normalized http(s) URL, or null if the input is not a usable public website URL. */
export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value || /\s/.test(value)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  // Require a real domain (has a dot) or a public IP literal.
  if (!u.hostname.includes('.') && !u.hostname.includes(':')) return null;
  u.hash = '';
  return u.href;
}

export function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);

  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF / TEST-NET-1 (not all of 192.0.x.x)
      (a === 198 && b === 51 && c === 100) || // TEST-NET-2
      (a === 203 && b === 0 && c === 113) || // TEST-NET-3
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (addr.includes(':')) {
    return (
      addr === '::' || addr === '::1' ||
      /^f[cd]/.test(addr) || // unique local fc00::/7
      /^fe[89ab]/.test(addr) || // link-local fe80::/10
      addr.startsWith('ff') // multicast
    );
  }
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return isPrivateIp(h);
}

/** Hostname without "www." for same-site comparisons. */
export function baseDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}
