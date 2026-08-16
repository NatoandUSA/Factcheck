const ExcelJS = require('exceljs');

function cellValue(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
  }
  return value;
}

async function readFirstWorksheet(filePath) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filePath)) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath, {
      ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageSetup', 'printOptions']
    });
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = String(cellValue(cell.value) ?? '').trim();
  });
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
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
  return rows;
}

module.exports = { readFirstWorksheet };
