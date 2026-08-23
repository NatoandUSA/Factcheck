/**
 * Image Prompt Generation Engine for Amazon FBM/FBA & Etsy
 * Generates platform-compliant, photorealistic Midjourney / Imagen 3 / DALL-E prompts
 * strictly tailored to Amazon A10 Image Guidelines (10 listing images + 10 A+ modules)
 * and Etsy Visual Guidelines (12 listing images).
 *
 * CRITICAL ZERO-FABRICATION CONTRACT:
 * Prompts must ONLY reflect verified product facts or neutral studio/lifestyle setups.
 * Never invent materials (e.g. acrylic, beechwood), origins (e.g. Austin Texas, USA workshop),
 * unverified turnaround (e.g. 24h shipping), or fake reviews/ratings.
 */

export function generateAmazonListingImagePrompts(productTitle, categoryName = 'Product', seedPhrase = '') {
  const baseSubject = productTitle || seedPhrase || categoryName;

  return [
    {
      slot: 'Image #1 - MAIN HERO (Amazon Compliance)',
      purpose: 'Pure white background, 85%+ frame fill, crisp 3D studio lighting',
      dimensions: '2000x2000 px (1:1 Ratio)',
      prompt: `Commercial product photography of ${baseSubject}, isolated on a flawless pure solid white background (#ffffff), perfectly centered, occupying 85% of the frame, ultra-sharp 8k resolution, cinematic studio lighting with soft natural drop shadow, high-end commercial e-commerce standard, no text, no watermarks, photorealistic.`
    },
    {
      slot: 'Image #2 - DIMENSIONS & SPECS INFOGRAPHIC',
      purpose: 'Accurate scale indicators, clean dimension callouts',
      dimensions: '2000x2000 px',
      prompt: `Studio product shot of ${baseSubject} with sleek modern minimalist infographic measurement callouts, displaying clean height, width, and depth guidelines in neutral studio lighting, crisp typography, clean dark slate overlay style.`
    },
    {
      slot: 'Image #3 - MATERIAL & CRAFTSMANSHIP MACRO',
      purpose: 'Ultra close-up macro texture showing fine craftsmanship',
      dimensions: '2000x2000 px',
      prompt: `Extreme macro 100mm lens close-up photography of ${baseSubject}, highlighting the authentic surface texture, fine finishing details, clean edges, depth of field with soft creamy bokeh, studio lighting, 8k resolution.`
    },
    {
      slot: 'Image #4 - LIFESTYLE CONTEXT (IN-USE)',
      purpose: 'Placed naturally in modern home or office interior',
      dimensions: '2000x2000 px',
      prompt: `Lifestyle interior photography featuring ${baseSubject} elegantly placed in a modern Scandinavian living space, natural window lighting, clean aesthetic room decor atmosphere, architectural digest style.`
    },
    {
      slot: 'Image #5 - GIFTING CONTEXT',
      purpose: 'Thoughtful gift presentation setting',
      dimensions: '2000x2000 px',
      prompt: `Heartwarming lifestyle composition featuring ${baseSubject} presented in a tasteful gifting occasion setting, soft ambient lighting, clean aesthetic presentation.`
    },
    {
      slot: 'Image #6 - KEY FEATURES OVERVIEW',
      purpose: 'Feature highlight breakdown with clean visual badges',
      dimensions: '2000x2000 px',
      prompt: `Commercial marketing graphic displaying ${baseSubject} with clean, modern layout highlighting product design highlights, balanced composition, crisp studio lighting.`
    },
    {
      slot: 'Image #7 - SCALE & PROPORTIONS',
      purpose: 'Displaying realistic product scale in context',
      dimensions: '2000x2000 px',
      prompt: `Side-by-side studio presentation showing ${baseSubject} alongside familiar everyday desk/home accessories to demonstrate realistic proportions, clean neutral background.`
    },
    {
      slot: 'Image #8 - PACKAGING & PRESENTATION',
      purpose: 'Secure packaging ready for transit',
      dimensions: '2000x2000 px',
      prompt: `Clean packaging photograph of ${baseSubject} neatly packed in a sturdy protective product box, clean minimalist unboxing layout, professional commercial presentation.`
    },
    {
      slot: 'Image #9 - DETAIL ANGLE SHOT',
      purpose: 'Alternative 45-degree angle showcasing form factor',
      dimensions: '2000x2000 px',
      prompt: `Dynamic 45-degree perspective product photography of ${baseSubject}, showcasing clean contours, balanced depth of field, premium studio lighting.`
    },
    {
      slot: 'Image #10 - QUALITY & CRAFT INSPECTION',
      purpose: 'Clean studio close-up showing quality finish',
      dimensions: '2000x2000 px',
      prompt: `Focused studio close-up of ${baseSubject} under soft diffused studio lighting, highlighting clean finish, precision assembly, and immaculate product presentation.`
    }
  ];
}

export function generateAmazonAPlusImagePrompts(productTitle, categoryName = 'Product') {
  const base = productTitle || categoryName;

  return [
    {
      moduleNum: 'A+ Module 1 - HERO STORY BANNER',
      dimensions: '970x600 px (Header Banner)',
      prompt: `Wide panoramic cinematic brand banner (970x600 aspect ratio) featuring ${base} with elegant diffused lighting, minimalist background with space for typography, premium brand story aesthetic.`
    },
    {
      moduleNum: 'A+ Module 2 - CRAFTSMANSHIP SPOTLIGHT',
      dimensions: '970x300 px (Full Width Banner)',
      prompt: `Wide angle banner showing precision production detail of ${base}, clean modern workshop environment, soft atmospheric lighting.`
    },
    {
      moduleNum: 'A+ Module 3 - SURFACE DETAIL',
      dimensions: '300x300 px (3-Feature Block 1)',
      prompt: `Macro detail photography of ${base}, showing clean texture, smooth surface finish, and refined edges, studio lighting.`
    },
    {
      moduleNum: 'A+ Module 4 - IN-USE ENVIRONMENT',
      dimensions: '300x300 px (3-Feature Block 2)',
      prompt: `Lifestyle product detail showing ${base} naturally styled in a modern interior setting, soft warm ambient lighting.`
    },
    {
      moduleNum: 'A+ Module 5 - PRODUCT PRESENTATION',
      dimensions: '300x300 px (3-Feature Block 3)',
      prompt: `Overhead flat-lay shot of ${base} paired with clean, protective presentation packaging, curated aesthetic.`
    },
    {
      moduleNum: 'A+ Module 6 - MULTI-OCCASION SHOWCASE',
      dimensions: '970x300 px (Banner)',
      prompt: `Collage lifestyle banner showing ${base} styled in multiple natural environments: home office desk, cozy living room shelf, and bedroom nightstand.`
    },
    {
      moduleNum: 'A+ Module 7 - SPECIFICATION OVERVIEW',
      dimensions: '970x300 px (Comparison Banner)',
      prompt: `Clean technical product visual displaying key structural and design features of ${base}, clear infographic composition.`
    },
    {
      moduleNum: 'A+ Module 8 - DESIGN DETAIL',
      dimensions: '300x300 px (Process Quad 1)',
      prompt: `Close-up design visual highlighting the thoughtful construction and clean aesthetic lines of ${base}.`
    },
    {
      moduleNum: 'A+ Module 9 - PACKAGING DETAIL',
      dimensions: '300x300 px (Process Quad 2)',
      prompt: `Protective packaging showcase for ${base}, demonstrating secure fit and safe transit presentation.`
    },
    {
      moduleNum: 'A+ Module 10 - BRAND PHILOSOPHY BANNER',
      dimensions: '970x300 px (Footer Story Banner)',
      prompt: `Wide banner showcasing ${base} in a bright, modern design studio setting, clean collaborative atmosphere, understated luxury aesthetic.`
    }
  ];
}

export function generateEtsyListingImagePrompts(productTitle, categoryName = 'Handmade Item', seedPhrase = '') {
  const base = productTitle || seedPhrase || categoryName;

  return [
    {
      slot: 'Etsy Photo #1 - PRIMARY THUMBNAIL (High CTR)',
      purpose: 'Warm, cozy maker aesthetic with natural sunlight & contrast',
      dimensions: '2700x2025 px (4:3 Ratio)',
      prompt: `Cozy product photography of ${base}, styled on a natural light wood table next to subtle neutral decor, bathed in soft afternoon sunbeams, gentle bokeh, authentic maker aesthetic, 8k resolution, warm earthy tones.`
    },
    {
      slot: 'Etsy Photo #2 - FLAT LAY COMPOSITION',
      purpose: 'Overhead 90-degree aesthetic arrangement',
      dimensions: '2000x2000 px',
      prompt: `Artistic top-down flat lay photograph of ${base} styled with minimalist neutral craft elements on a textured stone linen backdrop, clean Pinterest aesthetic.`
    },
    {
      slot: 'Etsy Photo #3 - TEXTURE & DETAIL CLOSE-UP',
      purpose: 'Showcasing quality finish and craftsmanship',
      dimensions: '2000x2000 px',
      prompt: `Macro 85mm lens close-up photography of ${base}, showcasing fine finish, seam and edge details, natural depth of field, warm diffused lighting.`
    },
    {
      slot: 'Etsy Photo #4 - LIFESTYLE HERO',
      purpose: 'In-use natural home environment',
      dimensions: '2000x2000 px',
      prompt: `Eye-level lifestyle photograph featuring ${base} styled inside a cozy modern home, warm ambient interior lighting, authentic comfortable vibe.`
    },
    {
      slot: 'Etsy Photo #5 - GIFTING PRESENTATION',
      purpose: 'Gift presentation aesthetic',
      dimensions: '2000x2000 px',
      prompt: `Aesthetic gift setup featuring ${base} alongside clean neutral wrapping and a blank greeting card, warm soft lighting.`
    },
    {
      slot: 'Etsy Photo #6 - SCALE IN HANDS',
      purpose: 'Showing realistic human scale and touch',
      dimensions: '2000x2000 px',
      prompt: `Close-up shot of gentle hands holding and interacting with ${base}, showing true physical proportions, soft natural window light.`
    },
    {
      slot: 'Etsy Photo #7 - MULTI-ANGLE PERSPECTIVE',
      purpose: 'Side & back angles showing complete 360 build',
      dimensions: '2000x2000 px',
      prompt: `Side and three-quarter angle composition showing full profile and depth of ${base}, soft natural shadows, clean neutral background.`
    },
    {
      slot: 'Etsy Photo #8 - PACKAGING & UNBOXING',
      purpose: 'Neat, protective unboxing experience',
      dimensions: '2000x2000 px',
      prompt: `Top-down unboxing shot of ${base} tucked carefully inside a clean eco-friendly kraft box with protective tissue paper, thoughtful unboxing presentation.`
    },
    {
      slot: 'Etsy Photo #9 - STYLING INSPIRATION',
      purpose: 'Styled on shelf or table display',
      dimensions: '2000x2000 px',
      prompt: `Decorative vignette showing ${base} styled naturally on an open oak shelf among small ceramic vases and art books, soft afternoon daylight.`
    },
    {
      slot: 'Etsy Photo #10 - STUDIO CLEAN SHOT',
      purpose: 'Clean minimal white/grey seamless backdrop',
      dimensions: '2000x2000 px',
      prompt: `High-key studio product shot of ${base} on a clean light grey seamless backdrop, soft diffused lighting, no distractions, catalog style.`
    },
    {
      slot: 'Etsy Photo #11 - PAIRING & COMPATIBILITY',
      purpose: 'Harmonious pairing with everyday lifestyle items',
      dimensions: '2000x2000 px',
      prompt: `Harmonious lifestyle still-life featuring ${base} alongside complementary daily essentials on a warm marble surface, soft focus background.`
    },
    {
      slot: 'Etsy Photo #12 - MAKER ATELIER MOOD',
      purpose: 'Artisan studio mood shot',
      dimensions: '2000x2000 px',
      prompt: `Artisan workbench setting with ${base} sitting in the foreground, soft-focus background of a clean bright creative maker studio, golden morning light.`
    }
  ];
}
