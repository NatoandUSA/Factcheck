const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const etsy = read('src/components/EtsyWorkspace.jsx');
const amazon = read('src/components/AmazonWorkspace.jsx');
const server = read('server/server.js');

for (const [name, source] of [['Etsy', etsy], ['Amazon', amazon]]) {
  assert.ok(source.includes('Active Project (bắt buộc)'), `${name} must expose an explicit project selector`);
  assert.ok(source.includes('<option value="">— Chọn project —</option>'), `${name} must default to no project`);
  assert.strictEqual(source.includes('setActiveProject(data.projects[0])'), false, `${name} must not silently select the first project`);
  assert.ok(source.includes("disabled={!activeProject || activeProject.state === 'EVIDENCE_INTAKE'}"), `${name} research stage must remain gated by server project state`);
  assert.ok(source.includes("'MKL_FROZEN'"), `${name} MKL stage must reference the canonical server state`);
}

assert.ok(etsy.includes("const transitioned = await handleTransition('RESEARCH_ACCEPTED')"), 'Etsy evidence acceptance must call the server transition');
assert.ok(etsy.includes("await handleTransition('DNA_ACCEPTED')"), 'Etsy DNA acceptance must call the server transition');
assert.ok(amazon.includes("await handleTransition('DNA_ACCEPTED')"), 'Amazon DNA acceptance must call the server transition');

assert.ok(server.includes("evidenceState: liveEvidenceCount > 0 ? 'MIXED_EVIDENCE' : 'UNVERIFIED_INPUT'"), 'Composite feed response must distinguish mixed evidence from observed evidence');
assert.ok(server.includes('observedAt: null'), 'Unknown provider observation time must remain null');
assert.ok(server.includes("evidenceProvider: 'STAFF_PASTED_TEXT'"), 'Staff-pasted sellers must retain their unverified provider label');
assert.ok(server.includes("evidenceProvider: 'YTRENDS_MCP'"), 'Live sellers must retain their MCP provider label');
assert.strictEqual(etsy.includes("evidenceState: 'OBSERVED'"), false, 'Client must consume server provenance rather than invent OBSERVED state');
assert.ok(etsy.includes('Number(t.project_id) === Number(activeProject.id)'), 'Etsy trends must be scoped to the selected project');
assert.ok(amazon.includes('Number(t.project_id) === Number(activeProject.id)'), 'Amazon trends must be scoped to the selected project');

console.log('Workflow truth UI contract passed.');
