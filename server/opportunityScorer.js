/**
 * Opportunity Score Evaluator (L0-L4 Engine)
 * Ported directly from 22etsy-agent opportunity_score.py
 */

function calculateOpportunityScore(item) {
  const category = item.categoryName || item.category || 'General';
  const kw = item.amazonTitle || item.etsyTitle || '';
  
  // 1. Demand Score (0-100): Based on keyword search volume / length & intent
  let demandScore = 75.0;
  if (kw.length > 50) demandScore += 10.0;
  if (/personalized|custom|engraved|embroidered/i.test(kw)) demandScore += 10.0;
  demandScore = Math.min(100.0, Math.max(20.0, demandScore));

  // 2. Competition Index (0-100): Lower saturation = better score
  let competitionIndex = 68.0;
  if (category === 'Jewelry') competitionIndex = 45.0; // High competition
  else if (category === 'Embroidery') competitionIndex = 82.0; // Low competition
  else if (category === 'Blanket') competitionIndex = 72.0;

  // 3. SEO Score (0-100): Graded by phrase length and front-loaded keywords
  const wordCount = kw.trim().split(/\s+/).length;
  let seoScore = 60.0;
  if (wordCount >= 5 && wordCount <= 12) seoScore = 90.0; // Ideal buyer long-tail
  else if (wordCount > 12) seoScore = 80.0;
  else if (wordCount < 4) seoScore = 50.0;

  // 4. Design Potential (0-100): Higher in less saturated niches
  let designPotential = Math.min(95.0, Math.max(30.0, competitionIndex + 10.0));

  // Overall Weighted Score: Market (35%), Competition (30%), SEO (20%), Design (15%)
  const overallScore = Math.round(
    demandScore * 0.35 +
    competitionIndex * 0.30 +
    seoScore * 0.20 +
    designPotential * 0.15
  );

  // Verdict Determination
  let verdict = 'GO';
  if (overallScore >= 80) verdict = 'GO';
  else if (overallScore >= 65) verdict = 'CONDITIONAL';
  else if (overallScore >= 50) verdict = 'WATCH';
  else verdict = 'SKIP';

  return {
    overallScore,
    verdict,
    metrics: {
      demandScore: Math.round(demandScore),
      competitionIndex: Math.round(competitionIndex),
      seoScore: Math.round(seoScore),
      designPotential: Math.round(designPotential)
    }
  };
}

module.exports = {
  calculateOpportunityScore
};
