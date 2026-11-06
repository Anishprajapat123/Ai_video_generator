import {spawn} from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';

// The proxy keeps the built frontend's API rewrite away from any running user API.
const root=path.resolve(import.meta.dirname,'..');
const origin='http://localhost:3102';
const env={...process.env,NODE_ENV:'development',PORT:'5101',FRONTEND_URL:origin,
  MONGODB_URI:'mongodb://127.0.0.1:27017/ai_video_studio_browser_test?replicaSet=rs0',
  LOCAL_STORAGE_PATH:path.join(root,'storage/verification/browser-fixture'),
  GEMINI_API_KEY:'',OPENROUTER_API_KEY:'',ELEVENLABS_API_KEY:'',MUAPI_API_KEY:'',
  ENABLE_MOCK_PROVIDER:'true',ENABLE_FLOW_VIDEO:'false',ENABLE_HOSTED_VIDEO:'false',ALLOW_REGISTRATION:'true',NARRATION_PROVIDER:'piper-local'};
const children=[];
function start(args,extra={}){
  const child=spawn(process.execPath,args,{cwd:root,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostic='';
  child.stdout.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-4000);});
  child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-4000);});
  child.on('error',error=>{diagnostic=error.message;});
  children.push(child);return {child,diagnostic:()=>diagnostic};
}
async function ready(url,process){
  for(let i=0;i<80;i++){
    if(process.child.exitCode!==null)throw new Error(process.diagnostic());
    try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}
    await delay(250);
  }
  throw new Error('Isolated service startup timed out: '+process.diagnostic());
}
async function check(args,extra={}){
  const child=spawn(process.execPath,args,{cwd:root,env:{...env,...extra},windowsHide:true,stdio:'inherit'});
  children.push(child);
  const [code]=await once(child,'exit');if(code!==0)throw new Error(args[0]+' failed');
}
let proxy;
try{
  const api=start(['apps/backend/dist/server.js']);
  await ready('http://127.0.0.1:5101/api/v1/health',api);
  const web=start(['node_modules/next/dist/bin/next','start','apps/frontend','--hostname','127.0.0.1','--port','3101'],{NODE_ENV:'production'});
  await ready('http://127.0.0.1:3101',web);
  proxy=http.createServer((req,res)=>{
    const upstream=http.request({hostname:'127.0.0.1',port:req.url.startsWith('/api/v1/')?5101:3101,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
  });
  proxy.listen(3102,'127.0.0.1');await once(proxy,'listening');
  const fixturePath=path.join(root,'storage/verification/browser-fixture/visual-plan.json');
  await mkdir(path.dirname(fixturePath),{recursive:true});
  await writeFile(fixturePath,JSON.stringify({version:1,width:1600,height:900,background:'#eef6ff',accent:'#2266cc',textColor:'#142840',description:'Local water-cycle fixture.',elements:[
    {id:'cloud',kind:'ellipse',x:300,y:200,width:300,height:120,fill:'#b0cddd',motion:'float'},
    {id:'mountain',kind:'path',x:700,y:300,path:'M0 350 L200 0 L400 350 Z',fill:'#739f80'},
    {id:'water',kind:'path',x:180,y:650,path:'M0 0 Q300 -50 600 0 T1200 0',fill:'none',stroke:'#2266cc',strokeWidth:8,motion:'draw'},
    {id:'rain',kind:'path',x:430,y:350,path:'M0 0 L0 30',fill:'none',stroke:'#2266cc',strokeWidth:8,motion:'flow',moveY:200},
    {id:'label',kind:'text',x:300,y:500,fill:'#142840',text:'Rainfall',fontSize:32},
    {id:'river-label',kind:'text',x:1000,y:560,fill:'#142840',text:'River',fontSize:32}
  ]}));
  await check(['scripts/verify-browser-audio.mjs','--local-narration','--hindi','--editor','--motion','--visual-plan='+fixturePath]);
  await check(['scripts/verify-visual-qa.mjs'],{VISUAL_QA_URL:'http://127.0.0.1:3101'});
  await check(['scripts/verify-job-recovery.mjs'],{RECOVERY_TEST_URL:'http://127.0.0.1:3101'});
  console.log('PASS: isolated audio, editing, motion, visual QA and recovery browser checks.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{proxy?.closeAllConnections();proxy?.close();for(const child of children)if(child.exitCode===null)child.kill();}
