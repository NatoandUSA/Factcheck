'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.DOTENV_PATH = path.join(__dirname, 'absent.env');
const { app, db, databaseReady, backgroundAgentTimer } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { migrateStaffWorkflow } = require('../server/staffWorkflow');
const all = (q,p=[]) => new Promise((r,j)=>db.all(q,p,(e,x)=>e?j(e):r(x)));
const Excel = require('exceljs');

let measured=0;
const check=(value,message)=>{ measured++; assert.ok(value,message); };

async function workbookBuffer(headers, rows) {
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main(){
  await databaseReady;
  clearInterval(backgroundAgentTimer);
  await migrateStaffWorkflow(db);
  const server=app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS=base;
  try {
    const [fixture]=await all("SELECT wm.user_id,wm.workspace_id,w.tenant_id,w.marketplace FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.role='OWNER' AND w.marketplace='AMAZON' AND w.tenant_id='tenant-alpha-uuid' LIMIT 1");
    const session=await new Promise((r,j)=>createSessionRecord(db,fixture.user_id,fixture.workspace_id,fixture.tenant_id,(e,x)=>e?j(e):r(x)));
    const headers={Origin:base,Cookie:`omni_session=${session.rawToken}`};
    const jsonApi=async(route,body)=>{const res=await fetch(base+route,{method:body?'POST':'GET',headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};};
    const projectId=(await jsonApi('/api/projects',{name:'Commerce Intelligence Bridge',seedPhrase:'mama sweatshirt'})).body.projectId;
    const route=`/api/staff-workflow/${projectId}`;

    const cerebroRows=[];
    for(let i=0;i<70;i++) cerebroRows.push([`mama sweatshirt gift idea ${i} for mom`,1000-i*7,i%5?20-i%10:'',1200-i,5,300+i,8,i%6,1.1,i+1]);
    cerebroRows.push(['nike mom sweatshirt',2000,40,1500,20,100,5,0,2.5,2]);
    cerebroRows.push(['low volume mom sweatshirt',5,1,10,0,900,15,4,0.5,90]);
    const cerebro=await workbookBuffer(['Keyword Phrase','Search Volume','Keyword Sales','Cerebro IQ Score','Search Volume Trend','Competing Products','CPR','Title Density','H10 PPC Sugg. Bid','Position (Rank)'],cerebroRows);

    const xrayRows=[];
    for(let i=0;i<6;i++)xrayRows.push([`Mama Embroidered Sweatshirt Gift ${i}`,`B0ALPHA0${String(i).padStart(2,'0')}`,'Alpha',35,100-i,50-i,35]);
    for(let i=0;i<6;i++)xrayRows.push([`Mom Embroidered Sweatshirt Gift ${i}`,`B0BETA00${String(i).padStart(2,'0')}`,'Beta',36,90-i,40-i,34]);
    const xray=await workbookBuffer(['Product Details','ASIN','Brand','Price $','ASIN Sales','Review Count','Title Char. Count'],xrayRows);
    const upload=async(name,kind,bytes)=>{
      const form=new FormData();
      form.append('file',new Blob([bytes]),name);
      form.append('kind',kind);
      form.append('confirm','true');
      const res=await fetch(base+route+'/files',{method:'POST',headers,body:form});
      return {status:res.status,body:await res.json()};
    };
    const upC=await upload('cerebro.xlsx','CEREBRO',cerebro);
    const upX=await upload('xray.xlsx','XRAY',xray);
    check(upC.status===200&&upC.body.committed,'Cerebro persists');
    check(upX.status===200&&upX.body.committed,'X-Ray persists');

    const state=(await jsonApi(route)).body;
    check(state.research.totalRows===84,'stored corpus row count retained');
    const beforeDrafts=(await all('SELECT count(*) n FROM staff_editorial_drafts'))[0].n;
    const beforeListings=(await all('SELECT count(*) n FROM listings'))[0].n;
    const beforeState=(await all('SELECT state FROM research_projects WHERE id=?',[projectId]))[0].state;

    const facts={language:'en',productName:'Embroidered Mama Sweatshirt',productType:'Sweatshirt',recipient:'moms',occasion:'Mothers Day',materials:'65% cotton; 35% polyester',sizes:'S; M; L',colors:'Black',features:'Machine embroidered',personalization:'Up to 3 names',care:'Machine wash cold',packaging:'Poly bag',shipFrom:'Vietnam',sourceNote:'staff-confirmed test facts'};
    const body={sourceHash:state.research.sourceHash,facts,factsConfirmed:true,anchors:['mama sweatshirt','mom sweatshirt'],minSearchVolume:50,searchTermBytes:999,maxPerBrand:2,targetPrice:35};
    const preview=await jsonApi(route+'/intelligence/preview',body);
    check(preview.status===200&&preview.body.zeroWrite===true,'intelligence preview succeeds as zero-write');
    check(preview.body.accounting.inputRows===72,'all persisted Cerebro rows reach adapter accounting');
    check(preview.body.accounting.preRejected===1,'below-min-SV phrase is explicitly accounted');
    check(preview.body.metricAvailability.positionRank.present===72,'Position Rank provenance survives bridge');
    check(preview.body.draft.title.chars>0&&preview.body.draft.title.chars<=75,'research-driven title generated');
    check(preview.body.draft.searchTermTotalBytes<=249,'Generic Keywords total <=249 bytes');
    check(preview.body.draft.searchTerms.length<=1,'only one total Generic Keywords bucket');
    const allOutput=[preview.body.draft.title.text,preview.body.draft.itemHighlights.text,...preview.body.draft.bullets,preview.body.draft.description,...preview.body.draft.searchTerms.map(x=>x.text),...preview.body.draft.ppc.exact.map(x=>x.phrase),...preview.body.draft.ppc.phrase.map(x=>x.phrase),...preview.body.draft.ppc.broad.map(x=>x.phrase)].join(' ').toLowerCase();
    check(!allOutput.includes('nike'),'IP-blocked keyword cannot leak through bridge');
    check(preview.body.rejectedCount===preview.body.draft.coverage.rejectedPhrases,'full rejection accounting exposed');
    check(preview.body.asinSelection&&preview.body.asinSelection.batches.length>0,'persisted X-Ray reaches ASIN selector');
    for(const batch of preview.body.asinSelection.batches){
      const counts={};
      for(const item of batch.items)counts[item.brand]=(counts[item.brand]||0)+1;
      check(Object.values(counts).every(n=>n<=2),'per-batch brand cap retained');
      check(batch.items[0].seed===true&&batch.seedAsin===batch.items[0].asin,'seed ASIN explicit');
    }

    check((await all('SELECT count(*) n FROM staff_editorial_drafts'))[0].n===beforeDrafts,'preview writes no editorial draft');
    check((await all('SELECT count(*) n FROM listings'))[0].n===beforeListings,'preview writes no commerce listing');
    check((await all('SELECT state FROM research_projects WHERE id=?',[projectId]))[0].state===beforeState,'preview makes no authority transition');
    const noConfirm=await jsonApi(route+'/intelligence/preview',{...body,factsConfirmed:false});
    check(noConfirm.status===400,'intelligence preview requires staff fact confirmation');
    const stale=await jsonApi(route+'/intelligence/preview',{...body,sourceHash:'stale'});
    check(stale.status===409,'stale research hash is rejected');
    console.log(`STAFF_INTELLIGENCE_BRIDGE measured=${measured} passed=${measured} failed=0`);
  } finally {
    await new Promise(r=>server.close(r));
    await new Promise(r=>db.close(r));
  }
}

main().catch(error=>{ console.error(error); process.exitCode=1; });
