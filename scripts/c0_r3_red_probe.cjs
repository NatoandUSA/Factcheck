const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const serverSource = read('server/server.js');
const legacySurfaces = [
  "app.post('/api/listings'",
  "app.post('/api/etsy/batch-learn'",
  "app.post('/api/amazon/quick-draft'",
  "app.post('/api/trends/:id/draft'",
  "app.post('/api/chat'"
];

const results = [];
const record = (id, green, detail) => results.push({ id, state: green ? 'GREEN' : 'RED', detail });

const listingInsertCount = (serverSource.match(/INSERT\s+INTO\s+listings/gi) || []).length;
record(
  'SINGLE_CANONICAL_COMPOSER_WRITE_PATH',
  exists('server/repositories/listingRevisionRepository.js') && listingInsertCount === 0,
  `baselineLegacyListingInsertCount=${listingInsertCount}; canonicalRepository=${exists('server/repositories/listingRevisionRepository.js')}`
);

const missingLegacySurfaces = legacySurfaces.filter(signature => !serverSource.includes(signature));
record(
  'LEGACY_COMPOSERS_ZERO_WRITE_AFTER_CUTOVER',
  missingLegacySurfaces.length === legacySurfaces.length,
  `legacySurfacesStillPresent=${legacySurfaces.length - missingLegacySurfaces.length}`
);

record(
  'POLICY_CONTRACT_MUTATION_75_TO_200',
  exists('server/policy/contractRegistry.js') && exists('server/policy/enforce.js'),
  'Runtime policy resolver/enforcer must exist before this case can be executable.'
);

record(
  'PRODUCT_NAME_DOES_NOT_PROVE_MATERIAL',
  exists('server/claims/claimRegistry.js') && exists('server/claims/claimGuard.js'),
  'Stable-ID claim adapter and output audit must exist before this fixture can be executable.'
);

for (const result of results) {
  console.log(`${result.state} ${result.id} — ${result.detail}`);
}

const red = results.filter(result => result.state === 'RED');
console.log(`C0_RED_PROBE total=${results.length} red=${red.length} green=${results.length - red.length}`);
process.exitCode = red.length ? 1 : 0;
