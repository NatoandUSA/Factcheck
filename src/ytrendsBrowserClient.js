const MCP_URL = 'https://mcp.trends.ytuong.ai/mcp';
const PROTOCOL_VERSION = '2025-06-18';
const REQUIRED_TOOLS = ['ytrends_explore_niche', 'ytrends_research_keyword', 'ytrends_find_trending_keywords', 'ytrends_search'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const dataOf = value => value?.data && typeof value.data === 'object' ? value.data : {};
const hasKeywordPhrases = value => {
  const data = dataOf(value);
  return Boolean((data.adjacent_tags || []).length || (data.related_keywords || []).length
    || (data.top_listings || []).some(row => Array.isArray(row?.tags) && row.tags.length));
};
const sourcedRows = (rows, sourceField) => (Array.isArray(rows) ? rows : []).map(item =>
  typeof item === 'string' ? { tag: item, _omniSourceField: sourceField } : { ...item, _omniSourceField: sourceField });

function parseMcpBody(body) {
  let parsed = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try { parsed = JSON.parse(line.slice(5).trim()); } catch (_) {}
  }
  if (parsed) return parsed;
  try { return JSON.parse(body); } catch (_) { return null; }
}
async function postMcp(payload, sessionId = null) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION };
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      const response = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
      const body = await response.text();
      if (body.length > 5 * 1024 * 1024) throw new Error('YTRENDS_RESPONSE_TOO_LARGE');
      if (response.status !== 429 && response.status < 500) {
        return { status: response.status, sessionId: response.headers.get('Mcp-Session-Id') || sessionId || null, body };
      }
      lastError = new Error(`YTRENDS_HTTP_${response.status}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timer); }
    if (attempt < 3) await wait(1000 * (2 ** attempt));
  }
  throw lastError || new Error('YTRENDS_BROWSER_NETWORK_ERROR');
}

function assertMcp(response, method) {
  const parsed = parseMcpBody(response.body);
  if (response.status < 200 || response.status >= 300) throw new Error(`YTRENDS_${method}_HTTP_${response.status}`);
  if (!parsed && method !== 'notifications/initialized') throw new Error(`YTRENDS_${method}_INVALID_RESPONSE`);
  if (parsed?.error) throw new Error(`YTRENDS_${method}_${JSON.stringify(parsed.error).slice(0, 200)}`);
  return parsed;
}

async function createClient() {
  const initialized = await postMcp({ jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: {
    protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'omni-seller-browser-fallback', version: '1.0.0' }
  }});
  assertMcp(initialized, 'INITIALIZE');
  const sessionId = initialized.sessionId;
  const notification = await postMcp({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);
  if (notification.status < 200 || notification.status >= 300) throw new Error(`YTRENDS_INITIALIZED_HTTP_${notification.status}`);
  const listing = await postMcp({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }, sessionId);
  const tools = assertMcp(listing, 'TOOLS_LIST')?.result?.tools || [];
  const names = new Set(tools.map(tool => tool?.name));
  const missing = REQUIRED_TOOLS.filter(name => !names.has(name));
  if (missing.length) throw new Error(`YTRENDS_TOOL_CONTRACT_CHANGED:${missing.join(',')}`);
  const call = async (name, args) => {
    await wait(1000);
    const response = await postMcp({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name, arguments: args } }, sessionId);
    const parsed = assertMcp(response, `TOOL_${name}`);
    if (parsed?.result?.isError) throw new Error(`YTRENDS_TOOL_ERROR:${String(parsed.result.content?.[0]?.text || '').slice(0, 200)}`);
    const value = parsed?.result?.content?.[0]?.text;
    if (!value) return parsed?.result || {};
    try { return JSON.parse(value); } catch (_) { return value; }
  };
  call.toolNames = names;
  return call;
}

export async function pullYtrendsFromBrowser(seed, alternateSeeds = []) {
  const call = await createClient();
  let providerSeed = seed;
  let explored = await call('ytrends_explore_niche', { seed, depth: 'deep', response_format: 'detailed' });
  const candidates = [...new Set((alternateSeeds || []).map(value => String(value || '').trim())
    .filter(value => value && value !== seed))].slice(0, 2);
  if (!hasKeywordPhrases(explored)) {
    for (const candidate of candidates) {
      const alternative = await call('ytrends_explore_niche', { seed: candidate, depth: 'deep', response_format: 'detailed' });
      if (!hasKeywordPhrases(alternative)) continue;
      providerSeed = candidate; explored = alternative; break;
    }
  }
  const specs = [
    ['ytrends_research_keyword', { keyword: providerSeed, response_format: 'detailed' }],
    ['ytrends_find_trending_keywords', { search: providerSeed, limit: 50, response_format: 'detailed' }],
    ['ytrends_search', { query: providerSeed, limit: 30, kinds: ['keyword', 'listing'] }],
    ['ytrends_find_hidden_gems', { search: providerSeed, limit: 50, response_format: 'detailed' }],
    ['ytrends_scout_opportunities', { search: providerSeed, limit: 50, response_format: 'detailed' }]
  ].filter(([name]) => call.toolNames.has(name));
  const pulls = [{ tool: 'ytrends_explore_niche', status: 'SUCCESS' }]; const results = new Map();
  for (const [name, args] of specs) {
    try { results.set(name, await call(name, args)); pulls.push({ tool: name, status: 'SUCCESS' }); }
    catch (error) { pulls.push({ tool: name, status: 'FAILED', code: String(error?.message || 'YTRENDS_TOOL_ERROR').slice(0, 120) }); }
  }
  const exploredData = dataOf(explored); const researchData = dataOf(results.get('ytrends_research_keyword'));
  const trendingData = dataOf(results.get('ytrends_find_trending_keywords'));
  const searchData = dataOf(results.get('ytrends_search')); const gemsData = dataOf(results.get('ytrends_find_hidden_gems'));
  const scoutData = dataOf(results.get('ytrends_scout_opportunities'));
  const searchRows = (searchData.results || []).filter(row => !row?.kind || row.kind === 'keyword' || row.type === 'keyword');
  return { data: { overview: exploredData.overview || researchData.stats || null,
    adjacent_tags: exploredData.adjacent_tags || [], related_keywords: researchData.related_keywords || exploredData.related_keywords || [],
    top_listings: researchData.top_listings || exploredData.top_listings || [], discovery_keywords: [
      ...sourcedRows(trendingData.tags, 'trending.tags'), ...sourcedRows(searchRows, 'search.results'),
      ...sourcedRows(gemsData.tags, 'hidden_gems.tags'), ...sourcedRows(scoutData.results, 'opportunities.results')
    ] }, _omniTransport: 'BROWSER_DIRECT', _omniRequestedSeed: seed, _omniSeedUsed: providerSeed,
    _omniTools: pulls.filter(item => item.status === 'SUCCESS').map(item => item.tool), _omniPulls: pulls };
}
