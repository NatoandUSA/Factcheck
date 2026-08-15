/**
 * Image Prompt Generation Engine for Amazon FBM/FBA & Etsy
 * Generates platform-compliant, photorealistic Midjourney / Imagen 3 / DALL-E prompts
 * strictly tailored to Amazon A10 Image Guidelines (10 listing images + 10 A+ modules)
 * and Etsy Best Seller Visual Guidelines (12 listing images).
 */

export function generateAmazonListingImagePrompts(productTitle, categoryName = 'Custom Gift', seedPhrase = '') {
  const baseSubject = productTitle || seedPhrase || `personalized ${categoryName}`;

  return [
    {
      slot: 'Image #1 - MAIN HERO (Amazon Compliance)',
      purpose: 'Pure white background, 85%+ frame fill, crisp 3D studio lighting',
      dimensions: '2000x2000 px (1:1 Ratio)',
      prompt: `Commercial product photography of ${baseSubject}, isolated on a flawless pure solid white background (#ffffff), perfectly centered, occupying 85% of the frame, ultra-sharp 8k resolution, cinematic studio lighting with soft natural drop shadow, high-end commercial e-commerce standard, no text, no watermarks, photorealistic.`
    },
    {
      slot: 'Image #2 - DIMENSIONS & SPECS INFOGRAPHIC',
      purpose: 'Accurate scale, metric & imperial dimensions, clean overlay',
      dimensions: '2000x2000 px',
      prompt: `Studio product shot of ${baseSubject} with sleek modern minimalist infographic measurement callouts, displaying clean height, width, and thickness arrows in metric and imperial units, crisp typography, premium dark slate overlay style, studio lighting.`
    },
    {
      slot: 'Image #3 - MATERIAL CRAFTSMANSHIP MACRO',
      purpose: 'Ultra close-up macro texture showing premium materials',
      dimensions: '2000x2000 px',
      prompt: `Extreme macro 100mm lens close-up photography of ${baseSubject}, highlighting the intricate laser-etched precision details, crystal-clear optical finish, fine thread texture, depth of field with creamy bokeh, warm artisan workshop atmosphere, 8k hyper-detailed.`
    },
    {
      slot: 'Image #4 - LIFESTYLE CONTEXT (IN-USE)',
      purpose: 'Placed naturally in modern luxury home interior',
      dimensions: '2000x2000 px',
      prompt: `Lifestyle interior photography featuring ${baseSubject} elegantly placed on a modern Scandinavian wooden desk next to a warm cup of coffee and soft green potted plant, bathed in golden hour natural window light, aesthetic cozy room decor vibe, architectural digest style.`
    },
    {
      slot: 'Image #5 - EMOTIONAL GIFT MOMENT',
      purpose: 'Gift-giving emotion, hands holding, anniversary/birthday joy',
      dimensions: '2000x2000 px',
      prompt: `Heartwarming lifestyle shot of a smiling woman receiving ${baseSubject} as a surprise gift from her partner, hands gently unwrapping the keepsake, genuine joyful emotional expression, soft ambient indoor lighting, authentic documentary style.`
    },
    {
      slot: 'Image #6 - 3 KEY BENEFIT CALLOUTS',
      purpose: 'Feature highlight breakdown with clean icons',
      dimensions: '2000x2000 px',
      prompt: `Commercial marketing graphic displaying ${baseSubject} flanked by three elegant icon callouts highlighting: [1. Fade-Proof UV Tech], [2. Solid Timber Base], [3. USB Plug & Play], clean modern tech aesthetic, crisp shadows.`
    },
    {
      slot: 'Image #7 - SIZE GUIDE & PROPORTIONS',
      purpose: 'Comparing size variations alongside everyday objects',
      dimensions: '2000x2000 px',
      prompt: `Side-by-side comparison studio shot showing different size variations of ${baseSubject}, aligned neatly on a light neutral stone surface, transparent measurement indicators, clean professional catalog presentation.`
    },
    {
      slot: 'Image #8 - LUXURY UNBOXING & PACKAGING',
      purpose: 'Custom gift box, velvet foam insert, ribbon ready',
      dimensions: '2000x2000 px',
      prompt: `High-end luxury unboxing photograph of ${baseSubject} nestled securely in a matte black velvet-lined embossed gift box, decorated with a silk satin gold ribbon, premium presentation ready to gift directly.`
    },
    {
      slot: 'Image #9 - CUSTOMIZATION HOW-TO GUIDE',
      purpose: 'Step 1-2-3 graphic showing buyer personalization process',
      dimensions: '2000x2000 px',
      prompt: `Clean step-by-step visual instructional infographic: Step 1 (Select Style) -> Step 2 (Type Custom Names/Date) -> Step 3 (We Handcraft & Ship in 24h), displaying mockup of ${baseSubject} alongside intuitive interface icons.`
    },
    {
      slot: 'Image #10 - USA WORKSHOP & QUALITY PROMISE',
      purpose: 'Artisan workshop seal, inspected by hand guarantee',
      dimensions: '2000x2000 px',
      prompt: `Authentic artisan workbench scene showing hands of a master craftsperson inspecting ${baseSubject} under focused work lamps, surrounded by woodworking and laser tools, embossed with a circular "100% Quality Inspected - USA Workshop" gold seal.`
    }
  ];
}

export function generateAmazonAPlusImagePrompts(productTitle, categoryName = 'Custom Gift') {
  const base = productTitle || `personalized ${categoryName}`;

  return [
    {
      moduleNum: 'A+ Module 1 - HERO STORY BANNER',
      dimensions: '970x600 px (Header Banner)',
      prompt: `Wide panoramic cinematic brand banner (970x600 aspect ratio) featuring ${base} surrounded by warm atmospheric lighting, artisan tools in soft focus background, dark elegant slate background with sophisticated gold foil typography space, luxury brand story aesthetic.`
    },
    {
      moduleNum: 'A+ Module 2 - CRAFTSMANSHIP SPOTLIGHT',
      dimensions: '970x300 px (Full Width Banner)',
      prompt: `Wide angle banner showing the precision laser engraving process creating ${base}, delicate blue laser glow capturing fine optical details, sparks of craftsmanship, clean modern industrial workshop vibe.`
    },
    {
      moduleNum: 'A+ Module 3 - MATERIALS DEEP DIVE',
      dimensions: '300x300 px (3-Feature Block 1)',
      prompt: `Macro photography of optical-grade shatterproof acrylic glass and solid European beechwood, showing natural wood grain and laser-beveled edges, studio lighting, clean minimal background.`
    },
    {
      moduleNum: 'A+ Module 4 - ILLUMINATION & FINISH',
      dimensions: '300x300 px (3-Feature Block 2)',
      prompt: `Warm soothing 3000K LED ambient glow radiating from the base of ${base} in a darkened cozy bedroom, peaceful evening nightstand setting, dreamy soft bokeh.`
    },
    {
      moduleNum: 'A+ Module 5 - GIFT-READY UNBOXING',
      dimensions: '300x300 px (3-Feature Block 3)',
      prompt: `Overhead flat-lay shot of luxury foil-stamped gift packaging, message card, and protective microfiber cloth accompanying ${base}, curated aesthetic presentation.`
    },
    {
      moduleNum: 'A+ Module 6 - MULTI-OCCASION SHOWCASE',
      dimensions: '970x300 px (Banner)',
      prompt: `Collage lifestyle banner showing ${base} styled for 3 occasions: Anniversary Dinner with candlelight, Mother's Day breakfast in bed, and modern office bookshelf display.`
    },
    {
      moduleNum: 'A+ Module 7 - COMPARISON MATRIX',
      dimensions: '970x300 px (Comparison Banner)',
      prompt: `Technical product visual illustrating "Our Optical Grade Acrylic vs Competitor Flimsy Plastic", demonstrating scratch resistance and solid wood stability, clear infographic style.`
    },
    {
      moduleNum: 'A+ Module 8 - STEP-BY-STEP PROCESS',
      dimensions: '300x300 px (Process Quad 1)',
      prompt: `Graphic showing digital line art transformation from customer photograph to finalized laser path for ${base}, high-tech creative design studio visual.`
    },
    {
      moduleNum: 'A+ Module 9 - SAFE SHIPPING & PACKAGING',
      dimensions: '300x300 px (Process Quad 2)',
      prompt: `Custom shockproof foam molded insert packaging protecting ${base}, demonstrating drop-tested durability and scratch-free arrival guarantee.`
    },
    {
      moduleNum: 'A+ Module 10 - BRAND HERITAGE & CARE',
      dimensions: '970x300 px (Footer Story Banner)',
      prompt: `Artisan workshop team assembling handcrafted personalized gifts, warm collaborative workspace in Austin Texas, commitment to sustainable timber and eco-friendly packaging.`
    }
  ];
}

export function generateEtsyListingImagePrompts(productTitle, categoryName = 'Custom Gift', seedPhrase = '') {
  const base = productTitle || seedPhrase || `handmade personalized ${categoryName}`;

  return [
    {
      slot: 'Etsy Photo #1 - PRIMARY THUMBNAIL (High CTR)',
      purpose: 'Warm, cozy maker aesthetic with natural sunlight & contrast',
      dimensions: '2700x2025 px (4:3 Ratio)',
      prompt: `Cozy Etsy top-seller product photography of ${base}, styled on a rustic natural wood table next to dried eucalyptus and a warm linen throw, bathed in soft afternoon sunbeams, gentle bokeh, authentic handcrafted maker vibe, 8k resolution, warm earthy tones.`
    },
    {
      slot: 'Etsy Photo #2 - FLAT LAY COMPOSITION',
      purpose: 'Overhead 90-degree aesthetic arrangement',
      dimensions: '2000x2000 px',
      prompt: `Artistic top-down flat lay photograph of ${base} surrounded by artisan craft elements: vintage scissors, raw cotton yarn, wooden stamps, and handwritten gift tag, textured stone linen backdrop, Pinterest aesthetic.`
    },
    {
      slot: 'Etsy Photo #3 - TEXTURE & DETAIL CLOSE-UP',
      purpose: 'Showcasing handmade quality, seams, engraving depth',
      dimensions: '2000x2000 px',
      prompt: `Intimate macro shot focusing on the crisp engraved lettering and tactile material grain of ${base}, shallow depth of field, natural morning window light, showcasing unmistakable handmade authenticity.`
    },
    {
      slot: 'Etsy Photo #4 - PERSONALIZATION GUIDE INFOGRAPHIC',
      purpose: 'How to enter custom names, dates, quotes in order box',
      dimensions: '2000x2000 px',
      prompt: `Pastel aesthetic infographic with clean handwriting typography: "How to Personalize Your Order: 1. Choose Size 2. Enter Names & Date in Personalization Box 3. We Craft with Love", illustrated with clean mockup of ${base}.`
    },
    {
      slot: 'Etsy Photo #5 - HANDHELD SCALE REFERENCE',
      purpose: 'Held in hands to give customers instant real-life scale',
      dimensions: '2000x2000 px',
      prompt: `Aesthetic lifestyle shot of two hands gently holding ${base} up against a cozy knit sweater background, giving natural scale and immediate tactile perspective, soft warm tone.`
    },
    {
      slot: 'Etsy Photo #6 - COLOR & MATERIAL SWATCHES',
      purpose: 'Clear view of available colors, wood finishes, or thread shades',
      dimensions: '2000x2000 px',
      prompt: `Organized sample palette display showing available finish options (e.g. Natural Beech, Dark Walnut, Rose Gold, Classic Silver) next to ${base}, labeled cleanly with minimalist font.`
    },
    {
      slot: 'Etsy Photo #7 - SIZING & FIT CHART (UNISEX / ROOM)',
      purpose: 'Dimensions and sizing guide tailored to buyer clarity',
      dimensions: '2000x2000 px',
      prompt: `Neutral minimalist sizing chart graphic for ${base}, showing clean silhouette with width and height measurements in inches and centimeters, easy to read on mobile screen.`
    },
    {
      slot: 'Etsy Photo #8 - HOME & ROOM DECOR STYLING',
      purpose: 'Showing how it elevates bedroom, nursery, or living room',
      dimensions: '2000x2000 px',
      prompt: `Interior styling shot of ${base} on a floating shelf among framed family photos, trailing ivy, and ceramic vases, warm glow in a cozy contemporary living room, styled for Home & Living category.`
    },
    {
      slot: 'Etsy Photo #9 - GIFT WRAP & KEEPSAKE BOX',
      purpose: 'Ribbon, wax seal, craft paper presentation',
      dimensions: '2000x2000 px',
      prompt: `Etsy-style gift wrapping presentation: ${base} packed inside a brown kraft box with custom botanical tissue paper, tied with twine string and dried lavender sprig with wax seal.`
    },
    {
      slot: 'Etsy Photo #10 - MAKER IN WORKSHOP (BEHIND THE SCENES)',
      purpose: 'Story of craftsmanship, human touch, small business feel',
      dimensions: '2000x2000 px',
      prompt: `Behind-the-scenes documentary style photo in a sunny artisan studio: craftsman in canvas apron carefully hand-finishing ${base}, sawdust and tools on workbench, authentic small shop maker story.`
    },
    {
      slot: 'Etsy Photo #11 - CARE & CLEANING INSTRUCTIONS',
      purpose: 'Guiding customers on washing/dusting/care',
      dimensions: '2000x2000 px',
      prompt: `Elegantly designed care instruction card mockup for ${base}: "Care Tips: Wipe with soft cloth, avoid harsh chemicals, display with love", botanical border illustrations.`
    },
    {
      slot: 'Etsy Photo #12 - 5-STAR REVIEW & SOCIAL PROOF',
      purpose: 'Buyer testimonials, customer love graphic',
      dimensions: '2000x2000 px',
      prompt: `Social proof graphic featuring 5 gold stars, quote: "The most meaningful gift I've ever purchased! Quality exceeded all expectations", overlaid tastefully on lifestyle photo of ${base}.`
    }
  ];
}
