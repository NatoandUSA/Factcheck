const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contractRoot = path.join(root, 'contracts', 'omniseller-r3', 'v1');
const load = relative => {
  const bytes = fs.readFileSync(path.join(contractRoot, relative));
  return { value: JSON.parse(bytes.toString('utf8')), hash: crypto.createHash('sha256').update(bytes).digest('hex') };
};
const fail = message => { throw new Error(message); };

const taxonomy = load('claim-taxonomy.v1.json');
if (taxonomy.value.claimIds.length !== 14) fail('CLAIM_ID_COUNT_MISMATCH');
if (new Set(taxonomy.value.claimIds).size !== taxonomy.value.claimIds.length) fail('DUPLICATE_CLAIM_ID');
if (taxonomy.value.identityDoesNotProveAttribute !== true) fail('IDENTITY_ATTRIBUTE_INVARIANT_MISSING');

const redCases = load('c0-red-cases.json');
const requiredRedCases = [
  'POLICY_CONTRACT_MUTATION_75_TO_200',
  'SINGLE_CANONICAL_COMPOSER_WRITE_PATH',
  'PRODUCT_NAME_DOES_NOT_PROVE_MATERIAL'
];
const redIds = new Set(redCases.value.cases.map(item => item.id));
for (const id of requiredRedCases) if (!redIds.has(id)) fail(`MISSING_RED_CASE_${id}`);

const amazon = load(path.join('policy-fixtures', 'amazon-us-nonmedia-2026-07-27-v1.json'));
const etsy = load(path.join('policy-fixtures', 'etsy-us-general-2026-09-08-v1.json'));
if (amazon.value.rules.title.maxChars !== 75) fail('AMAZON_TITLE_BASELINE_MISMATCH');
if (amazon.value.rules.itemHighlights.maxChars !== 125) fail('AMAZON_HIGHLIGHT_BASELINE_MISMATCH');
if (amazon.value.rules.genericKeywords.maxUtf8Bytes !== 249) fail('AMAZON_SEARCH_BYTES_MISMATCH');
if (etsy.value.rules.tags.maxCount !== 13 || etsy.value.rules.tags.targetCount !== 13) fail('ETSY_TAG_CONTRACT_MISMATCH');
if (etsy.value.rules.tags.maxCount < etsy.value.rules.tags.targetCount) fail('ETSY_TARGET_EXCEEDS_POLICY_MAX');

for (const [name, artifact] of Object.entries({ taxonomy, redCases, amazon, etsy })) {
  console.log(`C0_CONTRACT_OK ${name} sha256=${artifact.hash}`);
}
console.log('C0_CONTRACT_VALIDATION PASS');
