'use strict';

const VERSION = 'GLOBAL_CLUSTER_ENGINE_V1_PROPOSAL';

const STOP = new Set([
  'a','an','and','for','from','in','of','on','or','the','to','with',
  'custom','personalized','personalised','gift','gifts'
]);

const FAMILY_HINTS = [
  ['wind_chime', ['wind','chime']],
  ['necklace', ['necklace','pendant']],
  ['bracelet', ['bracelet','bangle']],
  ['ring', ['ring']],
  ['mug', ['mug','tumbler','cup']],
  ['shirt', ['shirt','tee','tshirt','hoodie','sweatshirt']],
  ['ornament', ['ornament']],
  ['plaque', ['plaque','sign']],
  ['keychain', ['keychain','keyring']],
  ['wallet', ['wallet']],
  ['candle', ['candle']],
  ['blanket', ['blanket','throw']]
];

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function meaningfulTokens(value) {
  return tokens(value).filter(token => !STOP.has(token));
}

function familyOf(value) {
  const set = new Set(tokens(value));
  for (const [family, required] of FAMILY_HINTS) {
    if (required.some(token => set.has(token))) return family;
  }
  return 'unknown';
}

function intentOf(value) {
  const set = new Set(tokens(value));
  if (set.has('memorial') || set.has('loss') || set.has('sympathy') || set.has('remembrance')) return 'MEMORIAL';
  if (set.has('birthday')) return 'BIRTHDAY';
  if (set.has('anniversary')) return 'ANNIVERSARY';
  if (set.has('wedding') || set.has('bridal')) return 'WEDDING';
  if (set.has('christmas') || set.has('xmas')) return 'CHRISTMAS';
  if (set.has('graduation')) return 'GRADUATION';
  return 'GENERAL';
}

function jaccard(a, b) {
  const left = new Set(a); const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
function similarity(left, right) {
  const a = meaningfulTokens(left);
  const b = meaningfulTokens(right);
  const lexical = jaccard(a, b);
  const na = normalize(left); const nb = normalize(right);
  const containment = na && nb && (na.includes(nb) || nb.includes(na)) ? 0.15 : 0;
  const sameFamily = familyOf(left) !== 'unknown' && familyOf(left) === familyOf(right);
  const sameIntent = intentOf(left) === intentOf(right);
  return Math.min(1, lexical + containment + (sameFamily ? 0.15 : 0) + (sameIntent ? 0.05 : 0));
}

function compatible(left, right) {
  const lf = familyOf(left); const rf = familyOf(right);
  if (lf !== 'unknown' && rf !== 'unknown' && lf !== rf) return false;
  const li = intentOf(left); const ri = intentOf(right);
  if (li !== 'GENERAL' && ri !== 'GENERAL' && li !== ri) return false;
  return true;
}

function canonicalHead(members) {
  return [...members].sort((a, b) => {
    const at = meaningfulTokens(a).length; const bt = meaningfulTokens(b).length;
    if (at !== bt) return at - bt;
    return normalize(a).localeCompare(normalize(b));
  })[0] || '';
}

function overrideKey(a, b) {
  return [normalize(a), normalize(b)].sort().join('||');
}
function buildOverrideMaps(overrides = {}) {
  const merge = new Set();
  const split = new Set();
  for (const pair of overrides.merge || []) {
    if (Array.isArray(pair) && pair.length === 2) merge.add(overrideKey(pair[0], pair[1]));
  }
  for (const pair of overrides.split || []) {
    if (Array.isArray(pair) && pair.length === 2) split.add(overrideKey(pair[0], pair[1]));
  }
  return { merge, split };
}

function shouldJoin(left, right, threshold, maps) {
  const key = overrideKey(left, right);
  if (maps.split.has(key)) return { join: false, reason: 'HUMAN_SPLIT_OVERRIDE', score: 0 };
  if (maps.merge.has(key)) return { join: true, reason: 'HUMAN_MERGE_OVERRIDE', score: 1 };
  if (!compatible(left, right)) return { join: false, reason: 'PRODUCT_FAMILY_OR_INTENT_BOUNDARY', score: 0 };
  const score = similarity(left, right);
  return {
    join: score >= threshold,
    reason: score >= threshold ? 'LEXICAL_SEMANTIC_PROPOSAL' : 'BELOW_THRESHOLD',
    score
  };
}

function proposeClusters(rawKeywords, options = {}) {
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.58;
  const unique = [...new Map((rawKeywords || []).map(item => [normalize(item), String(item || '').trim()])
    .filter(([key]) => key)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  const maps = buildOverrideMaps(options.overrides);
  const groups = [];
  for (const keyword of unique) {
    let target = null;
    let best = null;
    for (const group of groups) {
      const comparisons = group.members.map(member => ({
        member,
        result: shouldJoin(keyword, member, threshold, maps)
      }));
      if (comparisons.some(item => item.result.reason === 'HUMAN_SPLIT_OVERRIDE')) continue;
      const forced = comparisons.find(item => item.result.reason === 'HUMAN_MERGE_OVERRIDE');
      const candidate = forced || comparisons
        .filter(item => item.result.join)
        .sort((a, b) => b.result.score - a.result.score)[0];
      if (candidate && (!best || candidate.result.score > best.score)) {
        target = group;
        best = { ...candidate.result, against: candidate.member };
      }
    }
    if (!target) {
      groups.push({ head: keyword, members: [keyword], reasons: [] });
      continue;
    }
    target.members.push(keyword);
    target.reasons.push({ keyword, against: best.against || target.head, ...best });
    target.head = canonicalHead(target.members);
  }

  return groups.map((group, index) => ({
    proposalId: 'GCEV1-' + String(index + 1).padStart(4, '0'),
    headKeyword: group.head,
    members: [...group.members].sort((a, b) => normalize(a).localeCompare(normalize(b))),
    productFamily: familyOf(group.head),
    commercialIntent: intentOf(group.head),
    method: VERSION,
    authority: 'PROPOSAL_ONLY',
    reasons: group.reasons
  }));
}

module.exports = Object.freeze({
  VERSION, normalize, meaningfulTokens, familyOf, intentOf,
  similarity, compatible, proposeClusters
});
