const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('================================================================');
  console.log('  TESTING ETSY SELLER-EVIDENCE STAFF UI TRUTH CONTRACT');
  console.log('================================================================\n');

  const src = fs.readFileSync(
    path.resolve(__dirname, '../src/components/EtsyMultiSellerScanner.jsx'),
    'utf8'
  );

  assert.ok(!src.includes('const scanSellers = async'), 'UI must not expose a source-less seller scan that always fails closed');
  assert.ok(!src.includes('Kiểm Tra Seller Evidence'), 'UI must not imply a live seller scan exists without a verified connector');
  assert.ok(!src.includes('RefreshCw'), 'obsolete faux-scan icon/action should be removed');
  assert.ok(src.includes('Thêm Seller Đã Kiểm Tra'), 'Staff manual assertion must remain an explicit usable evidence path');
  assert.ok(src.includes('STAFF_MANUAL_ASSERTION'), 'manual rows must carry the explicit assertion label');
  assert.ok(src.includes('Auto seller scan chưa có nguồn live được chứng minh'), 'UI must explain why no automatic seller scan is shown');
  assert.ok(src.includes('selectedCount < 3'), 'learning remains blocked until minimum evidence is selected');

  console.log('  🟢 No fake/live-looking seller scan action remains.');
  console.log('  🟢 Staff retains an explicit manual evidence workflow.');
  console.log('  🟢 UI explains the missing live connector instead of fabricating continuity.');
  console.log('\n================================================================');
  console.log('  🟢 ETSY SELLER-EVIDENCE UI CONTRACT PASSED');
  console.log('================================================================');
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
