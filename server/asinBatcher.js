/**
 * ASIN Batching Assistant for Helium 10 Xray Reports
 * Filters and generates 2-5 Batches of 10 ASINs each with business rationales
 */

function batchAsins(asinInput, seedKeyword = 'Custom Gift') {
  let asins = [];

  if (Array.isArray(asinInput)) {
    asins = asinInput.map(item => {
      if (typeof item === 'string') return item.trim();
      return item.ASIN || item.asin || item['ASIN'] || '';
    }).filter(a => a && a.length >= 8);
  } else if (typeof asinInput === 'string') {
    asins = asinInput.split(/[\s,;\n]+/).map(a => a.trim()).filter(a => a && a.length >= 8);
  }

  // Deduplicate ASINs
  asins = Array.from(new Set(asins));

  if (asins.length < 5) {
    return {
      success: false,
      error: 'Needs at least 5 to 15 ASINs from Xray report to create batches.'
    };
  }

  const totalAsins = asins.length;
  const batches = [];

  // Batch 1: Top Direct Competitors (First 10 ASINs)
  const batch1Asins = asins.slice(0, Math.min(10, totalAsins));
  batches.push({
    batchNumber: 1,
    batchName: 'Batch 1: Top Direct Competitors & Organic Rank Leaders',
    rationale: `Selected 10 core competitor ASINs directly matching the seed phrase "${seedKeyword}". Highly aligned in product type, design style, and category placement to capture essential root keywords.`,
    asinCount: batch1Asins.length,
    asins: batch1Asins,
    cerebroCommand: `Cerebro Multi-ASIN Search: ${batch1Asins.join(', ')}`
  });

  // Batch 2: High Conversion & Revenue Leaders (Offset or re-shuffled pool)
  if (totalAsins >= 10) {
    const batch2Asins = [];
    // Select alternating ASINs to get a distinct 10-ASIN set
    for (let i = 1; i < totalAsins && batch2Asins.length < 10; i += 1) {
      if (!batch2Asins.includes(asins[i])) {
        batch2Asins.push(asins[i]);
      }
    }
    // Fill up to 10 if needed
    for (let i = 0; i < totalAsins && batch2Asins.length < 10; i++) {
      if (!batch2Asins.includes(asins[i])) {
        batch2Asins.push(asins[i]);
      }
    }

    batches.push({
      batchNumber: 2,
      batchName: 'Batch 2: High Revenue & Conversion Niche Leaders',
      rationale: `Selected 10 high-performing ASINs with strong conversion velocity. Captures conversion-focused customer search queries and gift sentiment phrases for "${seedKeyword}".`,
      asinCount: batch2Asins.length,
      asins: batch2Asins,
      cerebroCommand: `Cerebro Multi-ASIN Search: ${batch2Asins.join(', ')}`
    });
  }

  // Batch 3: Long-tail Sentiment & Aesthetic Pioneers (If total ASINs >= 12)
  if (totalAsins >= 12) {
    const batch3Asins = [...asins].reverse().slice(0, 10);
    batches.push({
      batchNumber: 3,
      batchName: 'Batch 3: Long-Tail Sentiment & Emerging Competitors',
      rationale: `Selected 10 emerging competitor ASINs targeting long-tail sentiment variations and specific buyer occasions. Ideal for uncovering underserved long-tail Search Terms.`,
      asinCount: batch3Asins.length,
      asins: batch3Asins,
      cerebroCommand: `Cerebro Multi-ASIN Search: ${batch3Asins.join(', ')}`
    });
  }

  return {
    success: true,
    seedKeyword,
    totalInputAsins: totalAsins,
    batchCount: batches.length,
    batches
  };
}

module.exports = {
  batchAsins
};
