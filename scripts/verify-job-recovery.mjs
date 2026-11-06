import assert from 'node:assert/strict';
import {openBrowser} from '@remotion/renderer';
const origin=process.env.RECOVERY_TEST_URL || 'http://127.0.0.1:3101';
const browser=await openBrowser('chrome');
try {
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  await page._client().send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const draft={title:'Recovery fixture',prompt:'Explain water',duration:'30',aspectRatio:'16:9',language:'en',style:'animated-explainer',providerId:''};
    if(!sessionStorage.getItem('studio:create:fixture:fixture'))sessionStorage.setItem('studio:create:fixture:fixture',JSON.stringify({draft,projectId:'fixture'}));
    if(!sessionStorage.getItem('seeded')){localStorage.setItem('studio:generation:fixture',JSON.stringify({jobId:'fixture-job',requestId:'fixture-request'}));sessionStorage.setItem('seeded','yes');}
    const project={_id:'fixture',workspaceId:'fixture',title:'Recovery fixture',settings:{duration:30,aspectRatio:'16:9',language:'en',style:'animated-explainer'}};
    window.fetch=async(url,options={})=>{
      const route=String(url).replace(/^.*\\/api\\/v1/,'');let data;
      if(options.method&&options.method!=='GET'){sessionStorage.setItem('unexpected-writes','yes');throw new Error('All writes blocked in recovery fixture');}
      if(route==='/auth/me')data={user:{_id:'fixture',name:'Fixture',defaultWorkspaceId:'fixture'}};
      else if(route==='/workspaces')data={workspaces:[{workspace:{_id:'fixture',name:'Fixture',type:'personal'},role:'owner'}]};
      else if(route==='/providers')data={providers:[]};
      else if(route==='/projects/fixture')data={project};
      else if(route==='/projects/fixture/content-jobs/latest')data={job:{_id:'fixture-job',kind:'script',status:'processing'}};
      else if(route==='/content-jobs/fixture-job'){
        const polls=Number(sessionStorage.getItem('polls')||0)+1;sessionStorage.setItem('polls',String(polls));
        if(polls===1)return new Response('Transient tunnel failure',{status:502});
        data={job:{_id:'fixture-job',requestId:'fixture-request',kind:'script',status:'completed',result:{script:{_id:'fixture-script',projectId:'fixture',title:'Recovered script',sections:[],status:'draft',version:1}}}};
      }else if(route==='/scripts/fixture-script')data={script:{_id:'fixture-script',projectId:'fixture',title:'Recovered script',sections:[],status:'draft',version:1}};
      else data={projects:[]};
      return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  const wait=async check=>{for(let i=0;i<150;i++){try{if(await check())return;}catch(error){if(!/Execution context was destroyed/.test(error.message))throw error;}await new Promise(r=>setTimeout(r,100));}throw new Error('Recovery fixture timed out');};
  const recovering=()=>page.evaluate(()=>document.body.textContent.includes('Reconnected to saved script generation'));
  await page.goto({url:origin+'/create',timeout:30000});await wait(recovering);
  await page.goto({url:origin+'/create',timeout:30000});await wait(recovering);
  await wait(()=>page.evaluate(()=>window.location.pathname==='/scripts/fixture-script'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('unexpected-writes')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('studio:generation:fixture')),null);
  console.log('PASS: refresh restores active script, interrupted poll reconnects, result opens, recovery cache clears, zero submissions.');
}finally{await browser.close({silent:true});}
