'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_URL = 'https://mcp.trends.ytuong.ai/mcp';
const PROTOCOL_VERSION = '2025-06-18';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUIRED_TOOLS = new Set(['ytrends_explore_niche', 'ytrends_research_keyword', 'ytrends_find_trending_keywords', 'ytrends_search']);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class YTrendsMcpError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'YTrendsMcpError';
    this.code = code;
    this.details = details;
  }
}

class YTrendsMcpClient {
  constructor(mcpUrl = process.env.YTRENDS_MCP_URL || DEFAULT_URL) {
    this.mcpUrl = mcpUrl;
    this.sessionId = null;
    this.initializedUntil = 0;
    this.initializing = null;
    this.toolNames = null;
    this.nextRequestAt = 0;
    this.lastDiagnostic = null;
  }

  _safeDiagnostic(method, response = {}, extra = {}) {
    this.lastDiagnostic = { at: new Date().toISOString(), method, statusCode: response.statusCode || null,
      transportMode: response.sessionId ? 'SESSION' : 'STATELESS', ...extra };
  }

  async _reserveRequestSlot() {
    const now = Date.now();
    const startAt = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = startAt + 1000;
    if (startAt > now) await delay(startAt - now);
  }

  _requestOnce(payload, sessionId = null) {
    return new Promise((resolve, reject) => {
      const endpoint = new URL(this.mcpUrl);
      const postData = JSON.stringify(payload);
      const apiToken = (process.env.YTRENDS_API_TOKEN || process.env.YTUONG_API_TOKEN || '').trim();
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'User-Agent': 'OmniSeller-Agent/1.1', 'MCP-Protocol-Version': PROTOCOL_VERSION,
        'Content-Length': Buffer.byteLength(postData) };
      if (apiToken) { headers.Authorization = `Bearer ${apiToken}`; headers['X-API-Key'] = apiToken; }
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      const transport = endpoint.protocol === 'http:' ? http : https;
      const req = transport.request({ protocol: endpoint.protocol, hostname: endpoint.hostname,
        port: endpoint.port || undefined, path: `${endpoint.pathname}${endpoint.search}`, method: 'POST', headers }, res => {
        let body = ''; let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) return req.destroy(new YTrendsMcpError('YTRENDS_RESPONSE_TOO_LARGE', 'YTrends response exceeded 5 MiB'));
          body += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers,
          sessionId: res.headers['mcp-session-id'] || sessionId || null, body }));
      });
      req.setTimeout(15000, () => req.destroy(new YTrendsMcpError('YTRENDS_TIMEOUT', 'YTrends request timed out after 15 seconds')));
      req.on('error', reject);
      req.end(postData);
    });
  }

  async _request(payload, sessionId = null) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this._reserveRequestSlot();
      try {
        const response = await this._requestOnce(payload, sessionId);
        if (response.statusCode !== 429 && response.statusCode < 500) return response;
        lastError = new YTrendsMcpError('YTRENDS_HTTP_RETRYABLE', `YTrends returned HTTP ${response.statusCode}`,
          { statusCode: response.statusCode, attempt });
      } catch (error) { lastError = error; }
      if (attempt < 3) await delay(1000 * (2 ** attempt));
    }
    throw lastError || new YTrendsMcpError('YTRENDS_NETWORK_ERROR', 'YTrends request failed');
  }

  _parseSse(body) {
    let parsed = null;
    for (const line of String(body || '').split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try { parsed = JSON.parse(line.slice(5).trim()); } catch (_) {}
    }
    if (parsed) return parsed;
    try { return JSON.parse(body); } catch (_) { return null; }
  }

  _assertResponse(response, method) {
    const parsed = this._parseSse(response.body);
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new YTrendsMcpError('YTRENDS_UNAUTHORIZED', `YTrends refused ${method} with HTTP ${response.statusCode}`,
        { statusCode: response.statusCode, method });
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new YTrendsMcpError('YTRENDS_HTTP_ERROR', `YTrends returned HTTP ${response.statusCode} for ${method}`,
        { statusCode: response.statusCode, method });
    }
    if (!parsed) throw new YTrendsMcpError('YTRENDS_INVALID_RESPONSE', `YTrends returned an unreadable ${method} response`, { method });
    if (parsed.error) throw new YTrendsMcpError('YTRENDS_JSONRPC_ERROR', `${method}: ${JSON.stringify(parsed.error).slice(0, 300)}`,
      { method, rpcCode: parsed.error.code || null });
    return parsed;
  }

  _resetSession() { this.sessionId = null; this.initializedUntil = 0; this.toolNames = null; }

  async ensureSession() {
    if (this.initializedUntil > Date.now() && this.toolNames) return this.sessionId;
    if (this.initializing) return this.initializing;
    this.initializing = this._initialize();
    try { return await this.initializing; } finally { this.initializing = null; }
  }

  async _initialize() {
    const initResponse = await this._request({ jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: {
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'omni-seller-studio', version: '1.1.0' }
    }});
    this._assertResponse(initResponse, 'initialize');
    this.sessionId = initResponse.sessionId || null;
    // Streamable HTTP permits stateless servers; Mcp-Session-Id is optional.
    await this._request({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, this.sessionId);
    const listResponse = await this._request({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }, this.sessionId);
    const parsed = this._assertResponse(listResponse, 'tools/list');
    const tools = Array.isArray(parsed?.result?.tools) ? parsed.result.tools : [];
    this.toolNames = new Set(tools.map(tool => tool?.name).filter(Boolean));
    const missingTools = [...REQUIRED_TOOLS].filter(name => !this.toolNames.has(name));
    if (missingTools.length) throw new YTrendsMcpError('YTRENDS_TOOL_CONTRACT_CHANGED', 'Required YTrends tools are missing', { missingTools });
    this.initializedUntil = Date.now() + 10 * 60 * 1000;
    this._safeDiagnostic('initialize', initResponse, { toolCount: tools.length });
    return this.sessionId;
  }

  async listTools() {
    await this.ensureSession();
    const response = await this._request({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }, this.sessionId);
    const parsed = this._assertResponse(response, 'tools/list');
    const tools = parsed?.result?.tools || [];
    this._safeDiagnostic('tools/list', response, { toolCount: tools.length });
    return tools;
  }

  async callTool(toolName, args = {}, retriedSession = false) {
    await this.ensureSession();
    const response = await this._request({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name: toolName, arguments: args } }, this.sessionId);
    let parsed;
    try { parsed = this._assertResponse(response, `tools/call:${toolName}`); }
    catch (error) {
      if (!retriedSession && this.sessionId && /session/i.test(error.message)) {
        this._resetSession();
        return this.callTool(toolName, args, true);
      }
      throw error;
    }
    if (parsed?.result?.isError) {
      const errorText = parsed?.result?.content?.[0]?.text || 'MCP tool execution error';
      throw new YTrendsMcpError('YTRENDS_TOOL_ERROR', `${toolName}: ${String(errorText).slice(0, 300)}`, { toolName });
    }
    const textPayload = parsed?.result?.content?.[0]?.text;
    this._safeDiagnostic(`tools/call:${toolName}`, response);
    if (textPayload) { try { return JSON.parse(textPayload); } catch (_) { return textPayload; } }
    return parsed?.result;
  }

  async exploreNiche(seed) { return this.callTool('ytrends_explore_niche', { seed, response_format: 'concise' }); }

  async pullKeywordEcosystem(seed, alternateSeeds = []) {
    const explored = await this.exploreNiche(seed);
    const exploredData = explored?.data && typeof explored.data === 'object' ? explored.data : {};
    const hasPhrases = (Array.isArray(exploredData.adjacent_tags) && exploredData.adjacent_tags.length)
      || (Array.isArray(exploredData.related_keywords) && exploredData.related_keywords.length)
      || (Array.isArray(exploredData.top_listings) && exploredData.top_listings.some(row => Array.isArray(row?.tags) && row.tags.length));
    if (hasPhrases) return { ...explored, _omniTransport: 'SERVER_DIRECT', _omniRequestedSeed: seed,
      _omniSeedUsed: seed, _omniTools: ['ytrends_explore_niche'] };
    const [researched, trending, searched] = await Promise.all([
      this.callTool('ytrends_research_keyword', { keyword: seed, response_format: 'concise' }),
      this.callTool('ytrends_find_trending_keywords', { search: seed, limit: 25, response_format: 'concise' }),
      this.callTool('ytrends_search', { query: seed, limit: 25 })
    ]);
    const researchData = researched?.data && typeof researched.data === 'object' ? researched.data : {};
    const trendingRows = Array.isArray(trending?.data?.tags) ? trending.data.tags : [];
    const searchRows = Array.isArray(searched?.data?.results) ? searched.data.results : [];
    const searchKeywords = searchRows.filter(row => row?.kind === 'keyword' || row?.type === 'keyword')
      .map(row => row.keyword || row.tag || row.name).filter(Boolean);
    const combined = { data: { overview: exploredData.overview || researchData.stats || null,
      adjacent_tags: [...(exploredData.adjacent_tags || []), ...trendingRows, ...searchKeywords],
      related_keywords: researchData.related_keywords || [], top_listings: researchData.top_listings || [] },
    _omniTransport: 'SERVER_DIRECT', _omniRequestedSeed: seed, _omniSeedUsed: seed,
    _omniTools: ['ytrends_explore_niche', 'ytrends_research_keyword', 'ytrends_find_trending_keywords', 'ytrends_search'] };
    const combinedHasPhrases = combined.data.adjacent_tags.length || combined.data.related_keywords.length
      || combined.data.top_listings.some(row => Array.isArray(row?.tags) && row.tags.length);
    if (combinedHasPhrases) return combined;
    const candidates = [...new Set((alternateSeeds || []).map(value => String(value || '').trim())
      .filter(value => value && value !== seed))].slice(0, 2);
    for (const candidate of candidates) {
      const alternative = await this.exploreNiche(candidate);
      const data = alternative?.data && typeof alternative.data === 'object' ? alternative.data : {};
      const useful = (data.adjacent_tags || []).length || (data.related_keywords || []).length
        || (data.top_listings || []).some(row => Array.isArray(row?.tags) && row.tags.length);
      if (useful) return { ...alternative, _omniTransport: 'SERVER_DIRECT', _omniRequestedSeed: seed,
        _omniSeedUsed: candidate, _omniTools: ['ytrends_explore_niche', 'pattern-derived-seed-fallback'] };
    }
    return combined;
  }

  async researchKeyword(keyword) { return this.callTool('ytrends_research_keyword', { keyword }); }
  async findTrendingKeywords() { return this.callTool('ytrends_find_trending_keywords', {}); }
  async findHiddenGems() { return this.callTool('ytrends_find_hidden_gems', {}); }
}

const client = new YTrendsMcpClient();
client.YTrendsMcpClient = YTrendsMcpClient;
client.YTrendsMcpError = YTrendsMcpError;
client.PROTOCOL_VERSION = PROTOCOL_VERSION;
module.exports = client;
