'use strict';

const { fold, scanClaims } = require('./lexicalScanner');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const C = Object.freeze({
  MATERIAL: 'COMPOSITION_MATERIAL_PURITY',
  COMPONENT: 'COMPONENT_GEMSTONE_INCLUDED_PART',
  MEASURE: 'MEASURE_DIMENSION_WEIGHT_QUANTITY_CAPACITY',
  CAPABILITY: 'CAPABILITY_PERSONALIZATION_PROCESS',
  ORIGIN: 'ORIGIN_FACILITY_PRODUCTION_PARTNER',
  FULFILLMENT: 'FULFILLMENT_PROCESSING_DELIVERY',
  SOCIAL: 'SOCIAL_PROOF_RANK_CERTIFICATION',
  PACKAGING: 'PACKAGING_ACCESSORY_INCLUDED_EXTRA',
  SAFETY: 'SAFETY_MEDICAL_HEALTH_AGE_COMPLIANCE',
  PERFORMANCE: 'PERFORMANCE_DURABILITY_WATERPROOF_COMPATIBILITY',
  ENVIRONMENT: 'ENVIRONMENT_ETHICAL_SUSTAINABILITY',
  DIGITAL: 'DIGITAL_FORMAT_LICENSE_USAGE_RIGHT',
  COMMERCIAL: 'PRICE_DISCOUNT_SCARCITY_COMMERCIAL_PROMISE',
  COMPARATIVE: 'COMPARATIVE_SUPERLATIVE_EXCLUSIVITY'
});

// Identity paths are intentionally restricted to CAPABILITY. In particular,
// a product name/type cannot prove material, purity, measure, included items,
// packaging or fulfilment.
const FIELD_RULES = deepFreeze([
  { paths: ['productName', 'productType', 'identity.productName', 'identity.productType', 'productIdentity.productName', 'productIdentity.productType'], claimIds: [C.CAPABILITY], identity: true },
  { paths: ['materials', 'material', 'composition', 'purity'], claimIds: [C.MATERIAL] },
  { paths: ['gemstones', 'gemstone', 'components', 'includedItems'], claimIds: [C.COMPONENT] },
  { paths: ['sizes', 'size', 'dimensions', 'dimension', 'weight', 'quantity', 'capacity'], claimIds: [C.MEASURE] },
  { paths: ['capabilities', 'capability', 'personalization', 'process'], claimIds: [C.CAPABILITY] },
  { paths: ['origin', 'shipFrom', 'facility', 'productionPartner'], claimIds: [C.ORIGIN] },
  { paths: ['fulfillment', 'processingTime', 'delivery'], claimIds: [C.FULFILLMENT] },
  { paths: ['socialProof', 'rank', 'certifications'], claimIds: [C.SOCIAL] },
  { paths: ['packaging', 'accessories', 'includedExtras'], claimIds: [C.PACKAGING] },
  { paths: ['safety', 'medical', 'health', 'ageCompliance', 'compliance'], claimIds: [C.SAFETY] },
  { paths: ['performance', 'durability', 'compatibility', 'care'], claimIds: [C.PERFORMANCE] },
  { paths: ['environment', 'ethical', 'sustainability'], claimIds: [C.ENVIRONMENT] },
  { paths: ['digital', 'digitalDetails', 'fileFormat', 'license', 'usageRights'], claimIds: [C.DIGITAL] },
  { paths: ['priceClaims', 'discounts', 'scarcity', 'commercialPromises'], claimIds: [C.COMMERCIAL] },
  { paths: ['comparisons', 'superlatives', 'exclusivity'], claimIds: [C.COMPARATIVE] }
]);

const PERSONALIZATION_FAMILY = Object.freeze([
  'personalized', 'personalised', 'personalizado', 'personalizada',
  'customized', 'customised', 'customizable', 'custom', 'monogram', 'monogrammed'
]);

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value && value[key], object);
}

function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).filter(Boolean).join(' ');
  return value == null ? '' : String(value);
}

function claimKey(claim) {
  return `${claim.claimId}\u0000${fold(claim.token).replace(/\s+/g, ' ').trim()}`;
}

function buildCorroboration(truth = {}) {
  const supported = new Set();
  const sources = new Map();

  for (const rule of FIELD_RULES) {
    for (const path of rule.paths) {
      const text = textOf(valueAt(truth, path));
      if (!text.trim()) continue;
      for (const claim of scanClaims(text)) {
        if (!rule.claimIds.includes(claim.claimId)) continue;
        const key = claimKey(claim);
        supported.add(key);
        const paths = sources.get(key) || [];
        if (!paths.includes(path)) paths.push(path);
        sources.set(key, paths);
      }
    }
  }

  const personalization = textOf(valueAt(truth, 'personalization')) || textOf(valueAt(truth, 'capabilities.personalization'));
  if (personalization.trim()) {
    for (const token of PERSONALIZATION_FAMILY) {
      const key = claimKey({ claimId: C.CAPABILITY, token });
      supported.add(key);
      sources.set(key, ['personalization']);
    }
  }

  return Object.freeze({ supported, sources });
}

function corroborates(corroboration, claim) {
  return Boolean(corroboration && corroboration.supported && corroboration.supported.has(claimKey(claim)));
}

function unverifiedClaims(text, truthOrCorroboration = {}) {
  const corroboration = truthOrCorroboration.supported instanceof Set
    ? truthOrCorroboration
    : buildCorroboration(truthOrCorroboration);
  return scanClaims(text).filter(claim => !corroborates(corroboration, claim));
}

module.exports = Object.freeze({ C, FIELD_RULES, PERSONALIZATION_FAMILY, buildCorroboration, corroborates, unverifiedClaims });
