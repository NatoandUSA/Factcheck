const cheerio = require('cheerio');
const fs = require('fs');

function observedIntegerText(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text || !/^-?\d+$/.test(text)) return null;
  return text;
}

function observedFloat(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) return null;
  const match = text.match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Parses YTrends HTML pages or CSV exports.
 * Missing source metrics remain null/UNKNOWN. Explicit source zero remains an
 * observation and is preserved through the upload adapter.
 */
function parseYTrendsHtml(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const keywords = [];
  const seen = new Set();

  // 1. Try parsing Table rows (Desktop view)
  $('tr').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length >= 8) {
      const kwAnchor = $(tds[1]).find('a').first();
      const kw = kwAnchor.text().trim() || $(tds[1]).text().trim();

      if (kw && !seen.has(kw.toLowerCase()) && !/rank|keyword|momentum/i.test(kw)) {
        const rank = $(tds[0]).text().trim() || null;
        const momentum = observedFloat($(tds[2]).text());
        const sold24h = observedIntegerText($(tds[3]).text());
        const views24h = observedIntegerText($(tds[4]).text());
        const listings = observedIntegerText($(tds[5]).text());
        const sellers = observedIntegerText($(tds[6]).text());
        const conversion = $(tds[7]).text().trim() || null;
        const avgRevenue = $(tds[8]).text().trim() || null;
        const action = $(tds[9]).text().trim() || null;
        const competition = $(tds[10]).text().trim() || null;

        keywords.push({
          keyword: kw,
          rank,
          momentum,
          sold24h,
          views24h,
          listings,
          sellers,
          conversion,
          avgRevenue,
          action,
          competition,
          source: 'YTrends HTML Table'
        });
        seen.add(kw.toLowerCase());
      }
    }
  });

  // 2. Fallback to Card elements (Mobile view) if table returned few items.
  if (keywords.length < 5) {
    $('.rounded-lg.border').each((i, el) => {
      const kwAnchor = $(el).find('a').first();
      const kw = kwAnchor.text().trim();

      if (kw && !seen.has(kw.toLowerCase()) && kw.length < 100) {
        const textContent = $(el).text();

        const soldMatch = textContent.match(/Sold 24h\s*([\d,]+)/i);
        const sold24h = soldMatch ? observedIntegerText(soldMatch[1]) : null;

        const viewsMatch = textContent.match(/Views 24h\s*([\d,]+)/i);
        const views24h = viewsMatch ? observedIntegerText(viewsMatch[1]) : null;

        const momentumMatch = textContent.match(/Momentum\s*(-?[\d.]+)/i);
        const momentum = momentumMatch ? observedFloat(momentumMatch[1]) : null;

        const convMatch = textContent.match(/Conversion\s*([\d.]+%\s*)/i);
        const conversion = convMatch ? convMatch[1].trim() : null;

        let competition = null;
        if (/Very High/i.test(textContent)) competition = 'Very High';
        else if (/High/i.test(textContent)) competition = 'High';
        else if (/Low/i.test(textContent)) competition = 'Low';
        else if (/Medium/i.test(textContent)) competition = 'Medium';

        keywords.push({
          keyword: kw,
          momentum,
          sold24h,
          views24h,
          conversion,
          competition,
          source: 'YTrends HTML Card'
        });
        seen.add(kw.toLowerCase());
      }
    });
  }

  return keywords;
}

function parseYTrendsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.html') || filePath.endsWith('.htm') || content.includes('<html')) {
    return parseYTrendsHtml(content);
  }
  return [];
}

module.exports = {
  parseYTrendsHtml,
  parseYTrendsFile
};
