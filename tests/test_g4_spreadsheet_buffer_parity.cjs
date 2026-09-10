'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const {
  readWorksheetWithSignature,
  readWorksheetBufferWithSignature,
  readAllWorksheetsBuffer,
  sourceRowNumber
} = require('../server/services/spreadsheetReader');

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed++;
}

async function main() {
  const fixture = path.join(__dirname, 'fixtures', 'sample_cerebro.xlsx');
  const bytes = fs.readFileSync(fixture);
  const fromPath = await readWorksheetWithSignature(fixture);
  const fromBuffer = await readWorksheetBufferWithSignature(bytes, {
    fileName: 'sample_cerebro.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  check(fromPath.success === true, 'path XLSX succeeds');
  check(fromBuffer.success === true, 'buffer XLSX succeeds');
  check(fromBuffer.sheetName === fromPath.sheetName, 'XLSX sheet selection parity');
  check(JSON.stringify(fromBuffer.headers) === JSON.stringify(fromPath.headers), 'XLSX header parity');
  check(JSON.stringify(fromBuffer.rows) === JSON.stringify(fromPath.rows), 'XLSX row parity');
  const allXlsx = await readAllWorksheetsBuffer(bytes, { fileName: 'sample_cerebro.xlsx' });
  check(allXlsx.length >= 1, 'all-sheet reader returns XLSX worksheets');
  check(allXlsx.some(sheet => sheet.sheetName === fromBuffer.sheetName), 'selected XLSX sheet is accounted for');
  const losslessWorkbook = new ExcelJS.Workbook();
  losslessWorkbook.addWorksheet('Lossless').addRows([
    ['Keyword Phrase', 'Search Volume', '', 'Search Volume'],
    ['para mi hija', 100, 'regalo para mi hija', 200]
  ]);
  const lossless = (await readAllWorksheetsBuffer(Buffer.from(await losslessWorkbook.xlsx.writeBuffer()), {
    fileName: 'lossless.xlsx'
  }))[0];
  check(lossless.headers.length === 4 && lossless.headers[2] === '__blank_column_3', 'blank header receives stable fallback key');
  check(lossless.headers[3] === 'Search Volume__duplicate_2', 'duplicate header receives stable disambiguation key');
  check(lossless.rows[0].__blank_column_3 === 'regalo para mi hija', 'cell below blank header is retained');
  check(sourceRowNumber(lossless.rows[0]) === 2, 'physical spreadsheet row number is retained');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-g4-reader-'));
  const csvPath = path.join(temp, 'research.csv');
  const csv = Buffer.from('Keyword Phrase,Search Volume,CPR\r\npara mi hija,1200,8\r\nregalo hija,,3\r\n', 'utf8');
  fs.writeFileSync(csvPath, csv);
  const csvPathResult = await readWorksheetWithSignature(csvPath);
  const csvBufferResult = await readWorksheetBufferWithSignature(csv, {
    fileName: 'research.csv', mediaType: 'text/csv; charset=utf-8'
  });
  check(csvPathResult.success === true, 'path CSV succeeds');
  check(csvBufferResult.success === true, 'buffer CSV succeeds');
  check(JSON.stringify(csvBufferResult.headers) === JSON.stringify(csvPathResult.headers), 'CSV header parity');
  check(JSON.stringify(csvBufferResult.rows) === JSON.stringify(csvPathResult.rows), 'CSV row parity');
  check(csvBufferResult.rows[1]['Search Volume'] === undefined, 'missing CSV metric remains missing');
  const allCsv = await readAllWorksheetsBuffer(csv, { fileName: 'research.csv' });
  check(allCsv.length === 1 && allCsv[0].rows.length === 2, 'all-sheet CSV accounting');

  await assert.rejects(
    readWorksheetBufferWithSignature(Buffer.alloc(0), { fileName: 'empty.xlsx' }),
    error => error?.code === 'INVALID_RESEARCH_BYTES'
  );
  passed++;
  console.log(`G4 spreadsheet buffer/path parity: ${passed}/18 PASS`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
