const fs=require('node:fs');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
process.env.NODE_ENV='development';process.env.OMNI_DB_PATH=input.dbPath;process.env.DOTENV_PATH=input.envPath;process.env.TEST_IMPORTS_DIR=input.importsDir;
const {app,db,databaseReady,backgroundAgentTimer}=require('../../server/server');
(async()=>{
  await databaseReady;clearInterval(backgroundAgentTimer);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let verified=0;
  try{
    for(const p of input.projects){
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/staff-workflow/${p.id}`,{headers:{Cookie:`omni_session=${p.token}`}});
      const result=await response.json();
      if(response.status!==200||result.record?.version!==4||result.record.content.draft.title!==p.title||result.research.totalRows!==p.rows)throw new Error('RESTART_CONTENT_MISMATCH');
      verified++;
    }
    console.log(`STAFF_RESTART verified=${verified}`);
  }finally{await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
