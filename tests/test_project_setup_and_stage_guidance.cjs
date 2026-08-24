const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const amazon = read('src/components/AmazonWorkspace.jsx');
const etsy = read('src/components/EtsyWorkspace.jsx');
const pipeline = read('src/components/AmazonPipelineWorkflow.jsx');
const setup = read('src/components/ProjectSetupCard.jsx');
const evidence = read('src/components/ProjectEvidenceGate.jsx');
const server = read('server/server.js');

assert.ok(setup.includes("fetch('/api/projects'"), 'Project setup must create a server-bound project');
assert.ok(setup.includes('Tạo project'), 'Project setup must expose a visible create action');
assert.ok(evidence.includes("/api/evidence?projectId="), 'Evidence gate must load project-scoped evidence');
assert.ok(evidence.includes('/accept'), 'Evidence gate must expose the server acceptance action');
assert.ok(evidence.includes("'RESEARCH_ACCEPTED'"), 'Evidence gate must offer the canonical research transition');

for (const [name, source] of [['Amazon', amazon], ['Etsy', etsy]]) {
  assert.ok(source.includes('<ProjectSetupCard'), `${name} must guide an empty workspace to project creation`);
  assert.ok(source.includes('<ProjectEvidenceGate'), `${name} must show the evidence-to-research path`);
  assert.ok(source.includes("setSeedPhrase(selected?.seed_phrase || '')"), `${name} must restore the selected project's seed phrase`);
}

assert.ok(amazon.includes("display: activeStage === 'workflow' ? 'block' : 'none'"), 'Amazon workflow must stay mounted when stages change');
assert.ok(amazon.includes('scannedSellers={xraySellers}'), 'Amazon Xray candidates must remain available as style-only Learning Box inputs');
assert.ok(pipeline.includes('Tạo hoặc chọn Active Project trước khi nạp Xray'), 'Xray upload must fail early without project context');
assert.ok(pipeline.includes('Tạo hoặc chọn Active Project trước khi nạp Cerebro'), 'Cerebro upload must fail early without project context');
assert.strictEqual(etsy.includes('13 Tags chuẩn 100%'), false, 'Etsy feed UI must not guarantee provider extraction');
assert.ok(etsy.includes('disabled={mcpPulling || !activeProject || !seedPhrase.trim()}'), 'Etsy MCP pull must be visibly gated by active project');
assert.ok(server.includes("const projectName = typeof name === 'string' ? name.trim() : '';"), 'Project creation must normalize the project name on the server');
assert.ok(server.includes("if (!projectName || !normalizedSeedPhrase)"), 'Whitespace-only project inputs must be rejected on the server');

console.log('Project setup and stage guidance UI contract passed.');
