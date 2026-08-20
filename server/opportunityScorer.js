/**
 * Opportunity Score Evaluator (L0-L4 Engine)
 * Ported directly from 22etsy-agent opportunity_score.py
 */

function calculateOpportunityScore(item = {}) {
  const hasObservedDemand = typeof item.searchVolume === 'number' || typeof item.demandScore === 'number';
  const hasObservedComp = typeof item.competitorCount === 'number' || typeof item.competitionIndex === 'number';

  // If real observed market evidence is absent, return UNSCORED with explicit provenance
  if (!hasObservedDemand || !hasObservedComp) {
    return {
      overallScore: null,
      verdict: 'UNSCORED',
      provenance: {
        status: 'INSUFFICIENT_MARKET_EVIDENCE',
        note: 'Requires real observed search volume and competitor count data'
      },
      metrics: {
        demandScore: null,
        competitionIndex: null,
        seoScore: null,
        designPotential: null
      }
    };
  }

  const demandScore = Math.min(100.0, Math.max(0.0, item.demandScore ?? (item.searchVolume ? Math.min(100, item.searchVolume / 100) : 0)));
  const competitionIndex = Math.min(100.0, Math.max(0.0, item.competitionIndex ?? (item.competitorCount ? Math.max(0, 100 - item.competitorCount / 50) : 0)));
  
  const kw = item.amazonTitle || item.etsyTitle || '';
  const wordCount = kw.trim().split(/\s+/).filter(Boolean).length;
  let seoScore = 50.0;
  if (wordCount >= 5 && wordCount <= 12) seoScore = 90.0;
  else if (wordCount > 12) seoScore = 80.0;
  else if (wordCount >= 1) seoScore = 60.0;

  const designPotential = Math.min(100.0, Math.max(0.0, competitionIndex));

  const overallScore = Math.round(
    demandScore * 0.35 +
    competitionIndex * 0.30 +
    seoScore * 0.20 +
    designPotential * 0.15
  );

  let verdict = 'UNSCORED';
  if (overallScore >= 80) verdict = 'GO';
  else if (overallScore >= 65) verdict = 'CONDITIONAL';
  else if (overallScore >= 50) verdict = 'WATCH';
  else verdict = 'SKIP';

  return {
    overallScore,
    verdict,
    provenance: {
      status: 'OBSERVED_EVIDENCE_SCORED',
      note: 'Scored against real observed market search volume and competitor metrics'
    },
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
