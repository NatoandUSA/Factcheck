'use strict';

const ExcelJS = require('exceljs');
const crypto = require('node:crypto');
const { BASES, FACT_KEYS, normalizeSnapshot } = require('./productTruthAttestation');

class ProductTruthWorkbookError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = 'ProductTruthWorkbookError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const EXPECTED_HEADERS = Object.freeze([
  'Mã sản phẩm', 'Mã trường canonical', 'Tên trường tiếng Việt', 'Trạng thái', 'Giá trị',
  'Nguồn xác minh', 'Ghi chú nguồn', 'Lý do chưa rõ', 'Tài liệu/URL tham chiếu', 'Ghi chú nhân viên'
]);
const STATUS = Object.freeze(new Map([
  ['KHẲNG ĐỊNH', 'ASSERTED'], ['ASSERTED', 'ASSERTED'],
  ['CHƯA RÕ', 'UNKNOWN'], ['UNKNOWN', 'UNKNOWN'],
  ['BỎ QUA', 'SKIP'], ['SKIP', 'SKIP']
]));

function textCell(cell, row, column) {
  const value = cell?.value;
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'formula')) {
    throw new ProductTruthWorkbookError('PRODUCT_TRUTH_FORMULA_FORBIDDEN', 400, { row, column });
  }
  const text = String(cell?.text ?? value ?? '').trim();
  if (text.length > 4000) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_CELL_TOO_LARGE', 400, { row, column });
  return text;
}

async function parseProductTruthWorkbook(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_WORKBOOK_REQUIRED');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch (_) { throw new ProductTruthWorkbookError('INVALID_PRODUCT_TRUTH_WORKBOOK'); }
  const sheet = workbook.getWorksheet('Sự thật');
  if (!sheet) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_FACT_SHEET_REQUIRED');
  const headers = EXPECTED_HEADERS.map((_, index) => textCell(sheet.getCell(2, index + 1), 2, index + 1));
  if (headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    throw new ProductTruthWorkbookError('PRODUCT_TRUTH_HEADERS_MISMATCH', 400, { expected: EXPECTED_HEADERS, actual: headers });
  }

  const records = [];
  const productCodes = new Set();
  const maxRow = Math.min(Math.max(sheet.actualRowCount, 2), 1002);
  for (let row = 3; row <= maxRow; row += 1) {
    const values = Array.from({ length: 10 }, (_, index) => textCell(sheet.getCell(row, index + 1), row, index + 1));
    if (values.every(value => !value)) continue;
    const [productCode, factKey, label, rawStatus, value, basis, basisNote, unknownReason, reference, staffNote] = values;
    if (!productCode || !factKey || !rawStatus) {
      throw new ProductTruthWorkbookError('PRODUCT_TRUTH_ROW_INCOMPLETE', 400, { row });
    }
    productCodes.add(productCode);
    records.push({ row, productCode, factKey, label, rawStatus, value, basis, basisNote, unknownReason, reference, staffNote });
  }
  if (!records.length) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_ROWS_REQUIRED');

  const requestedCode = String(options.productCode || '').trim();
  if (requestedCode && !productCodes.has(requestedCode)) {
    throw new ProductTruthWorkbookError('PRODUCT_TRUTH_PRODUCT_CODE_NOT_FOUND', 400, { productCodes: [...productCodes] });
  }
  if (!requestedCode && productCodes.size !== 1) {
    throw new ProductTruthWorkbookError('PRODUCT_TRUTH_PRODUCT_CODE_REQUIRED', 400, { productCodes: [...productCodes] });
  }
  const selectedProductCode = requestedCode || [...productCodes][0];
  const selected = records.filter(record => record.productCode === selectedProductCode);
  const facts = {};
  const sourceReferences = {};
  const staffNotes = {};
  for (const record of selected) {
    if (!FACT_KEYS.has(record.factKey)) {
      throw new ProductTruthWorkbookError('UNKNOWN_PRODUCT_TRUTH_FACT', 400, { row: record.row, fact: record.factKey });
    }
    if (Object.prototype.hasOwnProperty.call(facts, record.factKey)) {
      throw new ProductTruthWorkbookError('DUPLICATE_PRODUCT_TRUTH_FACT', 400, { row: record.row, fact: record.factKey });
    }
    const disposition = STATUS.get(record.rawStatus.toUpperCase());
    if (!disposition) throw new ProductTruthWorkbookError('INVALID_PRODUCT_TRUTH_WORKBOOK_STATUS', 400, { row: record.row });
    if (disposition === 'SKIP') continue;
    if (disposition === 'ASSERTED') {
      if (!record.value) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_VALUE_REQUIRED', 400, { row: record.row, fact: record.factKey });
      if (!BASES.has(record.basis)) throw new ProductTruthWorkbookError('INVALID_PRODUCT_TRUTH_BASIS', 400, { row: record.row, fact: record.factKey });
      const combinedBasisNote = [record.basisNote,
        record.reference ? `Tham chiếu: ${record.reference}` : '',
        record.staffNote ? `Ghi chú nhân viên: ${record.staffNote}` : ''].filter(Boolean).join('\n');
      if (combinedBasisNote.length > 4000) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_CELL_TOO_LARGE', 400, { row: record.row, column: 7 });
      facts[record.factKey] = { disposition, value: record.value, basis: record.basis,
        ...(combinedBasisNote ? { basisNote: combinedBasisNote } : {}) };
    } else {
      if (!record.unknownReason) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_UNKNOWN_REASON_REQUIRED', 400, { row: record.row, fact: record.factKey });
      const combinedReason = [record.unknownReason,
        record.reference ? `Tham chiếu: ${record.reference}` : '',
        record.staffNote ? `Ghi chú nhân viên: ${record.staffNote}` : ''].filter(Boolean).join('\n');
      if (combinedReason.length > 4000) throw new ProductTruthWorkbookError('PRODUCT_TRUTH_CELL_TOO_LARGE', 400, { row: record.row, column: 8 });
      facts[record.factKey] = { disposition, reason: combinedReason };
    }
    if (record.reference) sourceReferences[record.factKey] = record.reference;
    if (record.staffNote) staffNotes[record.factKey] = record.staffNote;
  }
  try { normalizeSnapshot(facts); }
  catch (error) { throw new ProductTruthWorkbookError(error.code || 'INVALID_PRODUCT_TRUTH_WORKBOOK', 400, { fact: error.fact, path: error.path }); }
  const missingCanonicalFacts = [...FACT_KEYS].filter(key => !selected.some(record => record.factKey === key));
  return Object.freeze({
    zeroWrite: true,
    rawHash: crypto.createHash('sha256').update(buffer).digest('hex'),
    selectedProductCode,
    productCodes: Object.freeze([...productCodes]),
    facts: Object.freeze(facts),
    sourceReferences: Object.freeze(sourceReferences),
    staffNotes: Object.freeze(staffNotes),
    accounting: Object.freeze({ sourceRowCount: records.length, selectedRowCount: selected.length,
      assertedCount: Object.values(facts).filter(fact => fact.disposition === 'ASSERTED').length,
      unknownCount: Object.values(facts).filter(fact => fact.disposition === 'UNKNOWN').length,
      skippedCount: selected.length - Object.keys(facts).length,
      missingCanonicalFactCount: missingCanonicalFacts.length }),
    missingCanonicalFacts: Object.freeze(missingCanonicalFacts)
  });
}

module.exports = Object.freeze({ EXPECTED_HEADERS, ProductTruthWorkbookError, parseProductTruthWorkbook });
