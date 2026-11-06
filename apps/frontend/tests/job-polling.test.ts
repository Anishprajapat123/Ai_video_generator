import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchJob } from '../lib/job-polling';
import { ApiError, forgetRecoveredJob } from '../lib/api';

test('job watcher reconnects after network and quota errors with bounded backoff and no submissions', async t => {
  const delays: number[] = [];let reads=0;const errors:string[]=[];
  t.mock.method(globalThis,'setTimeout',(callback:()=>void,delay:number)=>{delays.push(delay);return setImmediate(callback);});
  let stop=()=>{};
  await new Promise<void>(resolve=>{
    stop=watchJob(async()=>{
      reads++;
      if(reads===1)throw new ApiError('Disconnected',0);
      if(reads===2)throw new ApiError('Slow down',429);
      if(reads===3)return true;
      resolve();return false;
    },message=>errors.push(message));
  });
  stop();assert.equal(reads,4);assert.equal(errors.length,2);
  assert.deepEqual(delays,[1000,4000,8000,2000]);
});
test('job watcher stops on revoked access and cancels scheduled reads when disposed', async t => {
  const callbacks:(()=>void)[]=[];let reads=0;let message='';
  t.mock.method(globalThis,'setTimeout',(callback:()=>void)=>{callbacks.push(callback);return 1;});
  t.mock.method(globalThis,'clearTimeout',()=>{});
  const stop=watchJob(async()=>{reads++;throw new ApiError('Forbidden',403);},value=>message=value);
  callbacks.shift()!();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);assert.equal(callbacks.length,0);assert.match(message,/Sign in or reload/);stop();
  const cancel=watchJob(async()=>{reads++;return true;},()=>{});cancel();
  callbacks.shift()!();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);
});
test('terminal recovery clears only matching persisted submissions, including lost POST responses', t => {
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const memory=new Map([['studio:generation:one',JSON.stringify({jobId:'job'})],['studio:generation:two',JSON.stringify({requestId:'request'})],['studio:generation:other',JSON.stringify({jobId:'other'})],['other-settings','keep']]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return memory.size;},key:(index:number)=>[...memory.keys()][index]||null,getItem:(key:string)=>memory.get(key)||null,removeItem:(key:string)=>memory.delete(key)}});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');});
  forgetRecoveredJob({_id:'job',requestId:'request',status:'processing'});assert.equal(memory.size,4);
  forgetRecoveredJob({_id:'job',requestId:'request',status:'completed'});
  assert.deepEqual([...memory.keys()],['studio:generation:other','other-settings']);
});
