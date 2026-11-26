import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionKey,readSelection,saveSelection} from './selection.mjs';
test('view IDs survive a new module instance and isolate workspace, instance, context and kind',async()=>{
 const before=globalThis.sessionStorage,items=new Map;
 globalThis.sessionStorage={getItem:key=>items.get(key)??null,setItem:(key,v)=>items.set(key,v)};
 try{
  const identity={id:'a',instanceId:'1'},a={runId:'r',taskId:'a'},b={runId:'r',taskId:'b'};
  saveSelection(selectionKey(identity,null,'context'),a);
  saveSelection(selectionKey(identity,a,'review'),{selectedId:'dispatch_a'});
  saveSelection(selectionKey(identity,b,'review'),{selectedId:'dispatch_b'});
  saveSelection(selectionKey(identity,a,'plan-revision'),{gateId:'old_gate'});
  const fresh=await import('./selection.mjs?simulated-reload');
  assert.deepEqual(fresh.readSelection(selectionKey(identity,null,'context')),a);
  assert.deepEqual(fresh.readSelection(selectionKey(identity,a,'review')),{selectedId:'dispatch_a'});
  assert.deepEqual(fresh.readSelection(selectionKey(identity,b,'review')),{selectedId:'dispatch_b'});
  assert.deepEqual(fresh.readSelection(selectionKey(identity,a,'plan-revision')),{gateId:'old_gate'});
  assert.equal(fresh.readSelection(selectionKey({...identity,instanceId:'2'},a,'review')),undefined);
  assert.equal(fresh.readSelection(selectionKey({id:'b',instanceId:'1'},a,'review')),undefined);
 }finally{globalThis.sessionStorage=before;}
});
test('unavailable or malformed browser storage does not prevent a scoped in-memory selection',()=>{
 const before=globalThis.sessionStorage;
 try{globalThis.sessionStorage={getItem:()=>'{',setItem:()=>{throw Error('disabled');}};
 const key=selectionKey({id:'test',instanceId:'3'},null,'context');saveSelection(key,{runId:'r',taskId:'t'});assert.deepEqual(readSelection(key),{runId:'r',taskId:'t'});
 }finally{globalThis.sessionStorage=before;}
});
