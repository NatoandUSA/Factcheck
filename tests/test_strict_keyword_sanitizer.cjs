const assert = require('assert');
const { sanitizeKeyword, rankKeywords } = require('../server/keywordRanker');

function testStrictKeywordSanitizer() {
  console.log('================================================================');
  console.log('  TESTING STRICT KEYWORD SANITIZER & RELEVANCE FILTERS');
  console.log('================================================================\n');

  const testGarbageKeywords = [
    'b0gl7dyp9r',
    'b0h19x4t7d',
    'abused by my girlfriend',
    'rea',
    'chucky doll',
    'my gif',
    'overnight delivery gifts',
    'overnight delivery items',
    '10.',
    '11.',
    '12.'
  ];

  const testValidKeywords = [
    'personalized mother in law necklace',
    'regalo para el amor de mi vida',
    'embroidered kids names on sleeve'
  ];

  testGarbageKeywords.forEach(kw => {
    const clean = sanitizeKeyword(kw);
    assert.strictEqual(clean, null, `Garbage keyword "${kw}" should be discarded but passed as "${clean}"`);
    console.log(`  🟢 DISCARDED GARBAGE: "${kw}"`);
  });

  testValidKeywords.forEach(kw => {
    const clean = sanitizeKeyword(kw);
    assert.notStrictEqual(clean, null, `Valid keyword "${kw}" was incorrectly discarded`);
    console.log(`  ✨ KEPT VALID KEYWORD: "${kw}"`);
  });

  const ranked = rankKeywords(testValidKeywords, 'Jewelry', 'para el amor de mi vida');
  assert.strictEqual(ranked.length, testValidKeywords.length, 'Ranked count must match valid input count');

  console.log(`\nRanked Keywords Output Count: ${ranked.length}`);
  ranked.forEach((item, idx) => {
    console.log(`  Rank #${idx + 1}: "${item.keyword}" (Score: ${item.score}, IsLongTail: ${item.isLongTail}, IsNicheRelevant: ${item.isNicheRelevant})`);
  });

  console.log('\n================================================================');
  console.log('  🟢 100% OPERATIONAL SUCCESS: ALL GARBAGE KEYWORDS ELIMINATED!');
  console.log('================================================================\n');
}

testStrictKeywordSanitizer();
