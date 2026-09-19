import { BANNED_AMAZON_TERMS } from '../data/categoryPresets.js';

/**
 * Calculates exact UTF-8 byte length for a string (Amazon Search Terms limit: 249 bytes)
 */
export function getUtf8Bytes(str) {
  if (!str) return 0;
  return new TextEncoder().encode(str.trim()).length;
}

/**
 * Validates Amazon Listing Components against marketplace rules
 */
export function validateAmazonListing(listing) {
  const issues = [];
  const warnings = [];

  // Title validation (Modern Amazon Mobile-First Policy: 75-80 chars)
  const titleLen = (listing?.amazonTitle || '').length;
  if (titleLen > 80) {
    warnings.push(`Amazon Title (${titleLen} ký tự) vượt quá 75-80 ký tự. Ứng dụng Amazon Mobile sẽ cắt cụt tiêu đề trên kết quả tìm kiếm. Khuyên dùng: 70-80 ký tự.`);
  } else if (titleLen < 40) {
    warnings.push(`Amazon Title khá ngắn (${titleLen} ký tự). Nên tối ưu khoảng 70-80 ký tự chứa Top 1-2 từ khóa Golden.`);
  }

  // Bullet points validation
  const bullets = listing?.amazonBullets || [];
  if (bullets.length !== 5) {
    warnings.push(`Amazon listing has ${bullets.length}/5 bullet points. 5 points recommended.`);
  }

  // Backend search terms validation (249 bytes max)
  const searchTerms = listing?.amazonSearchTerms || '';
  const searchTermsBytes = getUtf8Bytes(searchTerms);
  if (searchTermsBytes > 249) {
    issues.push(`Search Terms exceed Amazon limit: ${searchTermsBytes}/249 bytes.`);
  }

  if (searchTerms.includes(',')) {
    warnings.push('Search Terms contain commas. Amazon indexes spaces only; removing commas saves byte space.');
  }

  // Banned terms check
  const fullText = `${listing?.amazonTitle || ''} ${bullets.join(' ')} ${searchTerms}`.toLowerCase();
  for (const banned of BANNED_AMAZON_TERMS) {
    if (fullText.includes(banned)) {
      issues.push(`Contains prohibited claim: "${banned}". Amazon may suppress this listing.`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    searchTermsBytes,
    searchTermsBytesLeft: Math.max(0, 249 - searchTermsBytes)
  };
}

/**
 * Validates Etsy Listing Components against marketplace rules
 */
export function validateEtsyListing(listing) {
  const issues = [];
  const warnings = [];

  // Title validation (max 140 chars)
  const titleLen = (listing?.etsyTitle || '').length;
  if (titleLen > 140) {
    issues.push(`Etsy Title is ${titleLen} characters (Strict limit: 140)`);
  }
  const titleWords = (listing?.etsyTitle || '').trim().split(/\s+/).filter(Boolean);
  if (titleWords.length > 15) warnings.push(`Etsy Title has ${titleWords.length} words. Keep it clear and preferably 15 words or fewer.`);
  if (((listing?.etsyTitle || '').match(/,/g) || []).length >= 2) warnings.push('Etsy Title reads like a keyword chain. Use a clear product-led title instead of comma stuffing.');

  // Tags validation (13 tags, max 20 chars per tag)
  const tags = listing?.etsyTags || [];
  if (tags.length < 13) {
    warnings.push(`${tags.length}/13 relevant Etsy tags used. Add only accurate, non-duplicate tags; do not pad with unrelated terms.`);
  } else if (tags.length > 13) {
    issues.push(`${tags.length} tags provided. Etsy allows a maximum of 13 tags.`);
  }

  const invalidLengthTags = tags.filter(t => t.length > 20);
  if (invalidLengthTags.length > 0) {
    issues.push(`${invalidLengthTags.length} tag(s) exceed 20 characters: "${invalidLengthTags.join(', ')}"`);
  }
  const validTagPattern = /^[\p{L}\p{N}]+(?:[ '\-][\p{L}\p{N}]+)*$/u;
  const invalidCharacterTags = tags.filter(tag => !validTagPattern.test(String(tag).trim()));
  if (invalidCharacterTags.length > 0) {
    issues.push(`${invalidCharacterTags.length} tag(s) contain unsupported punctuation: "${invalidCharacterTags.join(', ')}"`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    tagsCount: tags.length,
    invalidLengthTags,
    invalidCharacterTags
  };
}
