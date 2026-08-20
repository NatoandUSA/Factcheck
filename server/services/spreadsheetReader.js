const ExcelJS = require('exceljs');

function cellValue(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
  }
  return value;
}

/**
 * Reads a specific worksheet from Excel or CSV with explicit Sheet Name / Header Signature selection.
 * Fails closed if multiple ambiguous worksheets exist or no matching header signature is found.
 */
async function readWorksheetWithSignature(filePath, options = {}) {
  const { targetSheetName = null } = options;
  const workbook = new ExcelJS.Workbook();

  if (/\.csv$/i.test(filePath)) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath, {
      ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageSetup', 'printOptions']
    });
  }

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

  const headers = [];
  selectedWorksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = String(cellValue(cell.value) ?? '').trim();
  });

  const rows = [];
  selectedWorksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const header = headers[column];
      if (!header) return;
      const value = cellValue(cell.value);
      if (value !== null && value !== undefined && value !== '') hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push(record);
  });

  return {
    success: true,
    sheetName: selectedSheetName,
    headers: headers.filter(Boolean),
    rows
  };
}

async function readFirstWorksheet(filePath) {
  const res = await readWorksheetWithSignature(filePath);
  return res.rows || [];
}

module.exports = { readWorksheetWithSignature, readFirstWorksheet };
