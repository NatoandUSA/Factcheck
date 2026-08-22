const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  nullableInteger,
  parseEtsySearchResults,
  synthesizeEtsyBatchLearnings
} = require('../server/competitorBatchLearner');

const ROOT = path.resolve(__dirname, '..');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

async function run() {
  console.log('================================================================');
  console.log('  TESTING ETSY P0.5-B UNKNOWN-NOT-FABRICATED TRUTH SEMANTICS');
  console.log('================================================================\n');

  // Numeric parsing must preserve explicit zero while keeping missing UNKNOWN.
  assert.strictEqual(nullableInteger(undefined), null);
  assert.strictEqual(nullableInteger(''), null);
  assert.strictEqual(nullableInteger('0'), 0);
  assert.strictEqual(nullableInteger('1,234'), 1234);
  console.log('  🟢 Missing numeric evidence stays null; explicit zero stays zero.');

  // HeyEtsy-style table: no plausible defaults for fields not present.
  const tableHtml = `
    <table><tr>
      <td>1</td>
      <td><a href="/listing/123">Custom Nurse Embroidered Sweatshirt</a></td>
      <td></td><td></td><td>0</td><td></td>
    </tr></table>`;
  const tableRows = parseEtsySearchResults({ htmlContent: tableHtml });
  assert.strictEqual(tableRows.length, 1);
  assert.strictEqual(tableRows[0].evidenceSource, 'HEYETSY_HTML');
  assert.strictEqual(tableRows[0].shopName, null);
  assert.strictEqual(tableRows[0].price, null);
  assert.strictEqual(tableRows[0].views24h, 0);
  assert.strictEqual(tableRows[0].sold24h, null);
  assert.strictEqual(tableRows[0].favorites, null);
  assert.strictEqual(tableRows[0].country, null);
  assert.strictEqual(tableRows[0].listingAge, null);
  assert.strictEqual(tableRows[0].rating, null);
  console.log('  🟢 HeyEtsy HTML preserves only source-provided facts.');

  // Etsy card HTML does not magically gain engagement/country/rating facts.
  const cardHtml = `
    <div data-search-results-container>
      <div class="v2-listing-card">
        <a href="/listing/456"><h3>Personalized Floral Sleeve Sweatshirt</h3></a>
        <span class="currency-value">31.50</span>
      </div>
    </div>`;
  const cardRows = parseEtsySearchResults({ htmlContent: cardHtml });
  assert.strictEqual(cardRows.length, 1);
  assert.strictEqual(cardRows[0].evidenceSource, 'ETSY_CARD_HTML');
  assert.strictEqual(cardRows[0].views24h, null);
  assert.strictEqual(cardRows[0].sold24h, null);
  assert.strictEqual(cardRows[0].favorites, null);
  assert.strictEqual(cardRows[0].country, null);
  assert.strictEqual(cardRows[0].listingAge, null);
  assert.strictEqual(cardRows[0].rating, null);
  assert.strictEqual(cardRows[0].price, '31.50');
  console.log('  🟢 Etsy card parser has zero synthetic engagement/default metadata.');

  // CSV: missing remains null; source-provided zero remains zero.
  const csvRows = parseEtsySearchResults({
    csvRows: [{ Title: 'Custom Dog Mom Cuff Embroidery', Views: 0 }]
  });
  assert.strictEqual(csvRows.length, 1);
  assert.strictEqual(csvRows[0].evidenceSource, 'CSV_UPLOAD');
  assert.strictEqual(csvRows[0].views24h, 0);
  for (const key of ['shopName', 'sold24h', 'favorites', 'price', 'country', 'listingAge', 'rating']) {
    assert.strictEqual(csvRows[0][key], null, `${key} must remain UNKNOWN/null`);
  }
  console.log('  🟢 CSV missing seller facts stay UNKNOWN instead of plausible defaults.');

  // Evidence learning must reject rows without accepted provenance before LLM use.
  await assert.rejects(
    () => synthesizeEtsyBatchLearnings({
      seedPhrase: 'custom sweatshirt',
      sellers: [1, 2, 3].map(i => ({ title: `Seller evidence title ${i}`, selected: true }))
    }),
    err => err && err.code === 'UNVERIFIED_SELLER_EVIDENCE'
  );
  console.log('  🟢 Unproven seller rows cannot enter the LLM evidence prompt.');

  // Even accepted provenance requires at least 3 usable evidence rows.
  await assert.rejects(
    () => synthesizeEtsyBatchLearnings({
      seedPhrase: 'custom sweatshirt',
      sellers: [1, 2].map(i => ({
        title: `Observed seller listing ${i}`,
        evidenceSource: 'STAFF_MANUAL_ASSERTION',
        selected: true
      }))
    }),
    err => err && err.code === 'INSUFFICIENT_EVIDENCE'
  );
  console.log('  🟢 Batch learn fails closed below the minimum evidence count.');

  const learnerSrc = fs.readFileSync(path.join(ROOT, 'server', 'competitorBatchLearner.js'), 'utf8');
  assert.ok(!learnerSrc.includes('Math.random()'), 'competitor learner must not fabricate/randomize any evidence field');
  for (const forbidden of ["'Star Seller'", "'Verified Shop'", "'$24.99'", "'$29.99'", "'|| 120", 'USA Dispatched in 24h']) {
    assert.ok(!learnerSrc.includes(forbidden), `competitor learner still contains synthetic/default truth: ${forbidden}`);
  }
  assert.ok(learnerSrc.includes("etsyMaterials: []"));
  assert.ok(learnerSrc.includes("etsyPersonalizationInstructions: ''"));
  assert.ok(learnerSrc.includes("etsyDescription: ''"));
  console.log('  🟢 Learner source contains no legacy fake seller metrics/Product Truth fields.');

  const serverSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  const mcpBlock = section(serverSrc, '// API: One-Click Auto-Pull LIVE Etsy Trends', '// API: Helium 10 MCP Status & OAuth Check');
  assert.ok(mcpBlock.includes("error: 'ETSY_MCP_UNAVAILABLE'"));
  assert.ok(mcpBlock.includes("evidenceState: 'OBSERVED'"));
  assert.ok(mcpBlock.includes("source: 'ETSY_MCP_LIVE'"));
  for (const forbidden of ['12500', "competition: 'Medium'", 'dynamicTags', 'Smart Semantic Fallback', 'semantic fallback']) {
    assert.ok(!mcpBlock.includes(forbidden), `MCP live route still fabricates/pads data: ${forbidden}`);
  }
  console.log('  🟢 MCP pull is live-only and does not persist fabricated fallback data.');

  const scanBlock = section(serverSrc, '// API: ETSY Seller Evidence Scanner', '// API: ETSY Evidence Batch Learn');
  assert.ok(scanBlock.includes("error: 'INSUFFICIENT_EVIDENCE'"));
  assert.ok(scanBlock.includes('isSynthetic: false'));
  assert.ok(scanBlock.includes("dataBadge: 'SOURCE_EVIDENCE'"));
  for (const forbidden of ['Luxury Star Seller', 'Revenue Leaders', '42-78 sold/24h', 'DEMO_SYNTHETIC']) {
    assert.ok(!scanBlock.includes(forbidden), `seller scan still manufactures ranking evidence: ${forbidden}`);
  }
  console.log('  🟢 Empty Etsy scan fails closed instead of generating 30 synthetic sellers.');

  const learnBlock = section(serverSrc, '// API: ETSY Evidence Batch Learn', '// API: Amazon Quick Draft');
  assert.ok(learnBlock.includes("modelProvenance: 'ETSY_SELLER_EVIDENCE_MODEL'"));
  assert.ok(learnBlock.includes('truthWarnings'));
  for (const forbidden of ['USA FAST DISPATCH', 'PREMIUM CRAFTSMANSHIP', 'PERFECT GIFT READY', 'Handcrafted with top-tier materials']) {
    assert.ok(!learnBlock.includes(forbidden), `batch learn still fabricates Product Truth: ${forbidden}`);
  }
  assert.ok(/amazonTitle:\s*''/.test(learnBlock), 'Etsy evidence learning must not manufacture Amazon copy');
  assert.ok(/etsyMaterials:\s*\[\]/.test(learnBlock), 'Materials must stay empty until Product Truth exists');
  console.log('  🟢 Etsy batch-learn only creates modeled SEO output, not Product Truth/cross-market copy.');

  const scannerSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'EtsyMultiSellerScanner.jsx'), 'utf8');
  assert.ok(scannerSrc.includes('STAFF_MANUAL_ASSERTION'));
  assert.ok(!scannerSrc.includes('const scanSellers = async'), 'source-less seller scan action must not remain in Staff UI');
  assert.ok(!scannerSrc.includes('Kiểm Tra Seller Evidence'), 'UI must not imply an automatic evidence connector exists');
  assert.ok(scannerSrc.includes('selectedCount < 3'));
  for (const forbidden of ['42-78 sold/24h', 'Revenue Leaders', 'Top Sellers Deep Reverse-Engineer']) {
    assert.ok(!scannerSrc.includes(forbidden), `frontend still presents unsupported seller ranking: ${forbidden}`);
  }
  console.log('  🟢 Staff UI exposes explicit evidence/UNKNOWN workflow without a faux live-scan action.');

  const workspaceSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'EtsyWorkspace.jsx'), 'utf8');
  assert.ok(workspaceSrc.includes("data.source !== 'ETSY_MCP_LIVE'"));
  assert.ok(workspaceSrc.includes("data.evidenceState !== 'OBSERVED'"));
  assert.ok(workspaceSrc.includes("t.marketplace === 'ETSY'"));
  assert.ok(workspaceSrc.includes('Number(t.project_id) === Number(activeProject.id)'));
  assert.ok(workspaceSrc.includes('&& t.keywords_detailed'));
  console.log('  🟢 Etsy workspace refuses non-live MCP responses as new listing evidence.');

  assert.ok(!serverSrc.includes('overview.opportunity_score || 50'), 'background MCP log must not turn missing opportunity into 50');
  console.log('  🟢 Background log keeps missing MCP metrics UNKNOWN rather than zero/default.');

  console.log('\n================================================================');
  console.log('  🟢 ALL ETSY P0.5-B TRUTH SEMANTICS PASSED');
  console.log('================================================================');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
