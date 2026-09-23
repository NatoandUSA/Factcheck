'use strict';

const https = require('node:https');
const crypto = require('node:crypto');

const DEFAULT_HOST = 'api.etsy.com';
const DEFAULT_PATH = '/v3/application/listings/active';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;

class EtsyOfficialSearchError extends Error {
  constructor(code, message, details = {}, status = 503) {
    super(message || code);
    this.name = 'EtsyOfficialSearchError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeQuery(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function apiKeyFromEnv(env = process.env) {
  const keystring = String(env.ETSY_OPEN_API_KEYSTRING || '').trim();
  const sharedSecret = String(env.ETSY_OPEN_API_SHARED_SECRET || '').trim();
  if (!keystring || !sharedSecret) {
    throw new EtsyOfficialSearchError(
      'ETSY_OFFICIAL_API_NOT_CONFIGURED',
      'Etsy Open API credentials are not configured.',
      {},
      503
    );
  }
  return `${keystring}:${sharedSecret}`;
}

function requestJson({ hostname, path, apiKey }, requestImpl = https.request) {
  return new Promise((resolve, reject) => {
    const req = requestImpl({
      protocol: 'https:',
      hostname,
      port: 443,
      method: 'GET',
      path,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        'user-agent': 'OmniSeller/BA1-Etsy-Capture'
      }
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          req.destroy(new EtsyOfficialSearchError(
            'ETSY_OFFICIAL_RESPONSE_TOO_LARGE',
            'Etsy Open API response exceeded the configured size limit.'
          ));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        const statusCode = Number(response.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          reject(new EtsyOfficialSearchError(
            'ETSY_OFFICIAL_HTTP_ERROR',
            `Etsy Open API returned HTTP ${statusCode}.`,
            { statusCode },
            statusCode === 401 || statusCode === 403 ? 503 : 502
          ));
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          reject(new EtsyOfficialSearchError(
            'ETSY_OFFICIAL_INVALID_JSON',
            'Etsy Open API returned unreadable JSON.'
          ));
          return;
        }
        resolve({ raw, parsed, statusCode, headers: response.headers || {} });
      });
    });
    req.setTimeout?.(TIMEOUT_MS, () => req.destroy(new EtsyOfficialSearchError(
      'ETSY_OFFICIAL_TIMEOUT',
      'Etsy Open API request timed out.'
    )));
    req.on('error', error => reject(error instanceof EtsyOfficialSearchError
      ? error
      : new EtsyOfficialSearchError('ETSY_OFFICIAL_NETWORK_ERROR', error.message)));
    req.end();
  });
}

function listingPriceAmount(listing) {
  const amount = listing?.price?.amount;
  const divisor = listing?.price?.divisor;
  if (!Number.isFinite(Number(amount)) || !Number.isFinite(Number(divisor)) || Number(divisor) <= 0) return null;
  return Number(amount) / Number(divisor);
}

function projectCapture({ queryPhrase, raw, parsed, capturedAt }) {
  const normalizedPhrase = normalizeQuery(queryPhrase);
  if (!normalizedPhrase || normalizedPhrase.length > 240) {
    throw new EtsyOfficialSearchError('ETSY_OFFICIAL_QUERY_INVALID', 'Etsy query is missing or invalid.', {}, 400);
  }
  const results = Array.isArray(parsed?.results) ? parsed.results : null;
  if (!results) {
    throw new EtsyOfficialSearchError('ETSY_OFFICIAL_RESPONSE_INVALID', 'Etsy Open API response is missing results.');
  }

  const sourceArtifactHash = sha256(raw);
  const capturedAtIso = capturedAt.toISOString();
  const captureId = 'etsy-open-api-' + sha256(JSON.stringify({
    provider: 'ETSY_OPEN_API_V3',
    endpoint: DEFAULT_PATH,
    query: normalizedPhrase,
    capturedAtIso,
    sourceArtifactHash
  }));
  const listingCount = Number.isFinite(Number(parsed?.count)) ? Number(parsed.count) : results.length;

  const listings = results.slice(0, 100).map(item => {
    const priceAmount = listingPriceAmount(item);
    return {
      listingId: item?.listing_id == null ? null : String(item.listing_id),
      title: typeof item?.title === 'string' ? item.title : null,
      url: typeof item?.url === 'string' ? item.url : null,
      priceAmount,
      fieldProvenance: {
        priceAmount: priceAmount == null ? null : {
          state: 'OBSERVED',
          source: 'ETSY_OPEN_API_V3',
          authority: 'SERVER_PROVIDER',
          allowedUse: 'RESEARCH_ONLY'
        }
      }
    };
  });

  return Object.freeze({
    phrase: normalizedPhrase,
    sourceFamily: 'ETSY_PUBLIC_SEARCH',
    authorityClassification: 'OBSERVED_PUBLIC',
    evidenceTier: 'E1_OBSERVED_PUBLIC',
    sourceArtifactType: 'ETSY_OPEN_API_SEARCH_CAPTURE',
    sourceArtifactId: captureId,
    sourceArtifactHash,
    provenance: Object.freeze({
      integrityOutcome: 'VALID',
      provider: 'ETSY_OPEN_API_V3',
      providerEndpoint: DEFAULT_PATH,
      sourceCapturedAt: capturedAtIso.slice(0, 10),
      sourceCapturedAtIso: capturedAtIso,
      sourceCaptureTimezoneOffsetMinutes: 0,
      sourceCapturedAtAuthority: 'SERVER_PROVIDER',
      sourceCapturedAtBasis: 'SERVER_RESPONSE_CAPTURE',
      queryBinding: Object.freeze({
        value: normalizedPhrase,
        state: 'OBSERVED',
        source: 'ETSY_OPEN_API_V3',
        authority: 'SERVER_PROVIDER',
        captureId,
        receiptId: null
      })
    }),
    commercialEvidence: Object.freeze({
      listingCount,
      listings,
      modeledFieldsRemainLabeled: true
    }),
    socialEvidence: Object.freeze({}),
    rawEvidence: Object.freeze({
      phrase: normalizedPhrase,
      supportScope: 'QUERY_RESULT_SET',
      resultCount: results.length,
      providerCount: listingCount,
      provider: 'ETSY_OPEN_API_V3'
    })
  });
}

async function captureOfficialEtsySearch(queryPhrase, options = {}) {
  const normalizedPhrase = normalizeQuery(queryPhrase);
  if (!normalizedPhrase || normalizedPhrase.length > 240) {
    throw new EtsyOfficialSearchError('ETSY_OFFICIAL_QUERY_INVALID', 'Etsy query is missing or invalid.', {}, 400);
  }
  const apiKey = apiKeyFromEnv(options.env || process.env);
  const params = new URLSearchParams({
    keywords: normalizedPhrase,
    limit: '100',
    sort_on: 'score',
    sort_order: 'desc'
  });
  const path = `${DEFAULT_PATH}?${params.toString()}`;
  const capturedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (Number.isNaN(capturedAt.getTime())) {
    throw new EtsyOfficialSearchError('ETSY_OFFICIAL_CAPTURE_TIME_INVALID', 'Server capture time is invalid.');
  }
  const response = await requestJson({
    hostname: options.hostname || DEFAULT_HOST,
    path,
    apiKey
  }, options.requestImpl);
  return Object.freeze({
    projection: projectCapture({
      queryPhrase: normalizedPhrase,
      raw: response.raw,
      parsed: response.parsed,
      capturedAt
    }),
    providerStatus: response.statusCode
  });
}

module.exports = Object.freeze({
  EtsyOfficialSearchError,
  captureOfficialEtsySearch,
  normalizeQuery,
  projectCapture
});
