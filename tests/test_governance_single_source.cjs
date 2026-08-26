const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const golden = read('GOLDEN_RULES.md');
const projectRules = read('PROJECT_RULES.md');
const guide = read('PROJECT_GUIDE_CLAUDE_GPT_OMNI_AMZ_ETSY.md');
const operationalChecklist = read('docs/operational/GPT1_GPT2_INTEGRATION_CHECKLIST.md');

assert(golden.includes('Version:** 1.1 — RATIFIED'), 'Ratified Golden Rules v1.1 must exist at repository root');
assert(golden.includes('Đây là văn bản golden rule DUY NHẤT'), 'Golden Rules must declare the single governance authority');

assert(projectRules.includes('PROJECT_RULES — BÃI BỎ'), 'PROJECT_RULES must remain a retired stub');
assert(projectRules.includes('./GOLDEN_RULES.md'), 'Retired PROJECT_RULES must point to canonical governance');

assert(guide.startsWith('> ## ⚠️ TRẠNG THÁI VĂN BẢN'), 'Project Guide must begin with the non-governance header');
assert(!guide.includes('# 13. MULTI-AGENT WORKING MODEL'), 'Retired role model must not remain in Project Guide');
assert(!guide.includes('# 21. REQUIRED HANDOFF FORMAT'), 'Retired handoff format must not remain in Project Guide');

assert(!fs.existsSync(path.join(root, 'docs/GPT1_GPT2_INTEGRATION_CHECKLIST.md')), 'Old governance-adjacent checklist path must stay absent');
assert(operationalChecklist.includes('Operational reference only'), 'Moved checklist must identify itself as non-governance');
assert(operationalChecklist.includes('../../GOLDEN_RULES.md'), 'Operational checklist must point to canonical governance');

console.log('GOVERNANCE_SINGLE_SOURCE=PASS');
