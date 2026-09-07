const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const etsy = read('src/components/EtsyWorkspace.jsx');
const amazon = read('src/components/AmazonWorkspace.jsx');
const server = read('server/server.js');
const pastedParser = read('server/etsyPastedSearchParser.js');

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

assert.ok(server.includes("parsed.inputFormat === 'CSV' ? 'ETSY_SEARCH_CSV'"), 'CSV feed response must preserve its staff-file provider');
assert.ok(server.includes("parsed.inputFormat === 'HTML' ? 'ETSY_SEARCH_HTML'"), 'HTML feed response must preserve its staff-file provider');
assert.ok(server.includes(": 'HEYETSY_PASTED_TEXT'"), 'HeyEtsy text feed response must preserve its third-party staff-paste provider');
assert.ok(server.includes("evidenceState: 'UNVERIFIED_INPUT'"), 'Pasted feed response must remain unverified');
assert.strictEqual(server.includes("source: liveEvidenceCount > 0 ? 'ETSY_FEED_COMPOSITE'"), false, 'Paste and MCP evidence must not be silently combined');
assert.ok(server.includes('observedAt: null'), 'Unknown provider observation time must remain null');
assert.ok(pastedParser.includes("evidenceProvider: 'HEYETSY_PASTED_TEXT'"), 'Staff-pasted sellers must retain their unverified provider label');
assert.ok(server.includes("provider: 'YTRENDS_MCP'"), 'Live Smart Pull responses must retain their MCP provider label');
assert.ok(server.includes("evidenceState: 'RETRIEVED_NO_OBSERVED_AT'"), 'MCP retrieval without provider observation time must not claim OBSERVED');
assert.strictEqual(etsy.includes("evidenceState: 'OBSERVED'"), false, 'Client must consume server provenance rather than invent OBSERVED state');
assert.ok(etsy.includes('/api/trends?projectId=${encodeURIComponent(requestedProjectId)}'), 'Etsy trends must request the selected project');
assert.ok(amazon.includes('/api/trends?projectId=${encodeURIComponent(requestedProjectId)}'), 'Amazon trends must request the selected project');
assert.ok(etsy.includes('activeProjectIdRef.current !== requestedProjectId'), 'Etsy must reject stale async responses after a project switch');
assert.ok(amazon.includes('activeProjectIdRef.current !== requestedProjectId'), 'Amazon must reject stale async responses after a project switch');
assert.ok(etsy.includes('setScannedSellers([])'), 'Etsy must clear seller evidence when project context changes');
assert.ok(etsy.includes('prev?.id === requestedProjectId'), 'Etsy transitions must not update a newly selected project');
assert.ok(amazon.includes('prev?.id === requestedProjectId'), 'Amazon transitions must not update a newly selected project');
assert.ok(etsy.includes('projectId: requestedProjectId'), 'Etsy MCP pull must bind to the captured project context');
assert.ok(server.includes('project_id = ? AND tenant_id = ?'), 'Draft route must support strict project context validation');

console.log('Workflow truth UI contract passed.');
