import { projectVerifiedAiInput } from './aiTruthBoundary.js';

function parseCard(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

export function prepareVerifiedBatchRow(row) {
  const productId = row?.ProductId ?? row?.productId;
  const listingVersionRaw = row?.ListingVersion ?? row?.listingVersion;
  const listingVersion = Number(listingVersionRaw);
  const productTruthCard = parseCard(row?.ProductTruthCard ?? row?.productTruthCard);
  const projection = projectVerifiedAiInput({ productTruthCard, context: { productId, listingVersion } });
  if (!projection.eligible) {
    return Object.freeze({ eligible: false, code: 'UNQUALIFIED_BATCH_PRODUCT_TRUTH', projection });
  }

  const productType = typeof projection.facts.productType === 'string' ? projection.facts.productType.trim() : '';
  const occasion = typeof projection.facts.occasion === 'string' ? projection.facts.occasion.trim() : '';
  const materials = Array.isArray(projection.facts.materials)
    ? projection.facts.materials.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];

  return Object.freeze({
    eligible: true,
    code: 'VERIFIED_BATCH_PRODUCT_TRUTH',
    projection,
    aiInput: Object.freeze({
      productBrief: JSON.stringify(projection.facts),
      productType: productType || 'Verified Product',
      occasion,
      materials
    })
  });
}

export async function generateVerifiedBatchRow(row, generate, options = {}) {
  const prepared = prepareVerifiedBatchRow(row);
  if (!prepared.eligible) return Object.freeze({ generated: false, code: prepared.code, prepared });
  if (typeof generate !== 'function') throw new TypeError('AI_GENERATOR_REQUIRED');
  const category = options.category || { id: 'verified-product', name: prepared.aiInput.productType };
  const listing = await generate({
    category,
    productBrief: prepared.aiInput.productBrief,
    occasion: prepared.aiInput.occasion,
    tone: options.tone,
    materials: prepared.aiInput.materials,
    verifiedProjection: prepared.projection
  });
  return Object.freeze({ generated: true, code: 'VERIFIED_BATCH_GENERATED', prepared, listing });
}
