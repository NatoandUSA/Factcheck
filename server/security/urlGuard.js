const dns = require('dns').promises;
const net = require('net');

// Only the marketplace hosts the Learning Box is actually meant to read.
// Exact-match on the registrable domain (or its www subdomain) — not a
// substring/suffix check — so `evil.com/amazon.com` or
// `amazon.com.attacker.com` cannot pass. Hosts are grouped by marketplace
// (rather than one flat set) so a fetch can be pinned to the caller's
// authenticated session marketplace and reject cross-marketplace hosts,
// including on redirect hops (GPT PR-5 final review, P0-FINAL-1).
const AMAZON_HOSTS = new Set([
  'amazon.com', 'www.amazon.com',
  // Approved short-link host. Each redirect hop remains marketplace-pinned
  // and is revalidated by safeFetch before it is followed.
  'a.co',
  // Existing Amazon regional storefronts remain supported. They are part of
  // the original marketplace trust boundary, not newly approved short links.
  'amazon.co.uk', 'www.amazon.co.uk',
  'amazon.de', 'www.amazon.de',
  'amazon.fr', 'www.amazon.fr',
  'amazon.it', 'www.amazon.it',
  'amazon.es', 'www.amazon.es',
  'amazon.ca', 'www.amazon.ca',
  'amazon.co.jp', 'www.amazon.co.jp',
  'amazon.in', 'www.amazon.in',
  'amazon.com.au', 'www.amazon.com.au',
  'amazon.com.mx', 'www.amazon.com.mx',
  'amazon.com.br', 'www.amazon.com.br',
  'amazon.nl', 'www.amazon.nl',
  'amazon.se', 'www.amazon.se',
  'amazon.pl', 'www.amazon.pl',
  'amazon.ae', 'www.amazon.ae',
  'amazon.sa', 'www.amazon.sa',
  'amazon.sg', 'www.amazon.sg',
  'amazon.eg', 'www.amazon.eg',
  'amazon.com.tr', 'www.amazon.com.tr'
]);
const ETSY_HOSTS = new Set(['etsy.com', 'www.etsy.com']);
const ALLOWED_HOSTS = new Set([...AMAZON_HOSTS, ...ETSY_HOSTS]);

function hostMarketplace(hostname) {
  const h = hostname.toLowerCase();
  if (AMAZON_HOSTS.has(h)) return 'AMAZON';
  if (ETSY_HOSTS.has(h)) return 'ETSY';
  return null;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

class UrlGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UrlGuardError';
    this.code = 'URL_NOT_ALLOWED';
  }
}

function ipv4ToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateOrReservedIpv4(ip) {
  const long = ipv4ToLong(ip);
  const inRange = (base, bits) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (ipv4ToLong(base) & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||       // "this" network
    inRange('10.0.0.0', 8) ||      // RFC1918
    inRange('100.64.0.0', 10) ||   // CGNAT
    inRange('127.0.0.0', 8) ||     // loopback
    inRange('169.254.0.0', 16) ||  // link-local / cloud metadata (169.254.169.254)
    inRange('172.16.0.0', 12) ||   // RFC1918
    inRange('192.0.0.0', 24) ||    // IETF protocol assignments
    inRange('192.0.2.0', 24) ||    // TEST-NET-1
    inRange('192.168.0.0', 16) ||  // RFC1918
    inRange('198.18.0.0', 15) ||   // benchmark
    inRange('198.51.100.0', 24) || // TEST-NET-2
    inRange('203.0.113.0', 24) ||  // TEST-NET-3
    long >= ipv4ToLong('224.0.0.0') // multicast + reserved (224.0.0.0/4 and up)
  );
}

function isPrivateOrReservedIpv6(ip) {
  const norm = ip.toLowerCase();
  if (norm === '::1') return true;               // loopback
  if (norm === '::') return true;                 // unspecified
  if (norm.startsWith('::ffff:')) {                // IPv4-mapped — validate the embedded IPv4
    const embedded = norm.slice(7);
    if (net.isIPv4(embedded)) return isPrivateOrReservedIpv4(embedded);
    // Support hex-form IPv4-mapped IPv6 e.g. ::ffff:7f00:1 or ::ffff:a9fe:a9fe
    const hexParts = embedded.split(':');
    if (hexParts.length === 2 && hexParts.every(p => /^[0-9a-f]{1,4}$/i.test(p))) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      const octets = [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
      return isPrivateOrReservedIpv4(octets.join('.'));
    }
  }
  if (norm.startsWith('fe80:') || norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) return true; // link-local fe80::/10
  if (norm.startsWith('fec0:') || norm.startsWith('fec') || norm.startsWith('fed') || norm.startsWith('fee') || norm.startsWith('fef')) return true; // site-local deprecated fec0::/10
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique local fc00::/7
  if (norm.startsWith('ff')) return true;          // multicast
  return false;
}

function isDisallowedIp(ip) {
  if (net.isIPv4(ip)) return isPrivateOrReservedIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIpv6(ip);
  return true; // unrecognized format — fail closed
}

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

async function assertResolvesToPublicIp(hostname) {
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  if (!addresses || addresses.length === 0) {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  for (const { address } of addresses) {
    if (isDisallowedIp(address)) {
      throw new UrlGuardError('URL_NOT_ALLOWED');
    }
  }
}

/**
 * expectedMarketplace, when passed, pins the URL (and every redirect hop,
 * via safeFetch below) to that marketplace's host set — an AMAZON session
 * cannot be pointed at an Etsy host and vice versa, even though both are
 * on the combined allowlist. Omit it for marketplace-agnostic checks.
 */
async function assertSafeUrl(rawUrl, expectedMarketplace) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  if (parsed.protocol !== 'https:') {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  const hostMkt = hostMarketplace(parsed.hostname);
  if (!hostMkt) {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  if (expectedMarketplace && hostMkt !== expectedMarketplace) {
    throw new UrlGuardError('URL_NOT_ALLOWED');
  }
  await assertResolvesToPublicIp(parsed.hostname);
  return parsed;
}

/**
 * Fetches a URL only after confirming it targets an allowlisted marketplace
 * host resolving to a public IP. Manually follows redirects (re-validating
 * every hop against the same rules), enforces a timeout and a streamed
 * response-size cap, and never leaks internal fetch error detail to callers.
 *
 * expectedMarketplace, when passed, pins every hop (initial URL and every
 * redirect) to that marketplace's hosts — a redirect from an Amazon host
 * to an Etsy host (or vice versa) is rejected just like an initial
 * cross-marketplace URL would be.
 *
 * fetchImpl defaults to the global fetch; tests inject a stub to exercise
 * redirect/cap behavior deterministically without live network calls.
 */
async function safeFetch(rawUrl, expectedMarketplace, fetchImpl = fetch) {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(currentUrl, expectedMarketplace);

    const response = await fetchImpl(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new UrlGuardError('URL_NOT_ALLOWED');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        throw new UrlGuardError('URL_NOT_ALLOWED');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  }
  throw new UrlGuardError('URL_NOT_ALLOWED');
}

module.exports = { assertSafeUrl, safeFetch, UrlGuardError, isDisallowedIp, isAllowedHost };
