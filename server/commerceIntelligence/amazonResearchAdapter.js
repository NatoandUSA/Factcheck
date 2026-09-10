'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { fold } = require('./text');
const { normalizeCerebroRows, normalizeXrayRows } = require('./storedResearch');
const { readAllWorksheetsBuffer } = require('../services/spreadsheetReader');

const ADAPTER_ID = 'amazon-research-snapshot-v1';
const PARSER_ID = 'amazon-spreadsheet-buffer-v1';
const CEREBRO_PHRASE = new Set(['keyword phrase', 'keyword', 'search term', 'frase clave']);
const XRAY_TITLE = new Set(['product details', 'title', 'product name']);

function adapterError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizedHeaders(sheet) {
  return new Set((sheet.headers || []).map(value => fold(value).trim()));
}

function isCerebroSheet(sheet) {
  const headers = normalizedHeaders(sheet);
  return [...CEREBRO_PHRASE].some(value => headers.has(fold(value))) && headers.has('search volume');
}

function isXraySheet(sheet) {
  const headers = normalizedHeaders(sheet);
  return headers.has('asin') && [...XRAY_TITLE].some(value => headers.has(fold(value)));
}

function bindingHash() {
  const hash = crypto.createHash('sha256');
  hash.update(`${ADAPTER_ID}\0`);
  for (const file of [__filename, require.resolve('./storedResearch'), require.resolve('../services/spreadsheetReader')]) {
    hash.update(file.split(/[\\/]/).pop()); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

function parserBindingHash() {
  return crypto.createHash('sha256').update(PARSER_ID).update('\0')
    .update(fs.readFileSync(require.resolve('../services/spreadsheetReader'))).digest('hex');
}

function mergeKeywords(sheetResults) {
  const byPhrase = new Map();
  for (const result of sheetResults) {
    for (const keyword of result.keywords) {
      const key = fold(keyword.phrase).trim();
      const prior = byPhrase.get(key);
      if (!prior) { byPhrase.set(key, { ...keyword }); continue; }
      const provenance = [...prior.provenance, ...keyword.provenance];
      const sourceRows = [...prior.sourceRows, ...keyword.sourceRows];
      const strongest = (keyword.searchVolume ?? -1) > (prior.searchVolume ?? -1) ? keyword : prior;
      byPhrase.set(key, { ...strongest, occurrences: prior.occurrences + keyword.occurrences,
        provenance, sourceRows });
    }
  }
  return [...byPhrase.values()];
}

async function parseImport(row) {
  const sheets = await readAllWorksheetsBuffer(Buffer.from(row.raw_bytes), {
    fileName: row.file_name, mediaType: row.media_type
  });
  if (!sheets.length) throw adapterError('RESEARCH_WORKBOOK_EMPTY', { importId: row.id });
  const selected = row.selected_sheet
    ? sheets.filter(sheet => sheet.sheetName.toLowerCase() === String(row.selected_sheet).toLowerCase())
    : sheets;
  if (!selected.length) throw adapterError('RESEARCH_SELECTED_SHEET_NOT_FOUND', {
    importId: row.id, selectedSheet: row.selected_sheet, availableSheets: sheets.map(sheet => sheet.sheetName)
  });
  const predicate = row.kind === 'AMAZON_CEREBRO' ? isCerebroSheet
    : row.kind === 'AMAZON_XRAY' ? isXraySheet : null;
  if (!predicate) throw adapterError('AMAZON_IMPORT_KIND_UNSUPPORTED', { importId: row.id, kind: row.kind });
  const consumed = selected.filter(predicate);
  if (!consumed.length) throw adapterError('RESEARCH_REPORT_SIGNATURE_MISMATCH', {
    importId: row.id, kind: row.kind, sheets: selected.map(sheet => ({ name: sheet.sheetName, headers: sheet.headers }))
  });
  const unconsumed = sheets.filter(sheet => !consumed.includes(sheet)).map(sheet => ({
    sheetName: sheet.sheetName,
    reason: row.selected_sheet && !selected.includes(sheet) ? 'NOT_SELECTED_BY_STAFF' : 'SIGNATURE_NOT_SUPPORTED',
    rowCount: sheet.rows.length,
    headers: sheet.headers
  }));
  return { row, sheets, consumed, unconsumed };
}

async function buildSnapshot(imports) {
  const parsed = await Promise.all(imports.map(parseImport));
  const cerebroSheets = [];
  const xrayRows = [];
  const sources = [];
  for (const item of parsed) {
    let acceptedRows = 0;
    for (const sheet of item.consumed) {
      if (item.row.kind === 'AMAZON_CEREBRO') {
        const normalized = normalizeCerebroRows(sheet.rows, { importId: item.row.id, sheet: sheet.sheetName });
        cerebroSheets.push(normalized); acceptedRows += normalized.accounting.nonEmptyRows;
      } else {
        const normalized = normalizeXrayRows(sheet.rows, { importId: item.row.id, sheet: sheet.sheetName });
        xrayRows.push(...normalized); acceptedRows += normalized.length;
      }
    }
    sources.push({ importId: item.row.id, kind: item.row.kind, rawHash: item.row.raw_hash,
      parserId: item.row.parser_id, parserHash: item.row.parser_hash,
      workbookSheetCount: item.sheets.length, consumedSheets: item.consumed.map(sheet => ({
        sheetName: sheet.sheetName, rowCount: sheet.rows.length, headers: sheet.headers,
        headerColumns: sheet.headerColumns
      })), unconsumedSheets: item.unconsumed, acceptedRows });
  }
  const cerebroObservations = cerebroSheets.flatMap(result => result.observations);
  const keywords = mergeKeywords(cerebroSheets);
  const inputRows = sources.reduce((sum, source) => sum + source.consumedSheets.reduce((n, sheet) => n + sheet.rowCount, 0), 0);
  const unconsumedRows = sources.reduce((sum, source) => sum + source.unconsumedSheets.reduce((n, sheet) => n + sheet.rowCount, 0), 0);
  return Object.freeze({
    observations: { marketplace: 'AMAZON', sources, cerebro: { keywords, observations: cerebroObservations }, xray: xrayRows },
    accounting: { importCount: imports.length, workbookSheetCount: sources.reduce((sum, source) => sum + source.workbookSheetCount, 0),
      consumedSheetCount: sources.reduce((sum, source) => sum + source.consumedSheets.length, 0),
      unconsumedSheetCount: sources.reduce((sum, source) => sum + source.unconsumedSheets.length, 0),
      inputRows, unconsumedRows, cerebroObservationCount: cerebroObservations.length,
      uniqueKeywordCount: keywords.length, xrayObservationCount: xrayRows.length },
    adapterBindingHash: bindingHash()
  });
}

module.exports = Object.freeze({ ADAPTER_ID, PARSER_ID, buildSnapshot, bindingHash,
  parserBindingHash, isCerebroSheet, isXraySheet });
