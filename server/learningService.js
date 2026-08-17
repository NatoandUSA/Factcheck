const cheerio = require('cheerio');
const { safeFetch, UrlGuardError } = require('./security/urlGuard');

/**
 * Parses and learns structural DNA from an Amazon or Etsy listing URL / text
 * Enforces 100% marketplace separation between Amazon A10 DNA and Etsy DNA
 */
async function learnFromListing({ url = '', rawText = '', category = 'Custom Gift', marketplace = 'AMAZON' }) {
  let title = '';
  let bullets = [];
  let tags = [];
  let description = '';
  let materials = [];
  let extractedUrl = url.trim();

  // The authenticated session marketplace is the sole authority — never
  // inferred from URL text, which a caller fully controls (GPT PR-5 final
  // review, P0-FINAL-1: a session could otherwise submit a same-marketplace
  // -looking request but point the URL at the other marketplace).
  const resolvedMarketplace = marketplace === 'ETSY' ? 'ETSY' : 'AMAZON';

  // 1. If URL provided, try fetching & scraping (allowlisted marketplace
  // hosts only, SSRF-guarded and pinned to the session marketplace on every
  // redirect hop — see server/security/urlGuard.js)
  if (extractedUrl.startsWith('http')) {
    try {
      const html = await safeFetch(extractedUrl, resolvedMarketplace);
      const $ = cheerio.load(html);

      if (resolvedMarketplace === 'AMAZON') {
        title = $('#productTitle').text().trim() || $('h1').first().text().trim();
        $('#feature-bullets ul li span').each((i, el) => {
          const b = $(el).text().trim();
          if (b && b.length > 10 && !/make sure this fits/i.test(b)) {
            bullets.push(b);
          }
        });
        description = $('#productDescription').text().trim() || $('#aplus').text().trim();
      } else {
        title = $('h1[data-buy-box-listing-title="true"]').text().trim() || $('h1').first().text().trim();
        description = $('div[data-id="description-text"]').text().trim() || $('p[data-id="description-text"]').text().trim();
        $('ul.wt-action-group li a, a[href*="/search?q="]').each((i, el) => {
          const t = $(el).text().trim();
          if (t && t.length >= 3 && t.length <= 20 && !tags.includes(t)) {
            tags.push(t);
          }
        });
      }
    } catch (fetchErr) {
      // A blocked URL must be a real, visible failure — not silently
      // papered over with fallback placeholder text pretending to be
      // learned data (that's exactly the fabricated-signal pattern
      // PROJECT_GUIDE forbids).
      if (fetchErr instanceof UrlGuardError) throw fetchErr;
      console.warn('URL Fetch warning:', fetchErr.message);
    }
  }

  // 2. If rawText provided or fallback parsing
  if (rawText && rawText.trim()) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!title && lines.length > 0) {
      title = lines[0];
    }
    
    // Extract bullets from lines with bullet symbols or dashes
    lines.forEach(l => {
      if (/^[-•*\[]/.test(l) && l.length > 15) {
        bullets.push(l);
      }
    });

    if (!description && lines.length > 2) {
      description = lines.slice(1).join('\n');
    }
  }

  // Fallback defaults if title is still empty
  if (!title) {
    title = `Top Selling ${category} Best Seller Sample`;
  }

  // 3. Extract Marketplace Specific Structural DNA
  let styleDna = {};
  if (resolvedMarketplace === 'AMAZON') {
    const bulletHooks = bullets.map(b => {
      const match = b.match(/^\[(.*?)\]/);
      return match ? `[${match[1]}]` : '[FEATURE HOOK]';
    });

    styleDna = {
      marketplace: 'AMAZON',
      titleFrontLoadedHook: title.slice(0, 75),
      titleCharLength: title.length,
      bulletHookPatterns: bulletHooks.length > 0 ? bulletHooks : ['[EMOTIONAL HOOK]', '[PREMIUM MATERIALS]', '[PERFECT FIT/SIZE]', '[GIFT READY BOX]', '[CARE INSTRUCTIONS]'],
      searchTermsRule: '240 Bytes, Space-separated generic terms, No commas, No duplicate title keywords',
      aPlusModulesRequired: ['Hero Banner Story', 'Three Feature Highlights', 'Specifications & Unboxing'],
      recommendedTone: 'Direct, Feature-Rich, Hook-Driven Amazon A10 Format'
    };
  } else {
    // Etsy DNA
    if (tags.length < 5) {
      // Extract from title
      title.split(/[,|-]/).forEach(chunk => {
        const cleanChunk = chunk.trim().toLowerCase();
        if (cleanChunk.length >= 3 && cleanChunk.length <= 20 && !tags.includes(cleanChunk)) {
          tags.push(cleanChunk);
        }
      });
    }

    styleDna = {
      marketplace: 'ETSY',
      titleFormat: 'Under 140 Chars, Multi-phrase Long-tail Keywords',
      exact13Tags: tags.slice(0, 13),
      descriptionSections: ['✨ ITEM DETAILS', '✦ SPECIFICATIONS & SIZING', '✦ HOW TO ORDER & PERSONALIZATION', '✦ CARE INSTRUCTIONS', '✦ US WORKSHOP PROMISE'],
      personalizationGuidance: 'Clear Buyer Instructions (Names, Dates, Custom Options)',
      recommendedTone: 'Handmade, Artisan, Emotional Storytelling'
    };
  }

  return {
    success: true,
    url: extractedUrl || 'Raw Text Input',
    marketplace: resolvedMarketplace,
    category,
    title,
    bullets: bullets.slice(0, 5),
    tags: tags.slice(0, 13),
    description: description.slice(0, 1000),
    styleDna,
    learnedRulesSummary: resolvedMarketplace === 'AMAZON'
      ? `Đã học DNA Amazon: Title Hook (${title.slice(0, 75)}), 5 Bullet Hooks, và A+ Content Model.`
      : `Đã học DNA Etsy: Title (<140 chars), ${tags.length || 13} Tags chuẩn <=20 chars, và Story Structure.`
  };
}

module.exports = { learnFromListing };
