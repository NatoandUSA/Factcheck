import { CATEGORIES } from '../data/categoryPresets';
import { getUtf8Bytes } from '../utils/complianceValidator';
import { GoogleGenAI } from '@google/genai';

const STORAGE_KEY = 'omni_gemini_api_key';

export function getStoredApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setStoredApiKey(key) {
  if (key) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
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
  apiKey = null
}) {
  const activeKey = apiKey || getStoredApiKey();

  if (!activeKey) {
    throw new Error('Vui lòng cấu hình Gemini API Key (trong file .env hoặc nhấn nút Key ở góc phải trên) để sinh listing.');
  }

  return await callGeminiApi({
    apiKey: activeKey,
    category,
    productBrief,
    occasion,
    tone,
    materials,
    imageBase64
  });
}

/**
 * Direct Gemini API call with structured JSON prompt
 */
async function callGeminiApi({ apiKey, category, productBrief, occasion, tone, materials, imageBase64, marketData }) {
  const promptText = `
You are an elite, world-class E-Commerce Listing & SEO Specialist with deep mastery of the Amazon A10 Algorithm, Data Dive MKL methodology, and Etsy Search Algorithm.

PRODUCT INPUTS:
- Category: ${category?.name || 'Custom E-Commerce Product'}
- Product Brief / Details: ${productBrief || category?.sampleBrief || 'Custom personalized product'}
- Occasion: ${occasion || 'Anniversary / General Gift'}
- Brand Tone: ${tone || 'Modern & High-Converting'}
- Materials / Specs: ${materials.join(', ')}

PLATFORM-SPECIFIC KEYWORD & COPYWRITING STRATEGY:

1. AMAZON FBM & A10 ALGORITHM STRATEGY (Modern Concise Title Policy):
   - "amazonTitle": Concise (75-80 characters max), Title Case. Strictly front-load top 1-2 Golden root keywords and core USP within the first 75 characters for zero mobile truncation and Amazon algorithm compliance. Zero banned words (no "best seller", "free shipping", "guarantee", "perfect gift").
   - "amazonBullets": EXACTLY 5 bullet points (150-250 chars each). Each MUST start with a [CAPITALIZED HOOK] focusing on: [EMOTIONAL BENEFIT], [PREMIUM MATERIALS], [EASY USAGE/FIT], [GIFT PRESENTATION BOX], [ARTISAN QUALITY CARE].
   - "amazonSearchTerms": Space-separated generic keywords strictly under 240 UTF-8 bytes total. NO COMMAS. Include relevant long-tail synonyms, use cases, and alternative search queries not in the title.
   - "amazonDescription": High-converting HTML formatted product description (<p>, <ul>, <strong>).
   - "amazonAPlusContent": A structured A+ Content Story Package containing:
     * "brandStoryHeadline": Compelling brand mission statement
     * "brandStoryBody": 2-3 sentences on brand dedication and emotional gifting
     * "modules": Array of 3 distinct A+ modules:
       1. { "moduleType": "Hero Banner Story", "heading": "...", "body": "..." }
       2. { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] }
       3. { "moduleType": "Product Specifications & Gift Unboxing", "heading": "...", "body": "..." }

2. ETSY ALGORITHM & BUYER PSYCHOLOGY STRATEGY:
   - Note: Etsy buyers search for GIFT OCCASIONS, AESTHETICS, and HANDMADE CRAFTSMANSHIP (different from Amazon!).
   - "etsyTitle": Max 140 characters. Front-load the top gift recipient and occasion keyword in the first 40 characters for mobile Etsy search.
   - "etsyTags": EXACTLY 13 multi-word long-tail tags. Each tag MUST be 20 characters or fewer (letters, numbers, spaces only, no punctuation). Target recipient (e.g. "gift for husband"), occasion (e.g. "1st anniversary gift"), and handmade aesthetic (e.g. "custom wood plaque").
   - "etsyMaterials": Array of 3-5 authentic handmade material strings.
   - "etsyPersonalizationInstructions": Step-by-step buyer guide on how to provide personalization details.
   - "etsyDescription": Warm, story-driven description structured into: ✨ ITEM DETAILS, ✦ SPECIFICATIONS, ✦ HOW TO ORDER, ✦ CARE INSTRUCTIONS, and ✦ US WORKSHOP PROMISE.

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
      { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] },
      { "moduleType": "Product Specifications & Gift Unboxing", "heading": "...", "body": "..." }
    ]
  },
  "etsyTitle": "...",
  "etsyTags": ["tag1", ... (13 items, <=20 chars each)],
  "etsyMaterials": ["...", "..."],
  "etsyPersonalizationInstructions": "...",
  "etsyDescription": "..."
}
`;

  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create({
    model: 'gemini-3.6-flash',
    input: promptText,
    system_instruction: "You are an elite E-Commerce Listing & SEO Specialist for Amazon A10 & Etsy. Return ONLY raw valid JSON without markdown code fences.",
  });

  const rawText = interaction.output_text;
  if (!rawText) throw new Error('Empty response received from AI model');

  const parsed = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
  return sanitizeListingOutput(parsed, category);
}

function sanitizeListingOutput(parsed, category) {
  // Ensure tags is array of strings <= 20 chars
  let cleanTags = Array.isArray(parsed.etsyTags) ? parsed.etsyTags : (category?.etsyTagsSeed || []);
  cleanTags = cleanTags.slice(0, 13).map(t => String(t).replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 20));

  // Ensure bullets is array of 5
  let cleanBullets = Array.isArray(parsed.amazonBullets) ? parsed.amazonBullets : [];
  if (cleanBullets.length < 5) {
    while (cleanBullets.length < 5) {
      cleanBullets.push(`[QUALITY CRAFTSMANSHIP] Carefully inspected and packaged to ensure your personalized gift arrives in pristine condition.`);
    }
  }

  return {
    amazonTitle: parsed.amazonTitle || '',
    amazonBullets: cleanBullets.slice(0, 5),
    amazonSearchTerms: parsed.amazonSearchTerms || '',
    amazonDescription: parsed.amazonDescription || '',
    amazonAPlusContent: parsed.amazonAPlusContent || {
      brandStoryHeadline: 'Heartfelt Keepsakes Crafted with Dedication',
      brandStoryBody: 'Creating meaningful personalized gifts that celebrate the bond of love, family, and lifelong memories.',
      modules: [
        { moduleType: 'Hero Banner Story', heading: 'Artisan Crafted in USA', body: 'Hand-assembled using optical-grade materials and precision UV printing.' },
        { moduleType: 'Three Feature Highlights', features: [{ title: 'Crisp Detail', desc: 'Fade-proof clarity.' }, { title: 'Premium Base', desc: 'Solid wood build.' }, { title: 'Gift Ready', desc: 'Includes luxury box.' }] },
        { moduleType: 'Product Specifications', heading: 'Dimensions & Care', body: 'Wipe with microfiber cloth.' }
      ]
    },
    amazonAPlusPoints: Array.isArray(parsed.amazonAPlusPoints) ? parsed.amazonAPlusPoints : [],
    etsyTitle: parsed.etsyTitle || '',
    etsyTags: cleanTags,
    etsyMaterials: Array.isArray(parsed.etsyMaterials) ? parsed.etsyMaterials : (category?.defaultMaterials || []),
    etsyPersonalizationInstructions: parsed.etsyPersonalizationInstructions || '',
    etsyDescription: parsed.etsyDescription || '',
    generatedAt: new Date().toISOString()
  };
}
