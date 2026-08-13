export const CATEGORIES = [
  {
    id: 'jewelry',
    name: 'Custom Jewelry',
    badge: 'Jewelry & Gift Cards',
    icon: '✨',
    description: 'Personalized necklaces, message card boxes, birthstones, & engraved rings',
    defaultMaterials: ['Sterling Silver 925', '14k White Gold Finish', 'Stainless Steel', 'Cubic Zirconia'],
    suggestedAudiences: ['To My Wife', 'To My Daughter', 'To My Soulmate', 'To My Mom', 'To My Bestie'],
    sampleBrief: 'Heart pendant necklace with ribbon crystals, presented in a luxury gift box with an emotional message card from husband to wife on their 10th anniversary.',
    amazonKeywordsSeed: ['wife anniversary gift', 'message card necklace', 'romantic jewelry gift box', 'love knot necklace'],
    etsyTagsSeed: ['wife anniversary gift', 'message card necklace', 'gifts for wife', 'personalized jewelry', 'romantic necklace', 'forever love jewelry', 'heart pendant', 'gift from husband', 'sentiment gift card', '10th anniversary', 'luxury box necklace', 'sparkling pendant', 'custom keepsake']
  },
  {
    id: 'acrylic',
    name: 'Custom Acrylic',
    badge: 'LED Lamps & Plaques',
    icon: '💡',
    description: 'Custom song code plaques, LED night lights, acrylic family blocks & photo signs',
    defaultMaterials: ['Premium Crystal-Clear Acrylic (5mm)', 'Solid Wood LED Base', 'USB Power Cable', 'UV HD Printing'],
    suggestedAudiences: ['Couples', 'Music Lovers', 'New Parents', 'Pet Memorial', 'Office Gifts'],
    sampleBrief: 'Custom Spotify song plaque with personal photo and scannable code, mounted on a warm LED wooden light base with custom engraved names.',
    amazonKeywordsSeed: ['custom acrylic song plaque', 'personalized night light', 'scannable music photo lamp', 'couples anniversary plaque'],
    etsyTagsSeed: ['custom song plaque', 'acrylic night light', 'custom music plate', 'led photo lamp', 'anniversary gift', 'couples keepsake', 'spotify code frame', 'personalized plaque', 'usb wood lamp', 'boyfriend gift', 'wedding song gift', 'scannable acrylic', 'custom photo light']
  },
  {
    id: 'blanket',
    name: 'Custom Blanket',
    badge: 'Fleece & Sherpa',
    icon: '🛋️',
    description: 'Personalized name blankets, memorial collage throws, baby milestone blankets',
    defaultMaterials: ['Ultra-Soft Microfleece', 'Plush Sherpa Lining', 'Woven Jacquard Cotton', '30x40" / 50x60" / 60x80"'],
    suggestedAudiences: ['Grandma & Mom', 'Memorial / In Loving Memory', 'Newborn Baby', 'Dog / Cat Lovers', 'Graduates'],
    sampleBrief: 'Ultra-soft plush sherpa blanket customized with grandchildren names in a family tree layout with the quote "The love between a grandmother and grandchildren is forever".',
    amazonKeywordsSeed: ['customized grandma blanket', 'personalized family name throw', 'sherpa fleece personalized throw', 'cozy custom throw blanket'],
    etsyTagsSeed: ['custom blanket', 'grandma name blanket', 'personalized throw', 'family tree gift', 'sherpa throw blanket', 'gift for nana', 'cozy custom blanket', 'mothers day throw', 'customized gift', 'soft fleece blanket', 'grandchildren names', 'grandma christmas', 'warm cozy keepsake']
  },
  {
    id: 'embroidery',
    name: 'Custom Embroidery',
    badge: 'Hoodies & Apparel',
    icon: '🧵',
    description: 'Embroidered line art portrait hoodies, Roman numeral sleeve dates, custom hats',
    defaultMaterials: ['Heavyweight 80/20 Cotton-Poly Fleece', 'High-Density Madeira Thread', 'Ribbed Cuffs & Waistband'],
    suggestedAudiences: ['Couples / Matching Outfits', 'Pet Parents', 'Newlyweds', 'Car Lovers', 'Streetwear'],
    sampleBrief: 'Matching couple embroidered hoodies with custom outline portrait from customer photo on the chest and Roman numeral anniversary date + initial heart on the left sleeve.',
    amazonKeywordsSeed: ['custom embroidered hoodie', 'matching couple sweatshirts', 'roman numeral sleeve hoodie', 'personalized line art sweater'],
    etsyTagsSeed: ['embroidered hoodie', 'matching couple gift', 'custom photo sweater', 'roman numeral hoodie', 'custom line art', 'anniversary hoodie', 'sleeve date embroidery', 'personalized jumper', 'boyfriend hoodie', 'aesthetic sweatshirt', 'embroidered portrait', 'custom initial heart', 'trendy couple hoodie']
  }
];

export const OCCASIONS = [
  'Anniversary / Couples',
  'Mother\'s Day',
  'Father\'s Day',
  'Valentine\'s Day',
  'Christmas & Holidays',
  'Memorial / Sympathy',
  'Birthday',
  'Wedding & Bridal Shower',
  'Newborn & Baby Shower',
  'Graduation & Milestone'
];

export const TONES = [
  { id: 'heartfelt', name: 'Heartfelt & Emotional', desc: 'Warm, sentimental, focuses on the deep bond and gift-giving moment' },
  { id: 'modern', name: 'Modern & High-Converting', desc: 'Benefit-driven, keyword-optimized, crisp and persuasive' },
  { id: 'luxury', name: 'Luxury & Premium', desc: 'Elevated craftsmanship language, timeless elegance and gifting prestige' },
  { id: 'aesthetic', name: 'Trendy & Aesthetic (Etsy Style)', desc: 'Cozy, authentic maker vibes with story-driven tags' }
];

export const BANNED_AMAZON_TERMS = [
  'best seller', 'bestseller', 'free shipping', 'free delivery', 'money back guarantee', 
  '100% satisfaction guarantee', 'cheapest', 'lowest price', 'top rated', '#1 rated', 
  'perfect gift guaranteed', 'warranty for life', 'buy now'
];
