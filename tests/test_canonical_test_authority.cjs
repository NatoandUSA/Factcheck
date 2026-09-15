'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAuthorityMap, authorityCounts } = require('./helpers/testAuthority.cjs');

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'canonical_test_inventory.json'), 'utf8'));
const map = loadAuthorityMap(inventory, path.join(__dirname, 'canonical_test_authority.json'));
assert.equal(map.size, inventory.length);
assert.equal([...map.values()].every(Boolean), true);
assert.equal(map.get('tests/test_workflow_state_machine.test.cjs'), 'HISTORICAL_COMPATIBILITY');
assert.equal(map.get('tests/test_r43_w1_single_path.cjs'), 'ACTIVE_R43');
assert.equal(Object.values(authorityCounts(map)).reduce((sum, count) => sum + count, 0), inventory.length);
console.log('CANONICAL_TEST_AUTHORITY_TESTS_PASSED');
