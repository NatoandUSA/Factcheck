// Internal editorial workspace. No commerce listings, evidence acceptance,
// approval bindings or project-state transitions are written by this module.
const crypto = require('node:crypto');
const multer = require('multer');
const { readWorksheetWithSignature } = require('./services/spreadsheetReader');
const { parseEtsySearchCsv } = require('./etsyPastedSearchParser');
const commerceIntelligence = require('./commerceIntelligence');
const reviewIpLibrary = commerceIntelligence.ip.loadLibrary();
const { requireAuth, requireRole } = require('./middleware/auth');
const run = (db,q,p=[]) => new Promise((resolve,reject)=>db.run(q,p,function(e){e?reject(e):resolve({changes:this.changes,id:this.lastID});}));
const all = (db,q,p=[]) => new Promise((resolve,reject)=>db.all(q,p,(e,r)=>e?reject(e):resolve(r)));
const hash = value => crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fail = (code,status=400) => Object.assign(new Error(code),{status,code});
const text = (value,max=2000) => { if(typeof value!=='string'||value.length>max)throw fail('INVALID_TEXT'); return value.trim(); };
const object = value => value && typeof value==='object' && !Array.isArray(value);
const parse = value => JSON.parse(value);
const FIELD_NAMES = ['productName','productType','recipient','occasion','design','materials','dimensions','sizes','colors','variants','features','personalization','care','packaging','shipFrom','processing','shipping','sourceNote','intro'];

async function migrateStaffWorkflow(db) {
  // Additive and idempotent; one atomic DDL statement per independent table.
  await run(db,`CREATE TABLE IF NOT EXISTS staff_research_files (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES research_projects(id),
    file_name TEXT NOT NULL, file_hash TEXT NOT NULL, kind TEXT NOT NULL,
    raw_bytes BLOB NOT NULL, rows_json TEXT NOT NULL, accounting_json TEXT NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id,file_hash,kind))`);
  await run(db,`CREATE TABLE IF NOT EXISTS staff_editorial_drafts (
    project_id INTEGER PRIMARY KEY REFERENCES research_projects(id), version INTEGER NOT NULL,
    content_json TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

async function parseFile(file,marketplace,kind) {
  if(!file)throw fail('FILE_REQUIRED');
  let rows, accounting;
  if(kind==='ETSY_CSV' && marketplace==='ETSY' && /\.csv$/i.test(file.originalname)) {
    const parsed=parseEtsySearchCsv(file.buffer.toString('utf8'));
    rows=parsed.sellers;
    accounting=parsed.rowAccounting;
  } else if(['XRAY','CEREBRO','REFERENCE'].includes(kind)&&/\.xlsx$/i.test(file.originalname) && (marketplace==='AMAZON'||kind==='REFERENCE')) {
    const parsed=await readWorksheetWithSignature(file.buffer);
    if(!parsed.success)throw fail(parsed.code||'UNSUPPORTED_REPORT');
    const headers=parsed.headers.map(x=>x.toLowerCase());
    if(kind==='CEREBRO'&&!headers.includes('keyword phrase'))throw fail('EXPECTED_CEREBRO_FILE');
    if(kind==='XRAY'&&(!headers.includes('asin')||headers.includes('keyword phrase')))throw fail('EXPECTED_XRAY_FILE');
    if(kind==='REFERENCE'&&!headers.some(x=>/title|description/.test(x)))throw fail('EXPECTED_LISTING_REFERENCE');
    rows=parsed.rows;
    // Research preservation: keep every nonempty row. Nothing is silently
    // discarded by ranking or substring-based relevance filters.
    accounting={inputRows:rows.length,returnedRows:rows.length,duplicateRowsRemoved:0,truncatedRows:0};
  } else throw fail('FILE_TYPE_MARKETPLACE_MISMATCH');
  if(!rows.length)throw fail('EMPTY_FILE');
  return {rows,accounting};
}

async function corpus(db,projectId) {
  const records=await all(db,'SELECT id,file_name,file_hash,kind,rows_json,accounting_json,created_at FROM staff_research_files WHERE project_id=? ORDER BY id',[projectId]);
  const terms=new Map(); const listingIds=new Set(); let duplicateListings=0,totalRows=0;
  const add=(phrase,source)=>{
    if(typeof phrase!=='string')return;
    const clean=phrase.normalize('NFKC').replace(/\s+/g,' ').trim();
    if(!clean||clean.length>160)return;
    const key=clean.toLocaleLowerCase(); const prior=terms.get(key);
    if(prior){prior.occurrences++;return;}
    terms.set(key,{keyword:clean,occurrences:1,source});
  };
  for(const file of records) {
    const rows=parse(file.rows_json);totalRows+=rows.length;
    for(const row of rows) {
      if(file.kind==='CEREBRO')add(row['Keyword Phrase'],file.id);
      else if(file.kind==='ETSY_CSV') {
        const id=row.listingId||row.url;
        if(id&&listingIds.has(id)){duplicateListings++;continue;}
        if(id)listingIds.add(id);
        // These remain suggestions from observed titles, never product facts.
        String(row.title||'').split(/[,|:;]+/).forEach(x=>add(x,file.id));
      }
    }
  }
  return {files:records.map(({rows_json,...r})=>({...r,accounting:parse(r.accounting_json),accounting_json:undefined})),totalRows,duplicateListings,
    keywords:[...terms.values()],sourceHash:hash(records.map(r=>[r.id,r.file_hash,r.kind]))};
}

function sanitizeFacts(input) {
  if(!object(input))throw fail('FACTS_REQUIRED');
  const facts={};for(const field of FIELD_NAMES)facts[field]=text(input[field]??'',field==='intro'?4000:2000);
  if(!facts.productName||!facts.productType||!facts.sourceNote)throw fail('PRODUCT_NAME_TYPE_SOURCE_REQUIRED');
  if(!['es','en','vi'].includes(input.language))throw fail('LANGUAGE_REQUIRED');
  facts.language=input.language;
  return facts;
}
function draftFromFacts(facts,keywords) {
  const labels={es:{materials:'Materiales',dimensions:'Medidas',variants:'Opciones',personalization:'Personalización',processing:'Preparación',shipping:'Envío',design:'Diseño',recipient:'Destinatario',productType:'Tipo de producto'},
    en:{materials:'Materials',dimensions:'Dimensions',variants:'Options',personalization:'Personalization',processing:'Processing',shipping:'Shipping',design:'Design',recipient:'Recipient',productType:'Product type'},
    vi:{materials:'Chất liệu',dimensions:'Kích thước',variants:'Biến thể',personalization:'Cá nhân hóa',processing:'Xử lý đơn',shipping:'Giao hàng',design:'Thiết kế',recipient:'Người nhận',productType:'Loại sản phẩm'}}[facts.language];
  const bullets=Object.keys(labels).filter(k=>facts[k]).map(k=>`${labels[k]}: ${facts[k]}`);
  return {title:[facts.productName,facts.design].filter(Boolean).join(' — '),bullets,
    description:[facts.intro||facts.productName,...bullets].join('\n\n'),keywords};
}
function sanitizeDraft(value) {
  if(!object(value)||!Array.isArray(value.bullets)||!Array.isArray(value.keywords))throw fail('INVALID_DRAFT');
  if(value.bullets.length>20||value.keywords.length>100)throw fail('TOO_MANY_FIELDS');
  const result={title:text(value.title,500),description:text(value.description,20000),bullets:value.bullets.map(x=>text(x,2000)).filter(Boolean),keywords:value.keywords.map(x=>text(x,160)).filter(Boolean)};
  if(!result.title||!result.description)throw fail('TITLE_DESCRIPTION_REQUIRED');
  return result;
}
function screening(draft) {
  try{return commerceIntelligence.ip.screen([draft.title,draft.description,...draft.bullets,...draft.keywords].join('\n'), reviewIpLibrary);}
  catch(e){throw fail('IP_GUARD_UNAVAILABLE',503);}
}
function exportText(project,record) {
  const c=record.content;
  return ['BẢN NHÁP NỘI BỘ — CẦN STAFF DUYỆT',`Project: ${project.name} (#${project.id}) | ${project.marketplace}`,`Version: ${record.version}`,
    'Thông tin sản phẩm do staff khai báo; chưa phải Product Truth được hệ thống xác minh. Không phải file upload marketplace.',
    `Nguồn thông tin sản phẩm: ${c.facts.sourceNote}`,`Tệp nghiên cứu: ${c.files.map(f=>`${f.file_name} [${f.file_hash}]`).join('; ')}`,
    '', 'TITLE',c.draft.title,'','BULLETS',...c.draft.bullets.map(x=>`• ${x}`),'','DESCRIPTION',c.draft.description,'',
    project.marketplace==='ETSY'?'TAG CANDIDATES':'SEARCH TERM CANDIDATES',c.draft.keywords.join(', '),'',
    'CẦN KIỂM TRA', 'Độ dài/độ liên quan keyword; chính sách sàn; quyền sử dụng thiết kế; mọi thông tin sản phẩm và giao hàng.',
    `Chưa khai báo: ${c.missingFields.join(', ')||'không có trong bộ trường này'}`].join('\n');
}

function registerStaffWorkflow(app,db) {
  const auth=requireAuth(db), role=requireRole(['OWNER','MANAGER','SELLER']);
  const memoryUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:4}}).single('file');
  const upload=(req,res,next)=>memoryUpload(req,res,e=>e?res.status(413).json({error:'UPLOAD_LIMIT_EXCEEDED'}):next());
  const scoped=async(req)=>{
    if(!/^[1-9]\d*$/.test(req.params.projectId))throw fail('PROJECT_NOT_FOUND',404);
    const [p]=await all(db,'SELECT * FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?',[Number(req.params.projectId),req.user.tenantId,req.user.workspaceId,req.user.marketplace]);
    if(!p)throw fail('PROJECT_NOT_FOUND',404);return p;
  };
  const handler=fn=>async(req,res)=>{try{await fn(req,res,await scoped(req));}catch(e){res.status(e.status||500).json({success:false,error:e.code||'STAFF_WORKFLOW_ERROR'});}};
  const getRecord=async id=>{const [r]=await all(db,'SELECT * FROM staff_editorial_drafts WHERE project_id=?',[id]);return r?{version:r.version,updatedAt:r.updated_at,content:parse(r.content_json)}:null;};
  app.get('/api/staff-workflow/:projectId',auth,role,handler(async(req,res,p)=>{
    const research=await corpus(db,p.id),record=await getRecord(p.id);
    const query=String(req.query.q||'').toLocaleLowerCase();
    const found=research.keywords.filter(x=>x.keyword.toLocaleLowerCase().includes(query));
    res.json({success:true,project:{id:p.id,name:p.name,marketplace:p.marketplace,seed:p.seed_phrase},research:{...research,keywordCount:research.keywords.length,matchedKeywords:found.length,keywords:found.slice(0,100)},record,stale:Boolean(record&&record.content.sourceHash!==research.sourceHash)});
  }));
  app.post('/api/staff-workflow/:projectId/files',auth,role,upload,handler(async(req,res,p)=>{
    const kind=req.body.kind;const parsed=await parseFile(req.file,p.marketplace,kind);
    const fileHash=hash(req.file.buffer);
    const [prior]=await all(db,'SELECT id FROM staff_research_files WHERE project_id=? AND file_hash=? AND kind=?',[p.id,fileHash,kind]);
    const commit=req.body.confirm==='true';let id=prior?.id||null;
    if(commit&&!prior){
      await run(db,'INSERT OR IGNORE INTO staff_research_files(project_id,file_name,file_hash,kind,raw_bytes,rows_json,accounting_json,actor_id) VALUES (?,?,?,?,?,?,?,?)',[p.id,req.file.originalname,fileHash,kind,req.file.buffer,JSON.stringify(parsed.rows),JSON.stringify(parsed.accounting),req.user.userId]);
      id=(await all(db,'SELECT id FROM staff_research_files WHERE project_id=? AND file_hash=? AND kind=?',[p.id,fileHash,kind]))[0].id;
    }
    res.json({success:true,projectId:p.id,preview:!commit,committed:commit,alreadyImported:Boolean(prior),fileId:id,fileHash,fileName:req.file.originalname,accounting:parsed.accounting,sample:parsed.rows.slice(0,3).map(row=>({title:row.title||row['Product Details']||row['Keyword Phrase']||row['TITLE - 75']||'',id:row.listingId||row.ASIN||''}))});
  }));
  app.post('/api/staff-workflow/:projectId/intelligence/preview',auth,role,handler(async(req,res,p)=>{
    const body=req.body||{};
    if(body.factsConfirmed!==true)throw fail('CONFIRM_PRODUCT_INFORMATION_REQUIRED');
    const facts=sanitizeFacts(body.facts||{});
    const research=await corpus(db,p.id);
    if(!research.files.length)throw fail('IMPORT_REQUIRED');
    if(body.sourceHash!==research.sourceHash)throw fail('RESEARCH_CHANGED_RELOAD',409);

    if(p.marketplace!=='AMAZON') {
      return res.json({success:true,zeroWrite:true,projectId:p.id,marketplace:p.marketplace,
        sourceHash:research.sourceHash,status:'MARKETPLACE_INTELLIGENCE_ADAPTER_NOT_IMPLEMENTED'});
    }

    const records=await all(db,'SELECT kind,rows_json,file_name,file_hash FROM staff_research_files WHERE project_id=? ORDER BY id',[p.id]);
    const grouped={XRAY:[],CEREBRO:[],REFERENCE:[]};
    for(const record of records) if(grouped[record.kind]) grouped[record.kind].push(...parse(record.rows_json));
    const normalized=commerceIntelligence.storedResearch.normalizeCerebroRows(grouped.CEREBRO);
    if(!normalized.keywords.length)throw fail('CEREBRO_REQUIRED');

    const anchors=(Array.isArray(body.anchors)?body.anchors:String(body.anchors||'').split(/[,\n]/)).map(x=>String(x).trim()).filter(Boolean);
    const negatives=(Array.isArray(body.negativeKeywords)?body.negativeKeywords:String(body.negativeKeywords||'').split(/[,\n]/)).map(x=>String(x).trim()).filter(Boolean);
    const scored=commerceIntelligence.keyword.scoreKeywords(normalized.keywords,{
      anchors,negativeKeywords:negatives,minSearchVolume:Number(body.minSearchVolume)||0,
      library:reviewIpLibrary,screen:commerceIntelligence.ip.screen
    });
    const truth=commerceIntelligence.storedResearch.factsToAmazonTruth(facts);
    const draft=commerceIntelligence.amazon.compose(scored,truth,{
      titleLimit:Number(body.titleLimit)||75,highlightLimit:Number(body.highlightLimit)||125,
      searchTermBytes:Number(body.searchTermBytes)||249,excludeReviewKeywords:body.excludeReviewKeywords===true,
      labelLanguage:facts.language==='es'?'ES':'EN'
    });

    const xrayRows=commerceIntelligence.storedResearch.normalizeXrayRows(grouped.XRAY);
    const ownAsins=commerceIntelligence.storedResearch.extractOwnAsinsFromReferenceRows(grouped.REFERENCE);
    const asinSelection=xrayRows.length?commerceIntelligence.asin.selectAsinBatches(xrayRows,{
      anchors,library:reviewIpLibrary,screen:commerceIntelligence.ip.screen,ownAsins,
      priceFloor:body.priceFloor??null,priceCeiling:body.priceCeiling??null,targetPrice:body.targetPrice??null,
      maxPerBrand:Number(body.maxPerBrand)||2
    }):null;
    const wire=k=>({phrase:k.phrase,searchVolume:k.searchVolume,keywordSales:k.keywordSales,titleDensity:k.titleDensity,
      competingProducts:k.competingProducts,cpr:k.cpr,bid:k.bid,positionRank:k.positionRank,score:Number(k.score.toFixed(4)),
      relevance:Number(k.relevance.toFixed(3)),suspectedBrand:k.suspectedBrand,rareReviewToken:k.rareReviewToken,ipVerdict:k.ipVerdict});
    res.json({success:true,zeroWrite:true,projectId:p.id,marketplace:p.marketplace,sourceHash:research.sourceHash,
      accounting:{...normalized.accounting,inputUniquePhrases:scored.meta.inputUniquePhrases,scoredPhrases:scored.length,
        preRejected:scored.meta.preRejected.length,rejectedPhrases:draft.coverage.rejectedPhrases},
      metricAvailability:scored.meta.metricAvailability,topKeywords:scored.slice(0,100).map(wire),
      rejectedCount:draft.rejectedKeywords.length,rejectedPreview:draft.rejectedKeywords.slice(0,100),
      asinSelection:asinSelection?{...asinSelection,rejectedPreview:asinSelection.rejectedPreview}:null,draft});
  }));

  app.post('/api/staff-workflow/:projectId/draft',auth,role,handler(async(req,res,p)=>{
    const body=req.body||{};
    if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw fail('EXPECTED_VERSION_REQUIRED');
    const facts=sanitizeFacts(body.facts);
    if(body.factsConfirmed!==true)throw fail('CONFIRM_PRODUCT_INFORMATION_REQUIRED');
    const research=await corpus(db,p.id);
    if(!research.files.length)throw fail('IMPORT_REQUIRED');
    if(body.sourceHash!==research.sourceHash)throw fail('RESEARCH_CHANGED_RELOAD',409);
    if(!Array.isArray(body.keywords)||body.keywords.length>100)throw fail('KEYWORDS_REQUIRED');
    const keywords=[...new Set(body.keywords.map(x=>text(x,160)))];
    const draft=body.action==='compose'?sanitizeDraft(draftFromFacts(facts,keywords)):body.action==='save'?sanitizeDraft(body.draft):null;
    if(!draft)throw fail('INVALID_ACTION');
    const ip=screening(draft);
    const content={classification:'INTERNAL_EDITORIAL_DRAFT',authority:'NONE',facts,factsDeclaration:{actorId:req.user.userId,at:new Date().toISOString(),kind:'STAFF_DECLARED'},draft,sourceHash:research.sourceHash,files:research.files,ip,
      missingFields:FIELD_NAMES.filter(k=>!facts[k]&&!['intro','sourceNote'].includes(k)),generator:body.action==='compose'?'FACT_TEMPLATE_V1':'STAFF_EDIT',updatedAt:new Date().toISOString()};
    const json=JSON.stringify(content);let saved;
    if(body.expectedVersion===0) saved=await run(db,'INSERT OR IGNORE INTO staff_editorial_drafts(project_id,version,content_json,actor_id) VALUES (?,1,?,?)',[p.id,json,req.user.userId]);
    else saved=await run(db,'UPDATE staff_editorial_drafts SET content_json=?,version=version+1,actor_id=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND version=?',[json,req.user.userId,p.id,body.expectedVersion]);
    if(saved.changes!==1)throw fail('DRAFT_CHANGED_RELOAD',409);
    res.json({success:true,projectId:p.id,record:await getRecord(p.id)});
  }));
  app.get('/api/staff-workflow/:projectId/export',auth,role,handler(async(req,res,p)=>{
    const record=await getRecord(p.id);if(!record)throw fail('DRAFT_REQUIRED',404);
    if(String(record.version)!==req.query.version)throw fail('DRAFT_CHANGED_RELOAD',409);
    const research=await corpus(db,p.id);if(record.content.sourceHash!==research.sourceHash)throw fail('RESEARCH_CHANGED_RELOAD',409);
    const ip=screening(record.content.draft);if(ip.verdict!=='OK')throw fail('IP_REVIEW_REQUIRED',409);
    const format=req.query.format==='json'?'json':'txt';
    res.setHeader('Cache-Control','no-store');res.attachment(`draft-${p.marketplace.toLowerCase()}-${p.id}-v${record.version}.${format}`);
    res.type(format==='json'?'application/json':'text/plain').send(format==='json'?JSON.stringify({project:{id:p.id,name:p.name,marketplace:p.marketplace},...record},null,2):exportText(p,record));
  }));
}
module.exports={migrateStaffWorkflow,registerStaffWorkflow,parseFile,draftFromFacts};
