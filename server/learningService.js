const cheerio = require('cheerio');

/**
 * Parses and learns structural DNA from an Amazon / Etsy URL or raw text
 */
async function learnFromListing({ url = '', rawText = '', category = 'Custom Gift', marketplace = 'AMAZON' }) {
  let title = '';
  let bullets = [];
  let tags = [];
  let description = '';
  let materials = [];
  let extractedUrl = url.trim();

  // 1. If URL provided, try fetching & scraping
  if (extractedUrl.startsWith('http')) {
    try {
      const response = await fetch(extractedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      if (extractedUrl.includes('amazon.')) {
        title = $('#productTitle').text().trim() || $('h1').first().text().trim();
        $('#feature-bullets ul li span').each((i, el) => {
          const b = $(el).text().trim();
          if (b && b.length > 10 && !/make sure this fits/i.test(b)) {
            bullets.push(b);
          }
        });
        description = $('#productDescription').text().trim() || $('#aplus').text().trim();
      } else if (extractedUrl.includes('etsy.')) {
        title = $('h1[data-buy-box-listing-title="true"]').text().trim() || $('h1').first().text().trim();
        description = $('div[data-id="description-text"]').text().trim() || $('p[data-id="description-text"]').text().trim();
        $('ul.wt-action-group li a').each((i, el) => {
          const t = $(el).text().trim();
          if (t && t.length <= 20) tags.push(t);
        });
      }
    } catch (fetchErr) {
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
      if (/^[-•*\[]/.test(l) && l.length > 20) {
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

  // 3. Extract Structural DNA & Few-Shot Guide
  const bulletHooks = bullets.map(b => {
    const match = b.match(/^\[(.*?)\]/);
    return match ? `[${match[1]}]` : '[FEATURE HOOK]';
  });

  const styleDna = {
    titleWordCount: title.split(/\s+/).length,
    titleCharLength: title.length,
    bulletHookPatterns: bulletHooks.length > 0 ? bulletHooks : ['[EMOTIONAL HOOK]', '[PREMIUM MATERIALS]', '[PERFECT FIT/SIZE]', '[GIFT READY BOX]', '[CARE INSTRUCTIONS]'],
    hasSpanishNiche: /para|suerte|mama|regalo|esposa/i.test(title + ' ' + description),
    recommendedTone: 'High-Converting Emotional Storytelling with Clear Specifications',
    shippingPolicyPattern: '⚡ Handcrafted & Dispatched in 24-48 Hours from USA Workshop.'
  };

  return {
    success: true,
    url: extractedUrl || 'Raw Text Input',
    marketplace: extractedUrl.includes('etsy.') ? 'ETSY' : marketplace,
    category,
    title,
    bullets: bullets.slice(0, 5),
    tags: tags.slice(0, 13),
    description: description.slice(0, 1000),
    styleDna,
    learnedRulesSummary: `Đã học cấu trúc: Tiêu đề (${title.length} chars), ${bullets.length || 5} Bullet Hooks, và Tone văn phong thực chiến.`
  };
}

module.exports = { learnFromListing };
