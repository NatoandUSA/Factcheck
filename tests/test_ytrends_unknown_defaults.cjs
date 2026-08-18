const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseYTrendsHtml } = require('../server/ytrendsParser');

const sparseCard = `
  <div class="rounded-lg border">
    <a>embroidered nurse sweatshirt</a>
  </div>`;

const parsed = parseYTrendsHtml(sparseCard);
assert.strictEqual(parsed.length, 1, 'Sparse source card must still expose its observed keyword');
assert.strictEqual(parsed[0].momentum, null, 'Missing momentum must remain UNKNOWN');
assert.strictEqual(parsed[0].sold24h, null, 'Missing sold24h must remain UNKNOWN');
assert.strictEqual(parsed[0].views24h, null, 'Missing views24h must remain UNKNOWN');
assert.strictEqual(parsed[0].conversion, null, 'Missing conversion must remain UNKNOWN');
assert.strictEqual(parsed[0].competition, null, 'Missing competition must remain UNKNOWN');

const explicitZeroCard = `
  <div class="rounded-lg border">
    <a>embroidered nurse sweatshirt</a>
    Sold 24h 0 Views 24h 0 Conversion 0% Momentum 0 Medium
  </div>`;
const zero = parseYTrendsHtml(explicitZeroCard)[0];
assert.strictEqual(zero.sold24h, '0');
assert.strictEqual(zero.views24h, '0');
assert.strictEqual(zero.conversion, '0%');
assert.strictEqual(zero.momentum, 0);
assert.strictEqual(zero.competition, 'Medium');

const src = fs.readFileSync(path.resolve(__dirname, '../server/ytrendsParser.js'), 'utf8');
assert.ok(!src.includes("let conversion = '2.5%'"));
assert.ok(!src.includes("let competition = 'Medium'"));
assert.ok(!src.includes('momentum: 50.0'));
assert.ok(!src.includes("competition: competition || 'Medium'"));

console.log('🟢 YTrends sparse cards keep missing metrics UNKNOWN; explicit zero remains observed.');
