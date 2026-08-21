const https = require('https');

class YTrendsMcpClient {
  constructor(mcpUrl = 'https://mcp.trends.ytuong.ai/mcp') {
    this.mcpUrl = mcpUrl;
    this.sessionId = null;
    this.sessionExpiry = null;
  }

  _request(payload, sessionId = null) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const apiToken = (process.env.YTRENDS_API_TOKEN || process.env.YTUONG_API_TOKEN || '').trim();
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'OmniSeller-Agent/1.0',
        'Content-Length': Buffer.byteLength(postData)
      };
      if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
        headers['X-API-Key'] = apiToken;
      }
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }

      const options = {
        hostname: 'mcp.trends.ytuong.ai',
        port: 443,
        path: '/mcp',
        method: 'POST',
        headers
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const newSessionId = res.headers['mcp-session-id'] || sessionId;
          resolve({ statusCode: res.statusCode, headers: res.headers, sessionId: newSessionId, body });
        });
      });

      req.on('error', (err) => reject(err));
      req.write(postData);
      req.end();
    });
  }

  _parseSse(sseBody) {
    const lines = sseBody.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          return JSON.parse(line.substring(6).trim());
        } catch (e) {}
      }
    }
    try {
      return JSON.parse(sseBody);
    } catch (e) {
      return null;
    }
  }

  async ensureSession() {
    if (this.sessionId && this.sessionExpiry && Date.now() < this.sessionExpiry) {
      return this.sessionId;
    }

    const initRes = await this._request({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'omni-seller-studio', version: '1.0.0' }
      }
    });

    if (initRes.sessionId) {
      this.sessionId = initRes.sessionId;
      this.sessionExpiry = Date.now() + 10 * 60 * 1000; // 10 min session cache
      return this.sessionId;
    }
    throw new Error('Failed to obtain Mcp-Session-Id from YTrends MCP Server');
  }

  async listTools() {
    const sessionId = await this.ensureSession();
    const res = await this._request({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    }, sessionId);

    const parsed = this._parseSse(res.body);
    return parsed?.result?.tools || [];
  }

  async callTool(toolName, args = {}) {
    const sessionId = await this.ensureSession();
    const res = await this._request({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    }, sessionId);

    const parsed = this._parseSse(res.body);
    if (parsed?.result?.isError) {
      const errText = parsed?.result?.content?.[0]?.text || 'MCP Tool execution error';
      throw new Error(errText);
    }

    const textPayload = parsed?.result?.content?.[0]?.text;
    if (textPayload) {
      try {
        return JSON.parse(textPayload);
      } catch (e) {
        return textPayload;
      }
    }
    return parsed?.result;
  }

  async exploreNiche(seed) {
    return this.callTool('ytrends_explore_niche', { seed });
  }

  async researchKeyword(keyword) {
    return this.callTool('ytrends_research_keyword', { keyword });
  }

  async findTrendingKeywords() {
    return this.callTool('ytrends_find_trending_keywords', {});
  }

  async findHiddenGems() {
    return this.callTool('ytrends_find_hidden_gems', {});
  }
}

module.exports = new YTrendsMcpClient();
