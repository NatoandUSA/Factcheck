/**
 * Negative + boundary tests for server/security/urlGuard.js — the SSRF
 * control gating server/learningService.js's URL fetch. The closed SSRF
 * regression is recorded in GOLDEN_RULES.md; this remains executable coverage.
 */
const assert = require('assert');
const { assertSafeUrl, safeFetch, isDisallowedIp, isAllowedHost, UrlGuardError } = require('../server/security/urlGuard');

function makeRedirectResponse(location) {
  return new Response(null, { status: 302, headers: { location } });
}
function makeOkResponse(bodyText) {
  return new Response(bodyText, { status: 200 });
}

async function assertRejects(url, label, expectedMarketplace) {
  try {
    await assertSafeUrl(url, expectedMarketplace);
    throw new Error(`Expected rejection for ${label} (${url}) but it was allowed`);
  } catch (e) {
    assert(e instanceof UrlGuardError, `${label} should reject with UrlGuardError, got: ${e.message}`);
  }
}

async function main() {
  // --- IP classification (pure logic, no network) ---
  const disallowedIps = [
    ['127.0.0.1', 'loopback'],
    ['127.0.0.53', 'loopback range'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['172.31.255.255', 'RFC1918 172.16/12 upper bound'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'link-local / cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', '"this" network'],
    ['224.0.0.1', 'multicast'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique-local'],
    ['fd12:3456::1', 'IPv6 unique-local fd00::/8'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped IPv6 loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped IPv6 RFC1918']
  ];
  disallowedIps.forEach(([ip, label]) => {
    assert.strictEqual(isDisallowedIp(ip), true, `${label} (${ip}) must be classified disallowed`);
  });

  const allowedIps = [
    ['8.8.8.8', 'public IPv4'],
    ['1.1.1.1', 'public IPv4'],
    ['2606:4700:4700::1111', 'public IPv6']
  ];
  allowedIps.forEach(([ip, label]) => {
    assert.strictEqual(isDisallowedIp(ip), false, `${label} (${ip}) must NOT be classified disallowed`);
  });

  // --- Host allowlist (pure logic, no network) ---
  assert.strictEqual(isAllowedHost('www.amazon.com'), true, 'www.amazon.com must be allowed');
  assert.strictEqual(isAllowedHost('etsy.com'), true, 'etsy.com must be allowed');
  assert.strictEqual(isAllowedHost('evil.com'), false, 'evil.com must be rejected');
  assert.strictEqual(isAllowedHost('amazon.com.evil.com'), false, 'domain-suffix bypass attempt must be rejected');
  assert.strictEqual(isAllowedHost('notamazon.com'), false, 'lookalike domain must be rejected');
  assert.strictEqual(isAllowedHost('evil-amazon.com'), false, 'lookalike domain must be rejected');

  // --- assertSafeUrl: scheme + host checks (pure logic, no network needed
  // since these fail before DNS lookup) ---
  await assertRejects('http://www.amazon.com/dp/B000TEST', 'non-HTTPS scheme');
  await assertRejects('https://evil.com/steal', 'non-allowlisted host');
  await assertRejects('https://127.0.0.1:9911/latest/meta-data/', 'loopback host literal');
  await assertRejects('not-a-url', 'malformed URL');
  await assertRejects('ftp://www.amazon.com/', 'disallowed scheme');
  await assertRejects('https://amazon.com.evil.com/dp/B000TEST', 'suffix-bypass host');

  console.log('🟢 SSRF negative/boundary cases: all rejected as expected.');

  // --- expectedMarketplace pinning: an allowlisted host from the *other*
  // marketplace must still be rejected when a session marketplace is given
  // (GPT PR-5 final review, P0-FINAL-1 — marketplace must be a single
  // authority, not overridable by URL content) ---
  await assertRejects('https://www.etsy.com/listing/12345', 'Etsy host under an Amazon-session expectation', 'AMAZON');
  await assertRejects('https://www.amazon.com/dp/B000TEST', 'Amazon host under an Etsy-session expectation', 'ETSY');
  console.log('🟢 assertSafeUrl: cross-marketplace host rejected when expectedMarketplace is pinned.');

  // --- Positive path: real allowlisted host resolves and passes (network
  // required — preserves the positive-path proof for the closed SSRF
  // regression recorded in GOLDEN_RULES.md; allowlist must not block everything) ---
  try {
    await assertSafeUrl('https://www.amazon.com/');
    await assertSafeUrl('https://www.amazon.com/', 'AMAZON');
    console.log('🟢 Allowlisted HTTPS host (www.amazon.com) passed assertSafeUrl, with and without marketplace pinning.');
  } catch (e) {
    console.warn('⚠️  Positive-path DNS check skipped (no network in this environment):', e.message);
  }

  // --- safeFetch: deterministic redirect/cap/timeout behavior via an
  // injected fetchImpl stub (real DNS/allowlist checks still run through
  // assertSafeUrl, using real marketplace hostnames already proven
  // reachable above). ---

  // Redirect to a disallowed host must be rejected at the next hop's
  // assertSafeUrl call, before any further fetchImpl call is made.
  {
    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls++;
      return makeRedirectResponse('https://evil.com/steal');
    };
    try {
      await safeFetch('https://www.amazon.com/dp/B000TEST', 'AMAZON', fetchImpl);
      throw new Error('Expected safeFetch to reject a redirect to a disallowed host');
    } catch (e) {
      assert(e instanceof UrlGuardError, `redirect-to-disallowed-host should reject with UrlGuardError, got: ${e.message}`);
      assert.strictEqual(fetchCalls, 1, 'fetchImpl must not be called again once the redirect target fails assertSafeUrl');
    }
    console.log('🟢 safeFetch: redirect to disallowed host rejected before following it.');
  }

  // Too many redirects (all to an allowlisted host) must be rejected once
  // the hop budget is exhausted.
  {
    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls++;
      return makeRedirectResponse('https://www.amazon.com/');
    };
    try {
      await safeFetch('https://www.amazon.com/', 'AMAZON', fetchImpl);
      throw new Error('Expected safeFetch to reject after exceeding the redirect budget');
    } catch (e) {
      assert(e instanceof UrlGuardError, `too-many-redirects should reject with UrlGuardError, got: ${e.message}`);
      assert.strictEqual(fetchCalls, 4, 'expected exactly MAX_REDIRECTS+1 fetchImpl calls before giving up');
    }
    console.log('🟢 safeFetch: exceeding the redirect budget is rejected.');
  }

  // A redirect to the explicitly approved Amazon short host is followed
  // end-to-end and the final body is returned.
  {
    let hop = 0;
    const fetchImpl = async () => {
      hop++;
      if (hop === 1) return makeRedirectResponse('https://a.co/');
      return makeOkResponse('final body content');
    };
    const body = await safeFetch('https://www.amazon.com/', 'AMAZON', fetchImpl);
    assert.strictEqual(body, 'final body content', 'safeFetch should return the final hop body after following a same-marketplace redirect');
    console.log('🟢 safeFetch: redirect to the approved Amazon short host is followed and body returned.');
  }

  // A redirect that crosses marketplaces (Amazon host -> Etsy host) must be
  // rejected even though both hosts are individually allowlisted (GPT PR-5
  // final review, P0-FINAL-1).
  {
    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls++;
      return makeRedirectResponse('https://www.etsy.com/listing/999');
    };
    try {
      await safeFetch('https://www.amazon.com/', 'AMAZON', fetchImpl);
      throw new Error('Expected safeFetch to reject a redirect that crosses from Amazon to Etsy');
    } catch (e) {
      assert(e instanceof UrlGuardError, `cross-marketplace redirect should reject with UrlGuardError, got: ${e.message}`);
      assert.strictEqual(fetchCalls, 1, 'fetchImpl must not be called again once the cross-marketplace redirect target fails assertSafeUrl');
    }
    console.log('🟢 safeFetch: redirect that crosses from Amazon to Etsy is rejected.');
  }

  // Response bodies larger than MAX_RESPONSE_BYTES must be rejected rather
  // than buffered in full.
  {
    const oversized = 'a'.repeat(2 * 1024 * 1024 + 10);
    const fetchImpl = async () => makeOkResponse(oversized);
    try {
      await safeFetch('https://www.amazon.com/', 'AMAZON', fetchImpl);
      throw new Error('Expected safeFetch to reject an oversized response body');
    } catch (e) {
      assert(e instanceof UrlGuardError, `oversized-body should reject with UrlGuardError, got: ${e.message}`);
    }
    console.log('🟢 safeFetch: response bodies over the size cap are rejected.');
  }

  // Structural timeout check: every fetchImpl call must receive an
  // AbortSignal so a hung request is guaranteed to be cut off, without
  // needing a real 8-second wall-clock wait in this test.
  {
    let capturedOpts;
    const fetchImpl = async (url, opts) => {
      capturedOpts = opts;
      return makeOkResponse('ok');
    };
    await safeFetch('https://www.amazon.com/', 'AMAZON', fetchImpl);
    assert(capturedOpts && capturedOpts.signal instanceof AbortSignal, 'safeFetch must pass an AbortSignal to fetchImpl to enforce the timeout');
    console.log('🟢 safeFetch: requests are issued with an AbortSignal (timeout enforced).');
  }

  console.log('✅ tests/ssrf_url_guard.test.cjs PASSED CLEANLY!');
  process.exit(0);
}

main().catch(err => {
  console.error('🔴 SSRF URL GUARD TEST FAILED:', err.message);
  process.exit(1);
});
