// Single source for persisted states, legal edges and edge authorization.
// Missing/unknown classifications never imply permission.
const registry = Object.freeze({
  EVIDENCE_INTAKE: Object.freeze({ RESEARCH_ACCEPTED: 'QUALIFYING_RESEARCH' }),
  RESEARCH_ACCEPTED: Object.freeze({ DNA_ACCEPTED: 'QUALIFYING_RESEARCH' }),
  DNA_ACCEPTED: Object.freeze({ MKL_FROZEN: 'QUALIFYING_RESEARCH' }),
  MKL_FROZEN: Object.freeze({ DRAFT_GENERATED: 'QUALIFYING_RESEARCH', PRODUCT_TRUTH_VERIFIED: 'QUALIFYING_RESEARCH', PRODUCT_TRUTH_CONFIRMED: 'QUALIFYING_RESEARCH' }),
  DRAFT_GENERATED: Object.freeze({ PRODUCT_TRUTH_VERIFIED: 'QUALIFYING_RESEARCH', VALIDATED: 'QUALIFYING_RESEARCH' }),
  PRODUCT_TRUTH_VERIFIED: Object.freeze({ MANAGER_APPROVED: 'QUALIFYING_RESEARCH' }),
  PRODUCT_TRUTH_CONFIRMED: Object.freeze({ DRAFT_GENERATED: 'QUALIFYING_RESEARCH' }),
  VALIDATED: Object.freeze({ MANAGER_APPROVED: 'QUALIFYING_RESEARCH' }),
  MANAGER_APPROVED: Object.freeze({ PUBLISH_READY: 'QUALIFYING_RESEARCH' }),
  PUBLISH_READY: Object.freeze({})
});
const states = Object.freeze(Object.keys(registry));
const transitions = Object.freeze(Object.fromEntries(states.map(state => [state, Object.freeze(Object.keys(registry[state]))])));
const stateColumnSql = `state TEXT NOT NULL DEFAULT 'EVIDENCE_INTAKE' CHECK(state IN (${states.map(s => `'${s}'`).join(', ')}))`;
function classifyTransition(from, to, source = registry) {
  if (!Object.hasOwn(source, from) || !Object.hasOwn(source[from], to)) return null;
  return source[from][to] === 'QUALIFYING_RESEARCH' && Object.hasOwn(source, to) ? 'QUALIFYING_RESEARCH' : null;
}
function assertRegistry(source = registry) {
  let count = 0;
  for (const [from, edges] of Object.entries(source)) {
    if (!/^[A-Z_]+$/.test(from)) throw new Error('INVALID_REGISTRY_STATE');
    for (const to of Object.keys(edges)) {
      if (!classifyTransition(from, to, source)) throw new Error(`UNCLASSIFIED_PROJECT_TRANSITION:${from}:${to}`);
      count++;
    }
  }
  if (!count) throw new Error('ZERO_REGISTRY_EDGES');
  return count;
}
function schemaStates(sql) {
  const match = /CHECK\s*\(\s*"?state"?\s+IN\s*\(([^)]+)\)\s*\)/i.exec(sql || '');
  if (!match) throw new Error('PROJECT_STATE_CONSTRAINT_MISSING');
  const values = match[1].split(',').map(s => s.trim());
  if (values.some(s => !/^'[A-Z_]+'$/.test(s))) throw new Error('PROJECT_STATE_CONSTRAINT_UNRECOGNIZED');
  return values.map(s => s.slice(1, -1));
}
module.exports = { registry, states, transitions, stateColumnSql, classifyTransition, assertRegistry, schemaStates };
