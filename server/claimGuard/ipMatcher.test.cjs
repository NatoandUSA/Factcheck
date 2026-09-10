'use strict';

const assert = require('node:assert/strict');
const {
  compileIpLibrary,
  createIpMatcher,
  screenIpText,
  tokenize
} = require('./ipMatcher.js');

const library = {
  meta: { version: 'fixture-en-es-1' },
  block: {
    brands: ['Nike', 'Taylor Swift', 'Cat', 'NiKe', 'Bad Bunny'],
    malformed: 'not-an-array'
  },
  ambiguous_downgrade: {
    cat: 'Common English word; review context.'
  },
  review_phrases: [
    { term: 'mama bear', note: 'Reported phrase.' },
    { term: 'corazón valiente', note: 'Spanish fixture phrase.' },
    { nope: true }
  ]
};

let passed = 0;
const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test('requires the server caller to inject a library', () => {
  assert.throws(() => screenIpText('Nike'), /IP_LIBRARY_REQUIRED/);
});

test('reports deterministic library accounting', () => {
  const compiled = compileIpLibrary(library);
  assert.deepEqual(compiled.accounting, {
    inputEntries: 9,
    acceptedUniqueEntries: 6,
    duplicateEntries: 1,
    allowedEntries: 0,
    rejectedEntries: 2,
    duplicates: [{ ordinal: 4, term: 'nike', reason: 'DUPLICATE_TERM' }],
    rejected: [
      { ordinal: 6, source: 'block.malformed', reason: 'CATEGORY_MUST_BE_ARRAY' },
      { ordinal: 9, source: 'review_phrases', reason: 'INVALID_OR_EMPTY_TERM' }
    ]
  });
});

test('blocks an English term at token boundaries, case-insensitively', () => {
  const result = screenIpText('Vintage NIKE running shirt', library);
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.enforcementHits[0].matchMode, 'BOUNDARY');
  assert.equal(result.enforcementHits[0].enforcement, 'ENFORCE');
});

test('blocks a Spanish-language sentence containing an exact name', () => {
  const result = screenIpText('Camiseta inspirada en Bad Bunny para regalo', library);
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.enforcementHits[0].term, 'bad bunny');
});

test('normalizes accents while retaining token boundaries', () => {
  const result = screenIpText('Diseño CORAZON VALIENTE para mamá', library);
  assert.equal(result.verdict, 'REVIEW');
  assert.equal(result.enforcementHits[0].term, 'corazon valiente');
  assert.equal(result.enforcementHits[0].matchMode, 'BOUNDARY');
});

test('does not reproduce the cat-in-dedication substring false positive', () => {
  const result = screenIpText('A dedication gift for a devoted teacher', library);
  assert.equal(result.verdict, 'NO_KNOWN_HIT');
  assert.equal(result.hits.length, 0);
});

test('does not match cat inside Spanish concatenation', () => {
  const result = screenIpText('Una dedicatoria especial', library);
  assert.equal(result.verdict, 'NO_KNOWN_HIT');
});

test('keeps an ambiguous exact token at review', () => {
  const result = screenIpText('Cat mom keepsake', library);
  assert.equal(result.verdict, 'REVIEW');
  assert.equal(result.enforcementHits[0].disposition, 'REVIEW');
  assert.match(result.enforcementHits[0].note, /Common English/);
});

test('keeps leetspeak fuzzy matches shadow-only', () => {
  const result = screenIpText('N1K3 workout top', library);
  assert.equal(result.verdict, 'REVIEW');
  assert.equal(result.enforcementHits.length, 0);
  assert.equal(result.shadowHits[0].matchMode, 'FUZZY_VARIANT');
  assert.equal(result.shadowHits[0].disposition, 'REVIEW');
});

test('keeps plural and doubled-letter variants shadow-only', () => {
  const result = createIpMatcher(library).screen('Nikkees athletic top');
  assert.equal(result.verdict, 'REVIEW');
  assert.equal(result.enforcementHits.length, 0);
  assert.equal(result.shadowHits[0].term, 'nike');
});

test('keeps glued names shadow-only even when highly recognizable', () => {
  const result = screenIpText('taylorswiftconcert tee', library);
  assert.equal(result.verdict, 'REVIEW');
  assert.equal(result.enforcementHits.length, 0);
  assert.equal(result.shadowHits[0].matchMode, 'FUZZY_GLUE');
});

test('returns stable scan accounting and no legal-clearance claim', () => {
  const result = screenIpText('Plain camiseta artesanal', library);
  assert.deepEqual(result.accounting, {
    textTokens: 3,
    libraryEntriesEvaluated: 6,
    enforcementHits: 0,
    shadowHits: 0,
    totalHits: 0
  });
  assert.equal(result.legalClearance, false);
  assert.deepEqual(tokenize('¡CAMISETA, corazón!'), ['camiseta', 'corazon']);
});

for (const { name, fn } of cases) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

const failed = cases.length - passed;
process.stdout.write(`ACCOUNTING passed=${passed} failed=${failed} unexecuted=0 total=${cases.length}\n`);
