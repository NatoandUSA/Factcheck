import { projectVerifiedAiInput, verifiedSubject } from '../utils/aiTruthBoundary.js';

function makePromptSet(envelope, platform, includeAPlus = false) {
  const projection = projectVerifiedAiInput(envelope);
  const subject = verifiedSubject(projection);
  if (!subject) return [];

  const slots = includeAPlus ? [
    ['A+ Module 1 - VERIFIED PRODUCT HERO', '970x600 px', `Wide product banner featuring the verified ${subject}, neutral studio background, diffused lighting, blank space for separately reviewed copy.`],
    ['A+ Module 2 - VERIFIED PRODUCT ANGLES', '970x300 px', `Multiple neutral studio angles of the same verified ${subject}, consistent form and appearance, no text or unsupported feature callouts.`],
    ['A+ Module 3 - VERIFIED DETAIL', '300x300 px', `Close-up studio photograph of the verified ${subject}, showing only visually observable surface and form, no material, origin, performance, or quality claims.`]
  ] : [
    [`${platform} Image 1 - NEUTRAL HERO`, '2000x2000 px', `Commercial studio photograph of the verified ${subject}, centered on a clean neutral background, no text, badges, reviews, measurements, packaging, or unsupported accessories.`],
    [`${platform} Image 2 - ALTERNATE ANGLE`, '2000x2000 px', `Three-quarter studio view of the same verified ${subject}, consistent appearance and scale, soft neutral lighting, no factual overlays.`],
    [`${platform} Image 3 - OBSERVABLE DETAIL`, '2000x2000 px', `Close-up photograph of the verified ${subject}, limited to visually observable form and surface, no material, construction, origin, performance, or care claims.`],
    [`${platform} Image 4 - SCALE REVIEW SLOT`, '2000x2000 px', `Review mockup of the verified ${subject} with an intentionally blank scale-reference area; add dimensions only after separate evidence-bound verification.`]
  ];

  return slots.map(([slot, dimensions, prompt]) => ({
    slot,
    moduleNum: includeAPlus ? slot : undefined,
    purpose: 'Evidence-bound image planning; factual overlays require separate verified evidence.',
    dimensions,
    prompt,
    evidenceContext: projection.context
  }));
}

export function generateAmazonListingImagePrompts(envelope) {
  return makePromptSet(envelope, 'Amazon');
}

export function generateAmazonAPlusImagePrompts(envelope) {
  return makePromptSet(envelope, 'Amazon', true);
}

export function generateEtsyListingImagePrompts(envelope) {
  return makePromptSet(envelope, 'Etsy');
}
