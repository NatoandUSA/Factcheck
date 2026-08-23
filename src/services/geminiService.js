import { CATEGORIES } from '../data/categoryPresets.js';
import { getUtf8Bytes } from '../utils/complianceValidator.js';
import { assertModelClaimsAuthorized, isAuthorizedAiProjection } from '../utils/aiTruthBoundary.js';
const STORAGE_KEY = 'omni_gemini_api_key';

export function getStoredApiKey() {
  // Remove credentials left by pre-PR-2C builds. Browser storage is not a
  // secret vault; provider calls now go through the authenticated backend.
  localStorage.removeItem(STORAGE_KEY);
  return '';
}

export function setStoredApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Generate high-converting Amazon & Etsy listing using Gemini or Smart Demo Engine
 */
export async function generateListingAI({
  category,
  productBrief,
  occasion,
  tone,
  materials = [],
  imageBase64 = null,
  apiKey = null,
  verifiedProjection = null
}) {
  if (!isAuthorizedAiProjection(verifiedProjection)) {
    const error = new Error('UNQUALIFIED_PRODUCT_TRUTH');
    error.code = 'UNQUALIFIED_PRODUCT_TRUTH';
    throw error;
  }
  const listing = await callGeminiApi({
    category,
    productBrief,
    occasion,
    tone,
    materials,
    imageBase64,
    verifiedProjection
  });
  return assertModelClaimsAuthorized(listing, verifiedProjection);
}

/**
 * Direct Gemini API call with structured JSON prompt
 */
async function callGeminiApi({ category, productBrief, occasion, tone, materials, imageBase64, marketData, verifiedProjection }) {
  const promptText = `
You are an elite, world-class E-Commerce Listing & SEO Specialist with deep mastery of the Amazon A10 Algorithm, Data Dive MKL methodology, and Etsy Search Algorithm.

PRODUCT INPUTS:
- Category: ${category?.name || 'Custom E-Commerce Product'}
- Product Brief / Details: ${productBrief || 'Custom personalized product'}
- Occasion: ${occasion || 'Anniversary / General Gift'}
- Brand Tone: ${tone || 'Modern & High-Converting'}
- Materials / Specs: ${materials.join(', ')}

Everything above is the ONLY real product information available. Do not
treat category names or generic phrasing as evidence of specific materials,
construction, or capabilities beyond what is stated.

PLATFORM-SPECIFIC KEYWORD & COPYWRITING STRATEGY:

1. AMAZON FBM & A10 ALGORITHM STRATEGY (Modern Concise Title Policy):
   - "amazonTitle": Concise (75-80 characters max), Title Case. Strictly front-load top 1-2 Golden root keywords and core USP within the first 75 characters for zero mobile truncation and Amazon algorithm compliance. Zero banned words (no "best seller", "free shipping", "guarantee", "perfect gift").
   - "amazonBullets": EXACTLY 5 bullet points (150-250 chars each). Each MUST start with a [CAPITALIZED HOOK] focusing on: [EMOTIONAL BENEFIT], [KEY FEATURE] (use only materials/specs actually given above, or a generic non-material hook like [EASY USAGE] if none were given), [EASY USAGE/FIT], [GIFT-GIVING OCCASION] (generic -- do not claim a specific presentation box/packaging unless given above), [WHY THEY'LL LOVE IT] (generic sentiment, not a care/material instruction unless given above).
   - "amazonSearchTerms": Space-separated generic keywords strictly under 240 UTF-8 bytes total. NO COMMAS. Include relevant long-tail synonyms, use cases, and alternative search queries not in the title.
   - "amazonDescription": High-converting HTML formatted product description (<p>, <ul>, <strong>). Use only the materials/specs actually given above; no invented care/packaging/manufacturing claims.
   - "amazonAPlusContent": A structured A+ Content Story Package containing:
     * "brandStoryHeadline": Compelling brand mission statement
     * "brandStoryBody": 2-3 sentences on brand dedication and emotional gifting
     * "modules": Array of 2 distinct A+ modules (no Specifications/Unboxing module -- no real specs exist unless given above):
       1. { "moduleType": "Hero Banner Story", "heading": "...", "body": "..." }
       2. { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] }

2. ETSY ALGORITHM & BUYER PSYCHOLOGY STRATEGY:
   - Note: Etsy buyers search for GIFT OCCASIONS, AESTHETICS, and HANDMADE CRAFTSMANSHIP (different from Amazon!).
   - "etsyTitle": Max 140 characters. Front-load the top gift recipient and occasion keyword in the first 40 characters for mobile Etsy search.
   - "etsyTags": EXACTLY 13 multi-word long-tail tags. Each tag MUST be 20 characters or fewer (letters, numbers, spaces only, no punctuation). Target recipient (e.g. "gift for husband"), occasion (e.g. "1st anniversary gift"), and handmade aesthetic (e.g. "custom wood plaque").
   - "etsyMaterials": If real materials/specs were given in PRODUCT INPUTS above, list ONLY those. If none were given, return an empty array -- do NOT invent material claims for a product you have no real data about.
   - "etsyPersonalizationInstructions": If PRODUCT INPUTS above state a real personalization mechanic, describe it. If none was given, return an empty string -- do NOT invent a personalization capability.
   - "etsyDescription": Warm, story-driven description structured into: ✨ ITEM DETAILS and ✦ HOW TO ORDER only. Use only the materials/specs actually given above; do not assert unverified specifications, care instructions, origin, or workshop claims.

Return ONLY a valid raw JSON object (without markdown code fences) with the exact structure:
{
  "amazonTitle": "...",
  "amazonBullets": ["...", "...", "...", "...", "..."],
  "amazonSearchTerms": "...",
  "amazonDescription": "...",
  "amazonAPlusContent": {
    "brandStoryHeadline": "...",
    "brandStoryBody": "...",
    "modules": [
      { "moduleType": "Hero Banner Story", "heading": "...", "body": "..." },
      { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] }
    ]
  },
  "etsyTitle": "...",
  "etsyTags": ["tag1", ... (13 items, <=20 chars each)],
  "etsyMaterials": [],
  "etsyPersonalizationInstructions": "",
  "etsyDescription": "..."
}
`;

  const response = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'COMMERCE_DRAFT',
      listingId: verifiedProjection.context.productId,
      expectedVersion: verifiedProjection.context.listingVersion,
      messages: [{ role: 'user', content: `Select a creative profile. Preferred tone: ${tone?.name || tone || 'warm'}.` }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Backend AI request failed');
  if (!data.listing) throw new Error('AI response did not contain a valid listing');
  return sanitizeListingOutput(data.listing, category);
}

function sanitizeListingOutput(parsed, category) {
  // Ensure tags is array of strings <= 20 chars
  let cleanTags = Array.isArray(parsed.etsyTags) ? parsed.etsyTags : (category?.etsyTagsSeed || []);
  cleanTags = cleanTags.slice(0, 13).map(t => String(t).replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 20));

  // Ensure bullets is array of 5 (Amazon requires exactly 5). Padding text
  // must not assert unverified process/handling facts ("carefully inspected
  // and packaged") -- use purely sentiment-based copy that makes no claim
  // about this specific product (GPT PR-10 re-audit).
  let cleanBullets = Array.isArray(parsed.amazonBullets) ? parsed.amazonBullets : [];
  if (cleanBullets.length < 5) {
    while (cleanBullets.length < 5) {
      cleanBullets.push(`[THOUGHTFUL GIFT] A meaningful choice for someone special -- great for any gifting occasion.`);
    }
  }

  return {
    amazonTitle: parsed.amazonTitle || '',
    amazonBullets: cleanBullets.slice(0, 5),
    amazonSearchTerms: parsed.amazonSearchTerms || '',
    amazonDescription: parsed.amazonDescription || '',
    // No fallback A+ content: when the AI didn't return usable content, leave
    // it empty rather than asserting unverified specific material or
    // manufacturing claims that a manager could approve without realizing
    // they were never real for this product.
    amazonAPlusContent: parsed.amazonAPlusContent || null,
    amazonAPlusPoints: Array.isArray(parsed.amazonAPlusPoints) ? parsed.amazonAPlusPoints : [],
    etsyTitle: parsed.etsyTitle || '',
    etsyTags: cleanTags,
    // category.defaultMaterials are unverified category-level suggestions, not
    // confirmed facts about this specific product -- never used as a silent
    // fallback for what the AI actually returned.
    etsyMaterials: Array.isArray(parsed.etsyMaterials) ? parsed.etsyMaterials : [],
    etsyPersonalizationInstructions: parsed.etsyPersonalizationInstructions || '',
    etsyDescription: parsed.etsyDescription || '',
    generatedAt: new Date().toISOString()
  };
}
