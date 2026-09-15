'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const clientModule = require('../server/ytuongMcpClient');
const { normalizeYtrendsSupplement, validateBrowserYtrendsPayload, YTRENDS_PHRASES_PER_PULL } = require('../server/etsyResearchWorkflow');
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

  const sparseClient = new FakeClient([
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }), response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({ data: {} }) }] } }),
    response({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: JSON.stringify({ data: { related_keywords: [], top_listings: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 5, result: { content: [{ type: 'text', text: JSON.stringify({ data: { tags: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 6, result: { content: [{ type: 'text', text: JSON.stringify({ data: { results: [] } }) }] } }),
    response({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { adjacent_tags: [{ tag: 'daughter necklace' }] }
    }) }] } })
  ]);
  const fallbackResult = await sparseClient.pullKeywordEcosystem('para mi hija', ['daughter necklace']);
  assert.equal(fallbackResult._omniRequestedSeed, 'para mi hija');
  assert.equal(fallbackResult._omniSeedUsed, 'daughter necklace');
  assert.ok(fallbackResult._omniTools.includes('pattern-derived-seed-fallback'));

  const fetchQueue = [
    response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }),
    response(null, null, 202),
    response({ jsonrpc: '2.0', id: 2, result: { tools: toolNames.map(name => ({ name })) } }),
    response({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: JSON.stringify({
      data: { adjacent_tags: [{ tag: 'gift for daughter' }] }
    }) }] } })
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
    const bounded = normalizeYtrendsSupplement({ data: { adjacent_tags: Array.from({ length: 14 }, (_, index) => `keyword ${index + 1}`) } }, 'daughter necklace');
    assert.equal(YTRENDS_PHRASES_PER_PULL, 10);
    assert.equal(bounded.pullLimit, 10, 'artifact must disclose the provider pull limit');
    assert.equal(bounded.availablePhraseCount, 14, 'artifact must retain transparent pre-limit accounting');
    assert.equal(bounded.phrases.length, 10, 'one YTrends supplement must accept at most 10 phrases');
  } finally { global.fetch = originalFetch; }
  console.log('🟢 YTrends stateless transport and bounded browser fallback contract passed.');
})().catch(error => { console.error(error); process.exit(1); });
