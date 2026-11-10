import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateHost } from '@haul/recipe-parser';

/**
 * Resolve the host and refuse private, loopback, link-local and CGNAT addresses.
 * Blocks "public name -> 169.254.169.254" style SSRF that a hostname check misses.
 * There's still a small TOCTOU window between this lookup and fetch's own; for
 * production, run fetches through an egress proxy that enforces the same rule.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('Credentials in URL are not allowed');
  if (u.port && !['80', '443', ''].includes(u.port)) throw new Error('Port not allowed');
  if (isPrivateHost(u.hostname)) throw new Error('Host not allowed');
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  for (const a of addrs) if (isPrivateHost(a.address)) throw new Error('Host resolves to a private address');
  return u;
}
