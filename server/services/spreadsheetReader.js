const ExcelJS = require('exceljs');
const { Readable } = require('node:stream');
const SOURCE_ROW = Symbol.for('omniseller.spreadsheet.sourceRow');

function cellValue(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
  }
  return value;
}

function projectWorksheet(worksheet) {
  const headers = []; const headerColumns = []; const seen = new Map();
  const columnCount = worksheet.columnCount;
  for (let column = 1; column <= columnCount; column += 1) {
    const rawHeader = String(cellValue(worksheet.getRow(1).getCell(column).value) ?? '').trim();
    const base = rawHeader || `__blank_column_${column}`;
    const occurrence = (seen.get(base) || 0) + 1; seen.set(base, occurrence);
    const key = occurrence === 1 ? base : `${base}__duplicate_${occurrence}`;
    headers[column] = key;
    headerColumns.push(Object.freeze({ column, rawHeader, key, blank: !rawHeader, duplicate: occurrence > 1 }));
  }
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const header = headers[column];
      const value = cellValue(cell.value);
      if (value !== null && value !== undefined && value !== '') hasValue = true;
      record[header] = value;
    });
    if (hasValue) {
      Object.defineProperty(record, SOURCE_ROW, { value: rowNumber, enumerable: false });
      rows.push(record);
    }
  });
  return Object.freeze({ sheetName: worksheet.name, headers: headers.slice(1), headerColumns: Object.freeze(headerColumns), rows });
}

function sourceRowNumber(row, fallback = null) {
  const value = row?.[SOURCE_ROW];
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Reads a specific worksheet from Excel or CSV with explicit Sheet Name / Header Signature selection.
 * Fails closed if multiple ambiguous worksheets exist or no matching header signature is found.
 */
async function selectWorksheet(workbook, options = {}) {
  const { targetSheetName = null } = options;
  const worksheets = workbook.worksheets || [];
  if (worksheets.length === 0) {
    return { success: false, code: 'UNSUPPORTED_REPORT', error: 'Uploaded file contains no worksheets.', rows: [] };
  }

  let selectedWorksheet = null;
  let selectedSheetName = '';

  // 1. Staff explicitly specified sheet name
  if (targetSheetName) {
    selectedWorksheet = worksheets.find(w => w.name && w.name.toLowerCase() === targetSheetName.toLowerCase());
    if (!selectedWorksheet) {
      return { success: false, code: 'UNSUPPORTED_REPORT', error: `Specified sheet "${targetSheetName}" not found in file.`, rows: [] };
    }
    selectedSheetName = selectedWorksheet.name;
  } else if (worksheets.length === 1) {
    selectedWorksheet = worksheets[0];
    selectedSheetName = selectedWorksheet.name;
  } else {
    // 2. Multi-sheet signature inspection
    const matchingSheets = [];
    for (const ws of worksheets) {
      const firstRowHeaders = [];
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
        firstRowHeaders.push(String(cellValue(cell.value) ?? '').trim().toLowerCase());
      });
      const hasSignature = firstRowHeaders.some(h => 
        /keyword|phrase|query|search query|asin|bsr|volume|cpr|title density/i.test(h)
      );
      if (hasSignature) {
        matchingSheets.push(ws);
      }
    }

    if (matchingSheets.length === 1) {
      selectedWorksheet = matchingSheets[0];
      selectedSheetName = selectedWorksheet.name;
    } else if (matchingSheets.length > 1) {
      return {
        success: false,
        code: 'AMBIGUOUS_SHEET',
        error: `File contains ${matchingSheets.length} matching sheets (${matchingSheets.map(w => w.name).join(', ')}). Please specify the target sheet name.`,
        rows: []
      };
    } else {
      return {
        success: false,
        code: 'UNSUPPORTED_REPORT',
        error: `Multi-sheet workbook contains ${worksheets.length} sheets, but none match a recognized report signature. Please specify targetSheetName or upload a valid report file.`,
        rows: []
      };
    }
  }

  return { success: true, ...projectWorksheet(selectedWorksheet), sheetName: selectedSheetName };
}

/**
 * Reads a specific worksheet from a filesystem path. This compatibility entry
 * point and the raw-buffer entry point below deliberately share the same
 * worksheet selection and row projection implementation.
 */
async function readWorksheetWithSignature(filePath, options = {}) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filePath)) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath, {
      ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageSetup', 'printOptions']
    });
  }
  return selectWorksheet(workbook, options);
}

function isCsvInput(options = {}) {
  return /\.csv$/i.test(String(options.fileName || '')) ||
    /^text\/(?:csv|comma-separated-values)(?:;|$)/i.test(String(options.mediaType || ''));
}

/**
 * Parses the exact immutable bytes stored in research_imports. Callers must
 * provide fileName or mediaType so CSV is never guessed from its contents.
 */
async function readWorksheetBufferWithSignature(rawBytes, options = {}) {
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    const error = new TypeError('rawBytes must be a non-empty Buffer.');
    error.code = 'INVALID_RESEARCH_BYTES';
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  if (isCsvInput(options)) {
    await workbook.csv.read(Readable.from([rawBytes]));
  } else {
    await workbook.xlsx.load(rawBytes, {
      ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageSetup', 'printOptions']
    });
  }
  return selectWorksheet(workbook, options);
}

/**
 * Returns every worksheet so multi-anchor exports remain fully accounted for.
 * Marketplace adapters decide which signatures they support and must report
 * any sheet they do not consume.
 */
async function readAllWorksheetsBuffer(rawBytes, options = {}) {
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    const error = new TypeError('rawBytes must be a non-empty Buffer.');
    error.code = 'INVALID_RESEARCH_BYTES';
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  if (isCsvInput(options)) await workbook.csv.read(Readable.from([rawBytes]));
  else await workbook.xlsx.load(rawBytes, {
    ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageSetup', 'printOptions']
  });
  return Object.freeze((workbook.worksheets || []).map(projectWorksheet));
}

async function readFirstWorksheet(filePath) {
  const res = await readWorksheetWithSignature(filePath);
  return res.rows || [];
}

module.exports = { readWorksheetWithSignature, readWorksheetBufferWithSignature,
  readAllWorksheetsBuffer, readFirstWorksheet, sourceRowNumber };
