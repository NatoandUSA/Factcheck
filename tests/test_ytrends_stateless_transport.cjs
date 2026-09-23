'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const clientModule = require('../server/ytuongMcpClient');
const { normalizeYtrendsSupplement, validateBrowserYtrendsPayload, YTRENDS_MAX_PHRASES_PER_SNAPSHOT } = require('../server/etsyResearchWorkflow');
const { YTrendsMcpClient } = clientModule;

const sse = payload => `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
const response = (payload, sessionId = null, statusCode = 200) => ({
  statusCode, headers: {}, sessionId, body: payload == null ? '' : sse(payload)
});

class FakeClient extends YTrendsMcpClient {
  constructor(responses) {
    super('https://example.invalid/mcp');
    this.responses = responses.slice();
    this.requests = [];
  }
  async _request(payload, sessionId = null) {
    this.requests.push({ payload, sessionId });
    const next = this.responses.shift();
    if (!next) throw new Error('UNEXPECTED_REQUEST');
    return next;
  }
}

(async () => {
  const expectedReadOnlyTools = [
    'ytrends_explore_niche',
    'ytrends_research_keyword',
    'ytrends_find_trending_keywords',
    'ytrends_search',
    'ytrends_find_hidden_gems',
    'ytrends_scout_opportunities'
  ];
  assert.deepEqual([...clientModule.READ_ONLY_TOOLS].sort(), expectedReadOnlyTools.sort(),
    'generic YTrends calls must be closed to the explicit read-only research allowlist');

  const blockedClient = new FakeClient([]);
  await assert.rejects(
    () => blockedClient.callTool('ytrends_delete_or_mutate_shop', { destructive: true }),
    error => error?.code === 'YTRENDS_TOOL_NOT_ALLOWED'
  );
  assert.equal(blockedClient.requests.length, 0,
    'blocked tools must fail before session initialization or any provider network request');

  const serverSource = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.match(serverSource, /tools\.filter\(tool => ytrendsMcp\.isReadOnlyTool\(tool\?\.name\)\)/,
    'tool-list route must hide provider tools outside OmniSeller read-only allowlist');
  assert.match(serverSource, /status\(403\)\.json\(\{ success: false, error: 'YTRENDS_TOOL_NOT_ALLOWED' \}\)/,
    'generic MCP route must reject non-allowlisted tools with 403');
  const literalServerCalls = [...serverSource.matchAll(/ytrendsMcp\.callTool\(\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1]);
  assert.ok(literalServerCalls.every(name => clientModule.READ_ONLY_TOOLS.includes(name)),
    'every server-side literal YTrends callTool() must remain inside READ_ONLY_TOOLS');
  assert.ok(!serverSource.includes("ytrends_find_hot_listings"),
    'server runtime must not retain the removed hot-listings caller');
  assert.match(serverSource, /mcpData = await ytrendsMcp\.pullKeywordEcosystem\(cleanSeed\)/,
    '/api/mcp/pull-etsy must reuse the canonical six-tool ecosystem');
  assert.match(serverSource, /topListings\.forEach\(listing => \{/,
    'pull-etsy must recover provider-observed listing tags from canonical ecosystem top listings');

  const toolNames = ['ytrends_explore_niche', 'ytrends_research_keyword', 'ytrends_find_trending_keywords', 'ytrends_search'];
  const client = new FakeClient([
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'ytrends' } } }),
    response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { adjacent_tags: [{ tag: 'daughter necklace' }] }
    }) }] } })
  ]);
  const value = await client.exploreNiche('daughter necklace');
  assert.equal(client.sessionId, null, 'stateless server must not require an Mcp-Session-Id');
  assert.equal(client.lastDiagnostic.transportMode, 'STATELESS');
  assert.equal(value.data.adjacent_tags[0].tag, 'daughter necklace');
  assert.ok(client.requests.every(item => item.sessionId === null), 'stateless requests must omit the session header');
  assert.equal(client.requests[1].payload.method, 'notifications/initialized');

  const canonicalFallbackClient = new FakeClient([
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }), response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({ data: {} }) }] } }),
    response({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { related_keywords: [], top_listings: [{
        listing_id: '12345', title: 'Observed listing', tags: ['daughter gift', 'gift for her']
      }] }
    }) }] } }),
    response({ jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: JSON.stringify({ data: { tags: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 6, result: { content: [{ type: 'text', text: JSON.stringify({ data: { results: [] } }) }] } })
  ]);
  const canonicalFallback = await canonicalFallbackClient.pullKeywordEcosystem('daughter gift');
  assert.equal(canonicalFallback.data.top_listings.length, 1,
    'allowed canonical fallback must retain usable provider top-listing evidence when explore_niche is sparse');
  assert.deepEqual(canonicalFallback.data.top_listings[0].tags, ['daughter gift', 'gift for her']);
  assert.ok(canonicalFallbackClient.requests
    .filter(item => item.payload?.method === 'tools/call')
    .every(item => clientModule.READ_ONLY_TOOLS.includes(item.payload.params.name)),
    'canonical fallback must only invoke allowlisted read-only tools');

  const sparseClient = new FakeClient([
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }), response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({ data: {} }) }] } }),
    response({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { adjacent_tags: [{ tag: 'daughter necklace' }] }
    }) }] } }),
    response({ jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: JSON.stringify({ data: { related_keywords: [{ tag: 'daughter gift' }], top_listings: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 6, result: { content: [{ type: 'text', text: JSON.stringify({ data: { tags: [{ tag: 'gift for daughter' }] } }) }] } }),
    response({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: JSON.stringify({ data: { results: [{ kind: 'keyword', name: 'daughter jewelry' }] } }) }] } })
  ]);
  const fallbackResult = await sparseClient.pullKeywordEcosystem('para mi hija', ['daughter necklace']);
  assert.equal(fallbackResult._omniRequestedSeed, 'para mi hija');
  assert.equal(fallbackResult._omniSeedUsed, 'daughter necklace');
  assert.ok(fallbackResult.data.related_keywords.length > 0, 'fallback seed must still receive detailed multi-tool research');
  assert.ok(fallbackResult.data.discovery_keywords.length > 1, 'multiple YTrends tools must contribute comparison phrases');

  const fetchQueue = [
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }),
    response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { adjacent_tags: [{ tag: 'gift for daughter' }] }
    }) }] } }),
    response({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: JSON.stringify({ data: { related_keywords: [{ tag: 'daughter necklace gift' }], top_listings: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: JSON.stringify({ data: { tags: [{ tag: 'mom daughter gift' }] } }) }] } }),
    response({ jsonrpc: '2.0', id: 6, result: { content: [{ type: 'text', text: JSON.stringify({ data: { results: [{ kind: 'keyword', name: 'daughter keepsake' }] } }) }] } })
  ];
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const next = fetchQueue.shift();
    if (!next) throw new Error('UNEXPECTED_BROWSER_REQUEST');
    return new Response(next.body, { status: next.statusCode, headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const browser = await import(pathToFileURL(path.resolve(__dirname, '../src/ytrendsBrowserClient.js')).href);
    const browserResult = await browser.pullYtrendsFromBrowser('daughter necklace');
    assert.equal(browserResult._omniTransport, 'BROWSER_DIRECT');
    const validated = validateBrowserYtrendsPayload(browserResult);
    const supplement = normalizeYtrendsSupplement(validated, 'daughter necklace');
    assert.equal(supplement.evidenceTier, 'E3_SUPPLEMENTAL_INDEX');
    assert.equal(supplement.transport, 'BROWSER_DIRECT');
    assert.equal(supplement.serverVerifiedTransport, false);
    assert.equal(supplement.providerSeed, 'daughter necklace');
    assert.equal(supplement.phrases[0].phrase, 'gift for daughter');
    assert.ok(supplement.phrases.length >= 4, 'browser fallback must aggregate multiple YTrends tools rather than stop at 10 explore results');
    const bounded = normalizeYtrendsSupplement({ data: { adjacent_tags: Array.from({ length: 275 }, (_, index) => `keyword ${index + 1}`) } }, 'daughter necklace');
    assert.equal(YTRENDS_MAX_PHRASES_PER_SNAPSHOT, 250);
    assert.equal(bounded.snapshotSafetyLimit, 250, 'artifact must disclose its storage safety bound');
    assert.equal(bounded.candidatePhraseCount, 275, 'artifact must retain transparent pre-bound accounting');
    assert.equal(bounded.phrases.length, 250, 'a snapshot must remain bounded without imposing a ten-keyword business cap');
  } finally { global.fetch = originalFetch; }
  console.log('🟢 YTrends stateless multi-tool transport and bounded browser fallback contract passed.');
})().catch(error => { console.error(error); process.exit(1); });
