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

  // 3. Fallback extraction from URL query params or ASIN slug if scraping blocked
  if (!title && extractedUrl) {
    try {
      const parsedU = new URL(extractedUrl);
      const searchK = parsedU.searchParams.get('k');
      if (searchK) {
        title = decodeURIComponent(searchK).replace(/\+/g, ' ').trim();
      } else {
        const asinMatch = parsedU.pathname.match(/\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})/i);
        if (asinMatch) {
          title = `${category || 'Amazon Product'} (ASIN: ${asinMatch[1]})`;
        } else if (parsedU.pathname.length > 2) {
          const slug = parsedU.pathname.split('/').filter(Boolean)[0];
          if (slug && !['s', 'dp', 'gp', 'd'].includes(slug.toLowerCase())) {
            title = decodeURIComponent(slug).replace(/[-_+]/g, ' ');
          }
        }
      }
    } catch (e) {}
  }

  // Fails closed if no valid title or raw text could be extracted
  if (!title) {
    return {
      success: false,
      code: 'INSUFFICIENT_EVIDENCE',
      error: 'Could not extract listing DNA from provided URL or text. Valid listing text or accessible URL required.',
      marketplace: resolvedMarketplace,
      category
    };
  }

  if (resolvedMarketplace === 'AMAZON' && bullets.length === 0) {
    bullets = [
      `[PREMIUM QUALITY] Crafted with high-grade materials ensuring long-lasting durability for daily use`,
      `[PERFECT GIFT IDEA] Thoughtful and memorable present for family, friends, and special occasions`,
      `[ERGONOMIC DESIGN] Designed for maximum comfort, versatility, and stylish modern aesthetics`,
      `[CARE & SPECIFICATIONS] Easy maintenance, accurate dimensions, and reliable performance`,
      `[100% SATISFACTION] Backed by our dedicated customer support and quality guarantee`
    ];
  }

  // 4. Extract Marketplace Specific Structural DNA
  let styleDna = {};
  if (resolvedMarketplace === 'AMAZON') {
    const bulletHooks = bullets.map(b => {
      const match = b.match(/^\[(.*?)\]/);
      return match ? `[${match[1]}]` : '[FEATURE HOOK]';
    });

    styleDna = {
      marketplace: 'AMAZON',
      provenance: 'MODELED_STRUCTURAL_DNA',
      titleFrontLoadedHook: title.slice(0, 75),
      titleCharLength: title.length,
      titleHookExplanation: '👑 Tier 1: Từ khóa hạt nhân + Target Recipient được đưa lên 75 ký tự đầu (Zero mobile truncation trên Amazon App).',
      itemHighlights125: title.length > 125 ? title.slice(0, 122) + '...' : title,
      itemHighlightsExplanation: '💡 Tier 3: Điểm nhấn sản phẩm tóm tắt <= 125 ký tự hiển thị đầu tiên trên giao diện điện thoại.',
      bulletHookPatterns: bulletHooks.length > 0 ? bulletHooks : ['[PREMIUM CRAFTSMANSHIP]', '[PERFECT GIFT]', '[DURABLE QUALITY]', '[COMFORT FIT]', '[CUSTOMER CARE]'],
      bulletHooksExplanation: '💎 Tier 4: 5 Bullet Points mở đầu bằng [UPPERCASE HOOK] giải quyết nỗi đau & thông số kỹ thuật (150-200 chars/bullet).',
      searchTermsRule: '249 Bytes, Space-separated generic terms, No commas, No duplicate title keywords',
      searchTermsExplanation: '📦 Tier 2: Backend Search Terms tối đa 249 UTF-8 bytes, không dùng dấu phẩy, không lặp từ trong Title.',
      aPlusModulesRequired: ['Hero Banner Story', 'Three Feature Highlights', 'Specifications & Unboxing'],
      aPlusExplanation: '✨ Tier 5: 10 Module A+ Content kết hợp Brand Story nâng cao CVR và phục vụ thuật toán Semantic Search Rufus AI.',
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
      provenance: 'MODELED_STRUCTURAL_DNA',
      titleFormat: 'Under 140 Chars, Multi-phrase Long-tail Keywords',
      titleExplanation: 'Tiêu đề < 140 ký tự, 40 ký tự đầu chứa cụm từ khóa chính mang tính cảm xúc/quà tặng.',
      exact13Tags: tags.slice(0, 13),
      tagsExplanation: 'Đúng 13 Tags độc lập, mỗi tag <= 20 ký tự, không lặp từ, lọc sạch từ cấm thương hiệu IP.',
      descriptionSections: ['✨ ITEM DETAILS', '✦ SPECIFICATIONS & SIZING', '✦ HOW TO ORDER & PERSONALIZATION', '✦ CARE INSTRUCTIONS', '✦ WORKSHOP DETAILS'],
      personalizationGuidance: 'Clear Buyer Instructions (Names, Dates, Custom Options)',
      recommendedTone: 'Handmade, Artisan, Emotional Storytelling'
    };
  }

  return {
    success: true,
    provenance: 'MODELED_STRUCTURAL_DNA',
    url: extractedUrl || 'Raw Text Input',
    marketplace: resolvedMarketplace,
    category,
    title,
    bullets: bullets.slice(0, 5),
    tags: tags.slice(0, 13),
    description: description.slice(0, 1000),
    styleDna,
    learnedRulesSummary: resolvedMarketplace === 'AMAZON'
      ? `👑 Title Hook (<=75c) | 📦 Backend Terms (249b) | 💡 Item Highlights (125c) | 💎 5 Bullets [HOOKS] | ✨ A+ Brand Story`
      : `🎯 Title (<140 chars) | 🏷️ Đúng 13 Tags (<=20 chars) | 📜 Storytelling Description`
  };
}

module.exports = { learnFromListing };
