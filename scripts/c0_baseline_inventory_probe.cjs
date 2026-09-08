const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
const expectedLegacySurfaces = [
  "app.post('/api/listings'",
  "app.post('/api/etsy/batch-learn'",
  "app.post('/api/amazon/quick-draft'",
  "app.post('/api/trends/:id/draft'",
  "app.post('/api/chat'"
];

const observedSurfaces = expectedLegacySurfaces.filter(signature => serverSource.includes(signature));
const listingInsertCount = (serverSource.match(/INSERT\s+INTO\s+listings/gi) || []).length;
const rendererCallCount = (serverSource.match(/renderVerifiedCommerceListing\s*\(/g) || []).length;

if (observedSurfaces.length !== 5) {
  throw new Error(`BASELINE_LEGACY_SURFACE_DRIFT expected=5 actual=${observedSurfaces.length}`);
}
if (listingInsertCount !== 4) {
  throw new Error(`BASELINE_LISTING_WRITER_DRIFT expected=4 actual=${listingInsertCount}`);
}
if (rendererCallCount < 3) {
  throw new Error(`BASELINE_RENDERER_CALL_DRIFT expectedAtLeast=3 actual=${rendererCallCount}`);
}

console.log(`C0_BASELINE_INVENTORY legacySurfaces=${observedSurfaces.length} directListingInserts=${listingInsertCount} rendererCalls=${rendererCallCount}`);
console.log('C0_BASELINE_INVENTORY PASS');
console.log('NOTE This probe records baseline debt only; it never certifies future runtime behavior.');
