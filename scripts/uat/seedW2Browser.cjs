'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const apiOrigin = String(process.env.OMNI_UAT_ORIGIN || 'http://127.0.0.1:4318').replace(/\/$/, '');
const browserOrigin = String(process.env.OMNI_UAT_BROWSER_ORIGIN || 'http://127.0.0.1:4317').replace(/\/$/, '');
if (![apiOrigin, browserOrigin].every(value => /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(value))) {
  throw new Error('LOCAL_UAT_ORIGIN_REQUIRED');
}
const email = process.env.OMNI_UAT_EMAIL;
const password = process.env.OMNI_UAT_PASSWORD;
if (!email || !password) throw new Error('OMNI_UAT_EMAIL_AND_PASSWORD_REQUIRED');
const fixtureRoot = process.env.OMNI_UAT_FIXTURE_ROOT || 'D:/Claude/Factcheck/Inputdata08092026';

async function request(route, { method = 'GET', body, cookie, json = true } = {}) {
  const headers = { Origin: browserOrigin, ...(cookie ? { Cookie: cookie } : {}) };
  if (json && body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiOrigin}${route}`, { method, headers,
    ...(body === undefined ? {} : { body: json ? JSON.stringify(body) : body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${payload.error || payload.message || 'FAILED'}`);
  return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

(async () => {
  const discoveryResponse = await fetch(`${apiOrigin}/api/auth/login`, { method: 'POST', headers: {
    Origin: browserOrigin, 'Content-Type': 'application/json'
  }, body: JSON.stringify({ email, password }) });
  const discovery = await discoveryResponse.json();
  const amazon = (discovery.workspaces || []).find(item => item.marketplace === 'AMAZON');
  if (!amazon) throw new Error(`AMAZON_WORKSPACE_NOT_FOUND:${discovery.error || discovery.message || discoveryResponse.status}`);
  const login = await request('/api/auth/login', { method: 'POST', body: { email, password, workspaceId: amazon.id } });
  const cookie = login.cookie;
  const project = await request('/api/projects', { method: 'POST', cookie, body: {
    name: `W2 Browser Hija ${new Date().toISOString()}`, seedPhrase: 'para mi hija', locale: 'es-US',
    mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE',
    productFamilyVersion: 'custom-necklace-v1'
  } });
  const projectId = project.payload.projectId;
  const upload = async (kind, fileName) => {
    const bytes = fs.readFileSync(path.join(fixtureRoot, fileName)); const form = new FormData();
    form.append('kind', kind); form.append('idempotencyKey', crypto.randomUUID());
    form.append('researchFile', new Blob([bytes]), fileName);
    return request(`/api/projects/${projectId}/research-imports`, { method: 'POST', body: form, cookie, json: false });
  };
  const xray = await upload('AMAZON_XRAY', 'Xray_Hija.xlsx');
  const cerebro = await upload('AMAZON_CEREBRO', 'Cerebro_Hija.xlsx');
  const snapshot = await request(`/api/projects/${projectId}/research-snapshots`, { method: 'POST', cookie, body: {
    expectedHeadResearchSnapshotId: null,
    importIds: [xray.payload.researchImportId, cerebro.payload.researchImportId],
    idempotencyKey: crypto.randomUUID(), changeReason: 'W2_BROWSER_UAT_RESEARCH'
  } });
  const master = await request(`/api/projects/${projectId}/amazon/master-keywords`, { method: 'POST', cookie, body: {
    researchSnapshotId: snapshot.payload.researchSnapshotId, decisions: [], expectedHeadArtifactId: null,
    idempotencyKey: crypto.randomUUID(), changeReason: 'W2_BROWSER_UAT_MASTER_KEYWORDS'
  } });
  process.stdout.write(JSON.stringify({ projectId, researchImportIds: [xray.payload.researchImportId,
    cerebro.payload.researchImportId], researchSnapshotId: snapshot.payload.researchSnapshotId,
  masterKeywordArtifactId: master.payload.id, masterKeywordCount: master.payload.accounting.masterKeywordCount,
  artifactHash: master.payload.artifactHash }, null, 2));
})().catch(error => { console.error(error.message); process.exit(1); });
