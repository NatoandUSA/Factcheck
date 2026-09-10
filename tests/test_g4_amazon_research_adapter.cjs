'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const adapter = require('../server/commerceIntelligence/amazonResearchAdapter');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function workbookBytes(sheets) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of sheets) workbook.addWorksheet(name).addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function main() {
  const cerebroBytes = await workbookBytes([
    ['Anchor A', [
      ['Keyword Phrase','Search Volume','H10 PPC Sugg. Min Bid','B0ABC12345',''],
      ['para mi hija',1200,0.7,4,'regalo para mi hija'], ['regalo hija',null,null,8,'regalo hija']
    ]],
    ['Anchor B', [
      ['Keyword Phrase','Search Volume','Position (Rank)'],
      ['PARA MI HIJA',900,3], ['collar hija',400,7]
    ]],
    ['Read me', [['Notes'],['not research']]]
  ]);
  const xrayBytes = await workbookBytes([['X-Ray', [
    ['Product Details','ASIN','URL','Image URL','Price $','Dimensions'],
    ['Necklace','B0ABC12345','https://example.test/p','https://example.test/i.jpg',29.99,'2 x 3 in']
  ]]]);
  const imports = [
    { id: 1, kind: 'AMAZON_CEREBRO', file_name: 'cerebro.xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_bytes: cerebroBytes, raw_hash: digest(cerebroBytes), selected_sheet: null, parser_id: 'amazon-spreadsheet-v1', parser_hash: digest('parser') },
    { id: 2, kind: 'AMAZON_XRAY', file_name: 'xray.xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_bytes: xrayBytes, raw_hash: digest(xrayBytes), selected_sheet: null, parser_id: 'amazon-spreadsheet-v1', parser_hash: digest('parser') }
  ];
  const result = await adapter.buildSnapshot(imports);
  check(/^[0-9a-f]{64}$/.test(result.adapterBindingHash), 'adapter binding is content hashed');
  check(result.accounting.importCount === 2, 'all imports counted');
  check(result.accounting.workbookSheetCount === 4, 'all workbook sheets counted');
  check(result.accounting.consumedSheetCount === 3, 'supported sheets consumed');
  check(result.accounting.unconsumedSheetCount === 1, 'unsupported sheets disclosed');
  check(result.accounting.unconsumedRows === 1, 'unsupported rows disclosed');
  check(result.accounting.cerebroObservationCount === 4, 'all keyword observations preserved');
  check(result.accounting.uniqueKeywordCount === 3, 'cross-sheet keyword merge is explicit');
  const keyword = result.observations.cerebro.keywords.find(item => item.phrase === 'para mi hija');
  check(keyword.searchVolume === 1200 && keyword.occurrences === 2, 'strongest duplicate retained with occurrence count');
  check(keyword.provenance.length === 2, 'duplicate provenance retained');
  check(result.observations.cerebro.observations[0].sourceFields.B0ABC12345 === 4, 'dynamic ASIN column preserved');
  check(result.observations.cerebro.observations[0].sourceFields.__blank_column_5 === 'regalo para mi hija',
    'data beneath blank header is preserved with stable key');
  check(result.observations.cerebro.observations[0].provenance[0].sourceRow === 2,
    'provenance records physical worksheet row including header offset');
  check(result.observations.cerebro.observations[1].searchVolume === null, 'missing metric remains null');
  check(result.accounting.xrayObservationCount === 1, 'Xray row counted');
  check(result.observations.xray[0].url === 'https://example.test/p', 'Xray URL mapped');
  check(result.observations.xray[0].sourceFields.Dimensions === '2 x 3 in', 'all Xray source fields preserved');

  await assert.rejects(adapter.buildSnapshot([{ ...imports[0], selected_sheet: 'missing' }]),
    error => error?.code === 'RESEARCH_SELECTED_SHEET_NOT_FOUND');
  passed++;
  console.log(`G4 Amazon research adapter: ${passed}/18 PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
