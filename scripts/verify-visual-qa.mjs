import assert from 'node:assert/strict';
import { openBrowser } from '@remotion/renderer';

// Run against a built frontend. All API responses and writes stay inside this browser.
const origin = process.env.VISUAL_QA_URL || 'http://127.0.0.1:3101';
const browser = await openBrowser('chrome');
try {
  const page = await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  await page._client().send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const project={_id:'fixture',workspaceId:'fixture',storyboardId:'fixture',title:'Visual QA fixture',settings:{duration:10,fps:30,aspectRatio:'16:9',language:'en',subtitlesEnabled:false},status:'ready'};
    let scene=JSON.parse(sessionStorage.getItem('qa-scene')||'null')||{_id:'fixture',projectId:'fixture',storyboardId:'fixture',sceneNumber:1,title:'QA fixture',duration:10,narration:'',visualDescription:'Fixture only',narrationOptional:true,visualAssetIds:[],updatedAt:'2026-11-06T00:00:00.000Z',transition:{type:'none',duration:0},motionGraphics:[{type:'remotion-explainer',properties:{points:['Label']}}],editing:{visualMode:'remotion',visualPlan:{version:1,width:1600,height:900,background:'#ffffff',accent:'#008800',textColor:'#111111',description:'QA fixture',elements:[{id:'label',kind:'text',x:200,y:300,text:'Label',fontSize:40,fill:'#111111'}]}}};
    window.fixtureWrites=0;
    window.fetch=async(url,options={})=>{
      const route=String(url).replace(/^.*\\/api\\/v1/,'');
      let data;
      if(options.method && options.method!=='GET'){
        if(options.method!=='PATCH'||route!=='/scenes/fixture/editor')throw new Error('Unexpected write blocked: '+route);
        const body=JSON.parse(options.body);scene={...scene,...body,updatedAt:new Date().toISOString()};sessionStorage.setItem('qa-scene',JSON.stringify(scene));window.fixtureWrites++;data={scene};
      }else if(route==='/auth/me')data={user:{_id:'fixture',name:'QA fixture',defaultWorkspaceId:'fixture'}};
      else if(route==='/auth/csrf')data={csrfToken:'fixture'};
      else if(route==='/workspaces')data={workspaces:[{workspace:{_id:'fixture',name:'QA fixture',type:'personal'},role:'owner'}]};
      else if(route==='/providers')data={providers:[]};
      else if(route==='/narration/voices')data={voices:[]};
      else if(route==='/storyboards/fixture')data={storyboard:{_id:'fixture',workspaceId:'fixture',projectId:'fixture',status:'approved'}};
      else if(route==='/projects/fixture')data={project};
      else if(route==='/projects/fixture/scenes')data={scenes:[scene]};
      else if(route==='/projects/fixture/media')data={assets:[]};
      else if(route.includes('video-render')||route.includes('media-batches')||route.includes('video-jobs')||route.includes('content-jobs'))data={job:null};
      else data={projects:[project]};
      return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  const wait = async check => {for(let i=0;i<80;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser check timed out');};
  await page.goto({url:origin+'/storyboards/fixture/media',timeout:30000});
  const summary=()=>page.evaluate(()=>document.querySelector('.scene-inline-editor .visual-quality-check summary')?.textContent||'');
  await wait(async()=> (await summary()).includes('No sampled issues'));
  const move=async x=>page.evaluate(value=>{
    const details=[...document.querySelectorAll('.scene-inline-editor details')];details.forEach(item=>item.open=true);
    const input=[...document.querySelectorAll('.scene-inline-editor label')].find(label=>label.firstChild?.textContent==='x')?.querySelector('input');
    if(!input)throw new Error('Object x control missing');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));
  },x);
  await move(1580);
  await wait(async()=> (await summary()).includes('1 warning'));
  await page.evaluate(()=>document.querySelector('.scene-inline-editor .visual-quality-check button').click());
  const position=await page.evaluate(()=>Number(document.querySelector('input[aria-label="Animation position"]').value));
  assert(position>0,'Inspect must seek to the flagged frame');
  await move(200);
  await wait(async()=> (await summary()).includes('No sampled issues'));
  // Save a changed, valid position, then reload to exercise the editor's persistence flow.
  await move(220);
  await wait(()=>page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Save edits' && !button.disabled)));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Save edits').click());
  await wait(()=>page.evaluate(()=>window.fixtureWrites===1 && document.querySelector('.scene-inline-editor .primary-button')?.disabled));
  await page.goto({url:origin+'/storyboards/fixture/media',timeout:30000});
  await wait(async()=> (await summary()).includes('No sampled issues'));
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('qa-scene')).editing.visualPlan.elements[0].x),220);
  console.log('PASS: clipping warning appears, Inspect seeks, correction clears warning, saved correction survives reload. Fixture API only; no AI calls or real project changes.');
} finally { await browser.close({silent:true}); }
