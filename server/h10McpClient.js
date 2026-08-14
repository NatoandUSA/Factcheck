const https = require('https');

class Helium10McpClient {
  constructor(mcpUrl = 'https://mcp.helium10.com/mcp') {
    this.mcpUrl = mcpUrl;
    this.sessionId = null;
    this.sessionExpiry = null;
    this.authServer = 'https://h10api.pacvue.com/authhub/api/scenarios/mcp';
  }

  _request(payload, token = null, sessionId = null) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'OmniSeller-Agent/1.0',
        'Content-Length': Buffer.byteLength(postData)
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }

      const options = {
        hostname: 'mcp.helium10.com',
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

  async checkConnection(token = null) {
    const authToken = token || process.env.HELIUM10_MCP_TOKEN || process.env.H10_OAUTH_TOKEN;
    if (!authToken) {
      return {
        status: 401,
        authenticated: false,
        message: 'Helium 10 MCP Server requires an OAuth Bearer Token. Please configure HELIUM10_MCP_TOKEN in .env or provide token.',
        authServer: this.authServer,
        scopes: ['mcp:tools']
      };
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
    }, authToken);

    if (initRes.statusCode === 200) {
      this.sessionId = initRes.sessionId;
      return {
        status: 200,
        authenticated: true,
        sessionId: this.sessionId,
        serverInfo: this._parseSse(initRes.body)?.result?.serverInfo || { name: 'Helium 10 MCP' }
      };
    }

    return {
      status: initRes.statusCode,
      authenticated: false,
      message: `Helium 10 MCP Server returned HTTP ${initRes.statusCode}`,
      body: initRes.body
    };
  }

  async listTools(token = null) {
    const conn = await this.checkConnection(token);
    if (!conn.authenticated) {
      throw new Error(conn.message);
    }

    const authToken = token || process.env.HELIUM10_MCP_TOKEN || process.env.H10_OAUTH_TOKEN;
    const res = await this._request({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    }, authToken, conn.sessionId);

    const parsed = this._parseSse(res.body);
    return parsed?.result?.tools || [];
  }
}

module.exports = new Helium10McpClient();
