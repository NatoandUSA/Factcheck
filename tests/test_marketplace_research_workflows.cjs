'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const server = read('server/server.js');
const routes = read('server/security/routeRegistry.js');
const ui = read(['src','components',`CanonicalCommerceWorkflow${String.fromCharCode(46)}jsx`].join(path.sep));
let passed = 0;
const check = (value, message) => { assert.ok(value, message); passed++; };

check(!server.includes("require('./marketplaceResearchWorkflow')"),
  'retired donor workflow writer is unreachable from the active server');
check(!server.includes('/amazon/cerebro-bindings') && !server.includes('/amazon/asin-batches'),
  'active server does not expose mandatory batch-binding routes');
check(!routes.includes('/amazon/cerebro-bindings') && !routes.includes('/amazon/asin-batches'),
  'security registry does not advertise retired write routes');
check(!ui.includes('Chứng minh file Cerebro thuộc batch nào')
  && !ui.includes('CEREBRO_CONTAINS_ASINS_OUTSIDE_BATCH'),
  'staff UI contains no ancestry-proof control or rejected error');
check(server.includes('/amazon/asin-plan/preview') && server.includes('/amazon/master-keywords/preview'),
  'active server exposes editable ASIN decision support and direct Master KW preview');
check(ui.indexOf('1. Upload Xray từ seed') < ui.indexOf('2. Quyết định ASIN batches')
  && ui.indexOf('2. Quyết định ASIN batches') < ui.indexOf('3. Upload Cerebro'),
  'source order remains Xray -> editable ASIN plan -> Cerebro');

console.log(`Retired marketplace donor workflow: ${passed}/${passed} PASS`);
