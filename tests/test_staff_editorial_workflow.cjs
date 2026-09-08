const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
process.env.NODE_ENV='test';process.env.DOTENV_PATH=path.join(__dirname,'absent.env');
const {app,db,databaseReady,backgroundAgentTimer}=require('../server/server');
const {createSessionRecord}=require('../server/security/session');
const {migrateStaffWorkflow}=require('../server/staffWorkflow');
const all=(q,p=[])=>new Promise((r,j)=>db.all(q,p,(e,x)=>e?j(e):r(x)));
const facts={language:'es',productName:'Collar para mi hija',productType:'Collar',recipient:'Hija',sourceNote:'Hija - NGA - BR2.xlsx; contenido propio del equipo confirmado por Owner.',intro:'Un collar para expresar el amor y el apoyo que sientes por tu hija. Un detalle para su cumpleaños, graduación, Navidad o simplemente para recordarle lo importante que es para ti.'};
let measured=0;const check=(v,msg)=>{measured++;assert.ok(v,msg);};
async function main(){
  await databaseReady;clearInterval(backgroundAgentTimer);await migrateStaffWorkflow(db);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;process.env.ALLOWED_ORIGINS=base;
  const receipt=[],restartProjects=[];const output=process.env.STAFF_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'staff-draft-'));fs.mkdirSync(output,{recursive:true});
  try {
    const fixtures=await all("SELECT wm.user_id,wm.workspace_id,w.tenant_id,w.marketplace FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.role='OWNER'");
    for(const market of ['AMAZON','ETSY']){
      const f=fixtures.find(x=>x.marketplace===market&&x.tenant_id==='tenant-alpha-uuid');
      const s=await new Promise((r,j)=>createSessionRecord(db,f.user_id,f.workspace_id,f.tenant_id,(e,x)=>e?j(e):r(x)));
      const headers={Origin:base,Cookie:`omni_session=${s.rawToken}`};
      const api=async(route,body,method=body?'POST':'GET')=>{const res=await fetch(base+route,{method,headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};};
      const p=(await api('/api/projects',{name:`${market} Hija`,seedPhrase:'para mi hija'})).body.projectId;
      const other=(await api('/api/projects',{name:`${market} isolation`,seedPhrase:'para mi hija'})).body.projectId;
      const route=`/api/staff-workflow/${p}`;
      const beforeCommerce=await all('SELECT id FROM listings');
      let files;
      if(process.env.STAFF_REAL_INPUT_DIR){
        const dir=process.env.STAFF_REAL_INPUT_DIR;
        files=market==='AMAZON'?['Xray_Hija.xlsx','Cerebro_Hija.xlsx','Hija - NGA - BR2.xlsx'].map((n,i)=>({name:n,kind:['XRAY','CEREBRO','REFERENCE'][i],bytes:fs.readFileSync(path.join(dir,n))})):
          fs.readdirSync(dir).filter(n=>/^etsy_search_results_para_mi_hija.*\.csv$/.test(n)).map(n=>({name:n,kind:'ETSY_CSV',bytes:fs.readFileSync(path.join(dir,n))}));
      }else if(market==='AMAZON'){
        const Excel=require('exceljs'),wb=new Excel.Workbook(),ws=wb.addWorksheet('Keywords');ws.addRow(['Keyword Phrase']);for(let i=0;i<150;i++)ws.addRow([`hija keyword ${i}`]);files=[{name:'cerebro.xlsx',kind:'CEREBRO',bytes:Buffer.from(await wb.xlsx.writeBuffer())}];
      }else files=[{name:'etsy.csv',kind:'ETSY_CSV',bytes:Buffer.from('listing_id,title,shop\n1,Collar para mi hija,Uno\n2,Regalo para hija,Dos\n3,Collar hija,Tres\n')}];
      for(const file of files){
        const upload=async confirm=>{const form=new FormData();form.append('file',new Blob([file.bytes]),file.name);form.append('kind',file.kind);form.append('confirm',String(confirm));const r=await fetch(base+route+'/files',{method:'POST',headers,body:form});return {status:r.status,body:await r.json()};};
        const count=(await all('SELECT count(*) n FROM staff_research_files'))[0].n;
        const preview=await upload(false);check(preview.status===200&&preview.body.preview,'real preview works');
        check((await all('SELECT count(*) n FROM staff_research_files'))[0].n===count,'preview zero writes');
        const confirm=await upload(true);check(confirm.status===200&&confirm.body.committed,'confirm persists');
        const repeat=await upload(true);check(repeat.body.alreadyImported,'repeat idempotent');
        check((await all('SELECT count(*) n FROM staff_research_files'))[0].n===count+1,'repeat no second row');
        receipt.push({market,file:file.name,hash:confirm.body.fileHash,accounting:confirm.body.accounting});
      }
      const state=(await api(route)).body;
      check(state.research.totalRows>0,'corpus persisted');
      if(process.env.STAFF_REAL_INPUT_DIR)check(state.research.totalRows===(market==='AMAZON'?1134:194),'all real corpus rows retained');
      if(market==='AMAZON'){
        const row=await all("SELECT rows_json FROM staff_research_files WHERE project_id=? AND kind='CEREBRO'",[p]);
        const keyword=JSON.parse(row[0].rows_json)[120]['Keyword Phrase'];
        const found=(await api(route+'?q='+encodeURIComponent(keyword))).body;
        check(found.research.keywords.some(x=>x.keyword===keyword),'search beyond first 100');
      }
      const request={action:'compose',expectedVersion:0,sourceHash:state.research.sourceHash,facts,factsConfirmed:true,keywords:['para mi hija','regalo para hija','collar para hija']};
      const noConfirmation=await api(route+'/draft',{...request,factsConfirmed:false});check(noConfirmation.status===400,'missing confirmation denies');
      check((await all('SELECT count(*) n FROM staff_editorial_drafts WHERE project_id=?',[p]))[0].n===0,'reject zero writes');
      const composed=await api(route+'/draft',request);check(composed.status===200&&composed.body.record.version===1,'compose first draft without preexisting approved listing');
      const original=composed.body.record.content.draft;
      check(!original.description.includes('18k')&&!original.description.includes('inoxidable'),'no material invented');
      const edited={...original,title:'Collar para mi hija — Regalo de cumpleaños, graduación o Navidad',bullets:[
        'PARA MI HIJA: Un collar para expresar el amor y el apoyo que sientes por ella.',
        'UN VÍNCULO ESPECIAL: Un detalle que recuerda la importancia de tu hija en tu vida.',
        'PARA SUS MOMENTOS IMPORTANTES: Una idea de regalo para cumpleaños, graduación o Navidad.',
        'DE MAMÁ O PAPÁ: Una forma de acompañar con cariño una nueva etapa de su vida.',
        'UN GESTO COTIDIANO: También puedes regalarlo simplemente para demostrarle tu afecto.'
      ],description:facts.intro+'\n\nMás que una pieza de joyería, este collar representa el vínculo que comparten. Un recuerdo de tu cariño para acompañar a tu hija en sus momentos especiales.'};
      const saved=await api(route+'/draft',{...request,action:'save',expectedVersion:1,draft:edited});check(saved.status===200&&saved.body.record.version===2,'edits persisted');
      const stale=await api(route+'/draft',{...request,action:'save',expectedVersion:1,draft:edited});check(stale.status===409,'stale writer rejected');
      for(let reload=0;reload<2;reload++)check((await api(route)).body.record.content.draft.description===edited.description,'reload preserves edits');
      check((await api(`/api/staff-workflow/${other}`)).body.record===null,'same seed other project empty');
      const denied=await fetch(base+route);check(denied.status===401,'anonymous denied');
      const beta=fixtures.find(x=>x.tenant_id==='tenant-beta-uuid');const bs=await new Promise((r,j)=>createSessionRecord(db,beta.user_id,beta.workspace_id,beta.tenant_id,(e,x)=>e?j(e):r(x)));
      const cross=await fetch(base+route,{headers:{Cookie:`omni_session=${bs.rawToken}`}});check(cross.status===404,'other tenant denied');
      const secondMarket=fixtures.find(x=>x.marketplace!==market&&x.tenant_id===f.tenant_id);const ms=await new Promise((r,j)=>createSessionRecord(db,secondMarket.user_id,secondMarket.workspace_id,secondMarket.tenant_id,(e,x)=>e?j(e):r(x)));
      const otherMarket=await fetch(base+route,{headers:{Cookie:`omni_session=${ms.rawToken}`}});check(otherMarket.status===404,'other marketplace denied');
      for(const format of ['txt','json']){
        const download=await fetch(base+route+`/export?version=2&format=${format}`,{headers});check(download.status===200,'download success');
        const outputText=await download.text();check(outputText.includes(edited.title),'download contains saved title');
        fs.writeFileSync(path.join(output,`HIJA_${market}_DRAFT.${format}`),outputText);
      }
      const oldExport=await api(route+'/export?version=1');check(oldExport.status===409,'export stale version denied');
      const risky=await api(route+'/draft',{...request,action:'save',expectedVersion:2,draft:{...edited,title:'Disney necklace'}});check(risky.status===200&&risky.body.record.content.ip.verdict!=='OK','IP hit retained visibly');
      check((await api(route+'/export?version=3')).status===409,'risky export denied');
      await api(route+'/draft',{...request,action:'save',expectedVersion:3,draft:edited});
      check(JSON.stringify(await all('SELECT id FROM listings'))===JSON.stringify(beforeCommerce),'no commerce writes');
      check((await all('SELECT state FROM research_projects WHERE id=?',[p]))[0].state==='EVIDENCE_INTAKE','no authority transitions');
      receipt.push({market,projectId:p,result:'API_PASS',version:4,exportedVersion:2,generator:'FACT_TEMPLATE_V1 + editorial text grounded in staff source',ui:'NOT_EXECUTED'});
      restartProjects.push({id:p,token:s.rawToken,title:edited.title,rows:state.research.totalRows});
    }
    await migrateStaffWorkflow(db);check((await all('PRAGMA foreign_key_check')).length===0,'idempotent additive schema and foreign keys');
    const restartDir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-restart-'));
    const dbPath=path.join(restartDir,'uat.sqlite');
    await new Promise((r,j)=>db.run('VACUUM INTO ?',[dbPath],e=>e?j(e):r()));
    const {spawnSync}=require('node:child_process');
    for(let start=0;start<2;start++){
      const child=spawnSync(process.execPath,[...process.execArgv,path.join(__dirname,'helpers/staff_restart_probe.cjs')],{encoding:'utf8',timeout:30000,input:JSON.stringify({dbPath,envPath:path.join(restartDir,'absent.env'),importsDir:path.join(restartDir,'imports'),projects:restartProjects})});
      check(child.status===0&&child.stdout.includes('STAFF_RESTART verified=2'),`fresh server start ${start+1}: ${child.stderr}`);
    }
    receipt.push({restart:'TWO_FRESH_PROCESSES_PASS',projects:2,ui:'NOT_EXECUTED'});
    fs.writeFileSync(path.join(output,'execution-receipt.json'),JSON.stringify({node:process.version,measured,passed:measured,failed:0,ui:'NOT_EXECUTED',liveLLM:'NOT_USED',receipt},null,2));
    console.log(`STAFF_API measured=${measured} passed=${measured} failed=0 outputs=${output}`);
  }finally{await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
