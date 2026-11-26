import test from 'node:test';
import assert from 'node:assert/strict';
import {completionRecovery} from './completion.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('busy completions coalesce and a completion during recovery gets one serial follow-up',async()=>{
  let busy=true,runs=0,concurrent=0,maximum=0;
  const first=deferred(),second=deferred();
  const queue=completionRecovery({current:()=>({key:'instance/request/operation',sessionId:'selected'}),isBusy:()=>busy,run:async()=>{
    maximum=Math.max(maximum,++concurrent);runs++;
    if(runs===1)await first.promise;else second.resolve();
    concurrent--;
  }});
  queue.notify('foreign');queue.notify('selected');queue.notify('selected');
  assert.equal(runs,0);busy=false;const done=queue.idle();assert.equal(runs,1);
  queue.notify('selected');queue.notify('selected');first.resolve();await done;await second.promise;
  assert.equal(runs,2);assert.equal(maximum,1);await queue.idle();assert.equal(runs,2);
});
test('closing, replacing the instance or changing the operation invalidates a queued event',async()=>{
  for(const change of ['closed','instance','operation']){
    let busy=true,runs=0,scope={key:'instance/request/operation',sessionId:'selected'};
    const queue=completionRecovery({current:()=>scope,isBusy:()=>busy,run:async()=>runs++});
    queue.notify('selected');
    if(change==='closed')queue.dispose();else scope={...scope,key:change+'/new'};
    busy=false;await queue.idle();assert.equal(runs,0);
  }
});
test('disposing an active recovery drops its follow-up event',async()=>{
  const gate=deferred();let runs=0;
  const queue=completionRecovery({current:()=>({key:'operation',sessionId:'selected'}),isBusy:()=>false,run:async()=>{runs++;await gate.promise;}});
  queue.notify('selected');queue.notify('selected');queue.dispose();gate.resolve();await queue.idle();
  await Promise.resolve();assert.equal(runs,1);
});
