'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { parseEtsySearchInput } = require('../etsyPastedSearchParser');

const ADAPTER_ID = 'etsy-research-snapshot-v1';
const PARSER_ID = 'etsy-search-csv-v1';

function hashFiles(id, files) {
  const hash = crypto.createHash('sha256'); hash.update(id); hash.update('\0');
  for (const file of files) { hash.update(file.split(/[\\/]/).pop()); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); }
  return hash.digest('hex');
}

function parserBindingHash() {
  return hashFiles(PARSER_ID, [require.resolve('../etsyPastedSearchParser')]);
}

function bindingHash() {
  return hashFiles(ADAPTER_ID, [__filename, require.resolve('../etsyPastedSearchParser')]);
}

async function buildSnapshot(imports) {
  const sources = []; const observations = [];
  for (const row of imports) {
    if (row.kind !== 'ETSY_SEARCH') throw Object.assign(new Error('ETSY_IMPORT_KIND_UNSUPPORTED'), {
      code: 'ETSY_IMPORT_KIND_UNSUPPORTED', details: { importId: row.id, kind: row.kind }
    });
    const extension = String(row.file_name || '').split('.').pop().toUpperCase();
    const inputFormat = extension === 'CSV' ? 'CSV' : ['HTML', 'HTM'].includes(extension) ? 'HTML' : 'AUTO';
    if (!['CSV', 'HTML'].includes(inputFormat)) {
      throw Object.assign(new Error('ETSY_SEARCH_FILE_REQUIRED'), {
        code: 'ETSY_SEARCH_FILE_REQUIRED', details: { importId: row.id }
      });
    }
    const parsed = parseEtsySearchInput(Buffer.from(row.raw_bytes).toString('utf8'), inputFormat);
    const sellers = parsed.sellers.map(seller => ({ ...seller,
      provenance: { importId: row.id, sourceRow: seller.sourceRank + 1, rawHash: row.raw_hash } }));
    observations.push(...sellers);
    sources.push({ importId: row.id, kind: row.kind, rawHash: row.raw_hash, parserId: row.parser_id,
      parserHash: row.parser_hash, inputFormat: parsed.inputFormat, parserVersion: parsed.parserVersion,
      headerDiagnostics: parsed.headerDiagnostics, rowAccounting: parsed.rowAccounting });
  }
  const listingIds = new Set(observations.map(item => item.listingId).filter(Boolean));
  const queryContexts = [...new Set(observations.map(item => item.sourceHints?.keywordContext?.value).filter(Boolean))];
  return Object.freeze({
    observations: { marketplace: 'ETSY', sources, sellers: observations, queryContexts },
    accounting: { importCount: imports.length, inputRows: sources.reduce((sum, item) => sum + item.rowAccounting.inputRows, 0),
      observationCount: observations.length, uniqueExternalListingIds: listingIds.size,
      queryContextCount: queryContexts.length, unmappedColumns: [...new Set(sources.flatMap(item => item.headerDiagnostics.unmappedColumns || []))] },
    adapterBindingHash: bindingHash()
  });
}

module.exports = Object.freeze({ ADAPTER_ID, PARSER_ID, buildSnapshot, bindingHash, parserBindingHash });
