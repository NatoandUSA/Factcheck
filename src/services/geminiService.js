import { CATEGORIES } from '../data/categoryPresets';
import { getUtf8Bytes } from '../utils/complianceValidator';

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

  let marketData = null;
  try {
    const marketRes = await fetch(`http://localhost:3001/api/market-data?category=${category?.name || 'All'}`);
    if (marketRes.ok) {
      marketData = await marketRes.json();
    }
  } catch (err) {
    console.warn('Could not fetch YTrends market data:', err);
  }

  // If active API Key is present, call Gemini API
  if (activeKey) {
    try {
      return await callGeminiApi({
        apiKey: activeKey,
        category,
        productBrief,
        occasion,
        tone,
        materials,
        imageBase64,
        marketData
      });
    } catch (err) {
      console.warn('Gemini API call failed, falling back to smart local model generator:', err);
      // Fall through to smart generator with note
      const fallbackResult = generateSmartLocalListing({ category, productBrief, occasion, tone, materials, marketData });
      fallbackResult.systemNote = `Generated via Local Fallback Engine (Gemini API Notice: ${err.message})`;
      return fallbackResult;
    }
  }

  // If no API key, use the built-in Smart Specialized Generator
  // Simulate natural AI thinking delay for smooth UX
  await new Promise(res => setTimeout(res, 850));
  return generateSmartLocalListing({ category, productBrief, occasion, tone, materials, marketData });
}

/**
 * Direct Gemini API call with structured JSON prompt
 */
async function callGeminiApi({ apiKey, category, productBrief, occasion, tone, materials, imageBase64, marketData }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const promptText = `
You are an elite E-Commerce Listing & SEO Specialist for Amazon FBM and Etsy specializing in personalized gifts (Jewelry, Acrylic lamps, Blankets, and Embroidery).

Generate an optimized, dual-marketplace listing package based on:
- Product Category: ${category?.name || 'Personalized Gift'}
- Product Brief / Details: ${productBrief}
- Target Occasion: ${occasion || 'Everyday / Milestone'}
- Desired Brand Tone: ${tone?.name || 'Heartfelt & High-Converting'}
- Materials / Specs: ${materials.join(', ')}
${marketData ? `
LIVE MARKET DATA (YTRENDS):
- Target Search Volume: ${marketData.searchVolume}
- Competition Score (Lower is better): ${marketData.competitionScore}
- Trending Keywords to Include: ${marketData.trendingKeywords.join(', ')}
` : ''}

STRICT MARKETPLACE RULES:
1. AMAZON FBM:
   - "amazonTitle": 130-180 characters, keyword-dense, title case, no banned claims (e.g. no "free shipping", "best seller", "guarantee").
   - "amazonBullets": EXACTLY 5 bullet points. Each MUST start with a CAPITALIZED HOOK in brackets like [PREMIUM CRAFTSMANSHIP] or [HEARTFELT GIFT READY].
   - "amazonSearchTerms": Generic backend keywords separated by SPACES ONLY, NO COMMAS, MUST be strictly under 240 bytes total.
   - "amazonDescription": Formatted HTML product description (<p>, <ul>, <strong>).
   - "amazonAPlusPoints": Array of 3 highlight story blurbs.

2. ETSY:
   - "etsyTitle": Under 140 characters, front-loaded with primary high-volume keywords, separated by | or comma.
   - "etsyTags": EXACTLY 13 tags. Each tag MUST be 20 characters or fewer (letters, numbers, spaces only).
   - "etsyMaterials": Array of 3-5 material strings.
   - "etsyPersonalizationInstructions": Clear instructions for buyer on how to submit personalization.
   - "etsyDescription": Engaging story-driven description with sections for Details, Sizing, How to Order, and Care Instructions.

Return ONLY a valid raw JSON object (without markdown code fences) with the following structure:
{
  "amazonTitle": "...",
  "amazonBullets": ["...", "...", "...", "...", "..."],
  "amazonSearchTerms": "...",
  "amazonDescription": "...",
  "amazonAPlusPoints": ["...", "...", "..."],
  "etsyTitle": "...",
  "etsyTags": ["...", ... (13 items, <=20 chars each)],
  "etsyMaterials": ["...", "..."],
  "etsyPersonalizationInstructions": "...",
  "etsyDescription": "..."
}
`;

  const contents = [];
  const parts = [{ text: promptText }];

  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (mimeMatch) {
      parts.push({
        inlineData: {
          mimeType: mimeMatch[1],
          data: mimeMatch[2]
        }
      });
    }
  }

  contents.push({ parts });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response received from AI model');

  const parsed = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
  return sanitizeListingOutput(parsed, category);
}

/**
 * Fallback / Demo Smart Listing Generator tuned specifically to your 4 categories
 */
function generateSmartLocalListing({ category, productBrief, occasion, tone, materials, marketData }) {
  const catId = category?.id || 'jewelry';
  const cleanBrief = (productBrief || category?.sampleBrief || 'Custom personalized keepsake').trim();
  const occ = occasion || 'Special Occasion';
  const matList = materials.length > 0 ? materials : (category?.defaultMaterials || ['Custom Materials']);

  let amazonTitle = '';
  let amazonBullets = [];
  let amazonSearchTerms = '';
  let amazonDescription = '';
  let amazonAPlusPoints = [];

  let etsyTitle = '';
  let etsyTags = [];
  let etsyMaterials = matList;
  let etsyPersonalizationInstructions = '';
  let etsyDescription = '';

  if (catId === 'jewelry') {
    amazonTitle = `Personalized Message Card Necklace Gift for ${occ} - Elegant Heart Pendant with Luxury Gift Box & Sentimental Keepsake Card`;
    amazonBullets = [
      `[SENTIMENTAL KEEPSAKE] Includes an emotional, professionally printed message card crafted to express unconditional love for your ${occ.toLowerCase()} celebration.`,
      `[PREMIUM CRAFTSMANSHIP] Features an artisan-crafted pendant made with ${matList[0]} and embellished with sparkling cubic zirconia crystals for radiant shine.`,
      `[ADJUSTABLE COMFORT FIT] Comes with an adjustable 18"-22" cable chain secured with an easy-to-use lobster clasp, designed for daily irritation-free wear.`,
      `[LUXURY GIFT-BOX READY] Elegantly packaged in a complimentary standard or upgradeable mahogany-style LED box, ready to gift directly upon arrival.`,
      `[HANDMADE WITH DEDICATION] Assembled with care to ensure every message card and jewelry piece arrives in pristine condition for an unforgettable unboxing.`
    ];
    amazonSearchTerms = 'wife anniversary gift message card necklace romantic jewelry birthday gifts mom pendant daughter soulmate forever love box';
    amazonDescription = `<p><strong>Celebrate Your Deepest Connection</strong></p><p>Surprise your loved one with a timeless jewelry piece accompanied by an unforgettable tribute card.</p><ul><li>Pendant Dimensions: 0.6" (15.7mm) height / 0.6" (15.7mm) width</li><li>Adjustable chain: 18" - 22" (45.72cm - 55.88cm)</li><li>Fast US fulfillment with careful packaging</li></ul>`;
    amazonAPlusPoints = [
      'Heartfelt Message Card included with custom sentiment',
      'Hypoallergenic, high-luster premium finish',
      'Designed to create tearful, happy memories'
    ];

    etsyTitle = `Personalized Message Card Necklace, ${occ} Gift for Wife, Custom Keepsake Jewelry, Sentimental Birthday Gift Box for Her`;
    etsyTags = [
      'wife anniversary', 'message card neck', 'custom jewelry', 'gift for wife', 
      'romantic keepsake', 'heart pendant', 'gift from husband', 'sentiment card', 
      'anniversary jewelry', 'luxury box neck', 'sparkle pendant', 'forever love', 'birthday for her'
    ];
    etsyPersonalizationInstructions = '1. Enter the recipient name or custom message request.\n2. Optional: Let us know if you want custom sign-off names at the bottom of the card.';
    etsyDescription = `✨ THE PERFECT SENTIMENTAL GIFT ✨\n\nCelebrate your special bond with this exquisite pendant necklace and custom heartfelt message card.\n\n✦ ITEM DETAILS ✦\n• Materials: ${matList.join(', ')}\n• Chain: 18"-22" Adjustable Cable Chain with Lobster Clasp\n• Presentation: Luxury Gift Box Included\n\n✦ HOW TO ORDER ✦\n1. Select your preferred gift box style.\n2. Add your personalization details in the box provided.\n3. Add to cart & checkout!\n\n✦ FAST SHIPPING ✦\nCarefully packaged and dispatched quickly from our US studio.`;

  } else if (catId === 'acrylic') {
    amazonTitle = `Custom Acrylic Song Plaque with LED Wood Light Base - Personalized Music Photo Night Lamp for Couples ${occ}`;
    amazonBullets = [
      `[CUSTOM SONG & PHOTO] Transform your favorite song and cherished photo into an illuminated glowing acrylic plaque that plays your special song via scannable code.`,
      `[CRYSTAL-CLEAR UV PRINTING] High-definition optical grade acrylic (5mm) printed with fade-resistant UV inks that stay vibrant for years without peeling.`,
      `[WARM AMBIENT LED BASE] Crafted with a natural solid beech wood base featuring warm glow LED lights, powered by a convenient USB cable with an on/off switch.`,
      `[MEMORABLE KEEPSAKE] Ideal personalized gift for ${occ.toLowerCase()}, wedding anniversaries, Valentine's Day, or memorializing a favorite milestone song.`,
      `[SAFE & PROTECTED SHIPPING] Shipped with double-sided protective peel-off film and custom foam cushioning to guarantee scratch-free delivery.`
    ];
    amazonSearchTerms = 'custom acrylic song plaque personalized night light scannable music photo lamp couples anniversary wedding song gift wood base';
    amazonDescription = `<p><strong>Light Up Your Favorite Song & Memory</strong></p><p>A stunning customized decorative night lamp featuring your picture, artist name, song title, and high-precision scannable code.</p><ul><li>Plaque Size: 6" x 8" (15cm x 20cm) optical acrylic</li><li>Base: Solid Beechwood LED stand with USB cord</li><li>Eco-friendly UV direct printing</li></ul>`;
    amazonAPlusPoints = [
      'Scannable Spotify / Music Code integration',
      'Solid Beechwood LED Base with soft ambient lighting',
      'Heavy-duty 5mm scratch-resistant acrylic'
    ];

    etsyTitle = `Custom Acrylic Song Plaque with LED Light, Personalized Music Photo Night Light, Anniversary Gift for Boyfriend, Couples Keepsake`;
    etsyTags = [
      'custom song plaque', 'acrylic night light', 'led photo lamp', 'music song plate',
      'anniversary gift', 'couples keepsake', 'spotify code frame', 'wood light base',
      'boyfriend gift', 'wedding song gift', 'custom photo lamp', 'acrylic music sign', 'scannable plaque'
    ];
    etsyPersonalizationInstructions = '1. Song Title & Artist Name\n2. Scannable Code link (Spotify / Apple Music)\n3. Custom Text / Date for the wood base (Optional)\n4. Send your high-res photo via Etsy Messages after ordering!';
    etsyDescription = `🎵 CAPTURE YOUR SONG IN A GLOWING KEEPSAKE 🎵\n\nTurn your song and favorite memory into a custom illuminated work of art.\n\n✦ SPECIFICATIONS ✦\n• Acrylic: 5mm Thick Crystal-Clear Acrylic\n• Light Base: Solid Beechwood with Warm White LEDs\n• Power: 5V USB cord with inline switch\n\n✦ HOW TO CUSTOMIZE ✦\n1. Provide Song Title + Artist in the personalization box.\n2. Complete your order.\n3. Send your photo via Etsy messages.\n\n✦ CARE INSTRUCTIONS ✦\nPeel off the protective brown backing paper upon arrival. Wipe with the included microfiber cloth.`;

  } else if (catId === 'blanket') {
    amazonTitle = `Personalized Family Name Throw Blanket for ${occ} - Ultra Soft Sherpa Fleece Custom Blanket with Family Names & Tree`;
    amazonBullets = [
      `[CUSTOM FAMILY KEEPSAKE] Personalize with up to 15 names and a customized title to celebrate family roots, grandparents, or milestone anniversaries.`,
      `[CLOUD-LIKE SOFTNESS] Made with ultra-plush premium microfleece top and cozy sherpa backing for maximum warmth without heavy weight.`,
      `[PERMANENT VIBRANT DYE] Sublimation dyed fibers ensure the custom names and designs will not fade, crack, or peel after repeated washing cycles.`,
      `[MULTIPLE SIZES AVAILABLE] Perfect for cozying up on the couch, bed throw, picnic blanket, or draped as a decorative room tapestry.`,
      `[EASY CARE & DURABILITY] 100% Machine washable on gentle cold cycle, tumble dry on low; wrinkle-resistant and lint-free.`
    ];
    amazonSearchTerms = 'customized grandma blanket personalized family name throw sherpa fleece personalized blanket cozy custom throw blanket gift';
    amazonDescription = `<p><strong>Wrap Your Loved Ones in Pure Warmth</strong></p><p>A custom designed heirloom blanket that keeps cherished family memories close every single day.</p><ul><li>Premium silky microfleece or warm sherpa</li><li>Hypoallergenic, breathable, lightweight warmth</li><li>Printed in the USA with eco-safe inks</li></ul>`;
    amazonAPlusPoints = [
      'Ultra-soft plush sherpa and microfleece blend',
      'Machine washable with zero fading or shedding',
      'Customized with all family member names'
    ];

    etsyTitle = `Personalized Grandma Blanket, Custom Family Name Throw, Sherpa Blanket for Mom Nana, ${occ} Keepsake Gift for Her`;
    etsyTags = [
      'custom blanket', 'grandma name throw', 'family tree blanket', 'sherpa throw',
      'gift for nana', 'cozy custom throw', 'mothers day blanket', 'personalized gift',
      'soft fleece blanket', 'grandchildren gift', 'family name blanket', 'customized throw', 'warm cozy gift'
    ];
    etsyPersonalizationInstructions = '1. Title (e.g. Grandma\'s Garden, The Miller Family, Nana\'s Blessings)\n2. List of Names (separated by commas)\n3. Est. Date or Quote (Optional)';
    etsyDescription = `🌿 WRAP THEM IN FAMILY LOVE 🌿\n\nShow Mom or Grandma how much she is cherished with a custom name throw blanket.\n\n✦ SIZES AVAILABLE ✦\n• 30" x 40" - Baby & Pet Lap Throw\n• 50" x 60" - Standard Couch Throw (Most Popular!)\n• 60" x 80" - Queen Bed & Full Snuggle Size\n\n✦ FABRIC CHOICES ✦\n• Smooth Micro-Fleece: Lightweight, silky & vibrant\n• Premium Sherpa: Fluffy fleece top with thick sherpa lining\n\n✦ CARE ✦\nMachine wash cold with mild detergent, tumble dry low.`;

  } else {
    // Embroidery
    amazonTitle = `Custom Embroidered Roman Numeral Hoodie with Sleeve Date & Initial Heart - Personalized Matching Couple Sweatshirt for ${occ}`;
    amazonBullets = [
      `[CUSTOM SLEEVE EMBROIDERY] Personalize with your special Roman numeral anniversary date on the sleeve and matching initial heart on the cuff.`,
      `[HIGH DENSITY STITCHING] Embroidered with industrial precision Madeira threads that never fray, fade, or wash out unlike heat transfer vinyl.`,
      `[HEAVYWEIGHT COMFORT] Made with an 8.0 oz pre-shrunk 80/20 cotton-poly blend for an ultra-soft fleece interior and cozy unisex fit.`,
      `[PERFECT MATCHING OUTFIT] Great for couples celebrating ${occ.toLowerCase()}, engagements, weddings, honeymoons, or long-distance relationships.`,
      `[AUTHENTIC CRAFT QUALITY] Carefully stitched and hand-trimmed by experienced embroidery artisans with reinforced double-needle seams.`
    ];
    amazonSearchTerms = 'custom embroidered hoodie matching couple sweatshirts roman numeral sleeve hoodie personalized line art sweater anniversary';
    amazonDescription = `<p><strong>Wear Your Love Story Every Day</strong></p><p>Elevate your wardrobe with custom embroidered couple hoodies featuring timeless Roman numeral dates and initial heart cuffs.</p><ul><li>Unisex Classic Fit - True to Size</li><li>High stitch-count industrial embroidery</li><li>Double-lined hood with color-matched drawcord</li></ul>`;
    amazonAPlusPoints = [
      'High-density stitch embroidery that lasts forever',
      'Cozy fleece interior for all-season comfort',
      'Custom Roman numeral anniversary conversion'
    ];

    etsyTitle = `Custom Embroidered Roman Numeral Hoodie, Couple Anniversary Sweatshirt with Sleeve Date, Initial Heart Jumper, ${occ} Gift`;
    etsyTags = [
      'embroidered hoodie', 'couple sweatshirt', 'roman numeral date', 'anniversary hoodie',
      'sleeve embroidery', 'matching couple gift', 'custom line art', 'boyfriend hoodie',
      'aesthetic jumper', 'initial heart cuff', 'custom couple gift', 'embroidered portrait', 'date on sleeve'
    ];
    etsyPersonalizationInstructions = '1. Date for Roman Numeral (e.g. 10/24/2020 -> X.XXIV.MMXX)\n2. Initial on cuff (e.g. Left Sleeve: K with small heart)\n3. Thread color (White, Black, Gold, Silver, Red, Pink)';
    etsyDescription = `🧵 CUSTOM EMBROIDERED COZY HOODIE 🧵\n\nA minimalist, aesthetic way to celebrate your anniversary, relationship, or special date.\n\n✦ HOODIE DETAILS ✦\n• 50/50 Soft Cotton Polyester Blend\n• Double-lined hood with matching drawstring\n• High-density professional embroidery\n\n✦ HOW TO ORDER ✦\n1. Select your size & hoodie color.\n2. In the personalization box, enter your date (we will convert it to Roman numerals for you!) and sleeve initials.\n3. Add to cart & checkout.\n\n✦ SIZING ✦\nUnisex standard fit. Size up 1-2 sizes for an oversized streetwear look!`;
  }

  // Ensure search terms UTF-8 bytes are strictly compliant
  if (getUtf8Bytes(amazonSearchTerms) > 240) {
    amazonSearchTerms = amazonSearchTerms.substring(0, 180);
  }

  return {
    amazonTitle,
    amazonBullets,
    amazonSearchTerms,
    amazonDescription,
    amazonAPlusPoints,
    etsyTitle,
    etsyTags,
    etsyMaterials,
    etsyPersonalizationInstructions,
    etsyDescription,
    generatedAt: new Date().toISOString()
  };
}

function sanitizeListingOutput(parsed, category) {
  // Ensure tags is array of strings <= 20 chars
  let cleanTags = Array.isArray(parsed.etsyTags) ? parsed.etsyTags : (category?.etsyTagsSeed || []);
  cleanTags = cleanTags.slice(0, 13).map(t => String(t).replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 20));

  // Ensure bullets is array of 5
  let cleanBullets = Array.isArray(parsed.amazonBullets) ? parsed.amazonBullets : [];
  if (cleanBullets.length < 5) {
    while (cleanBullets.length < 5) {
      cleanBullets.push(`[QUALITY GUARANTEE] Carefully inspected and packaged to ensure your personalized gift exceeds expectations.`);
    }
  }

  return {
    amazonTitle: parsed.amazonTitle || '',
    amazonBullets: cleanBullets.slice(0, 5),
    amazonSearchTerms: parsed.amazonSearchTerms || '',
    amazonDescription: parsed.amazonDescription || '',
    amazonAPlusPoints: Array.isArray(parsed.amazonAPlusPoints) ? parsed.amazonAPlusPoints : [],
    etsyTitle: parsed.etsyTitle || '',
    etsyTags: cleanTags,
    etsyMaterials: Array.isArray(parsed.etsyMaterials) ? parsed.etsyMaterials : (category?.defaultMaterials || []),
    etsyPersonalizationInstructions: parsed.etsyPersonalizationInstructions || '',
    etsyDescription: parsed.etsyDescription || '',
    generatedAt: new Date().toISOString()
  };
}
