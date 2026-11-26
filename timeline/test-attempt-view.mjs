import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAttemptDetails} from './attempt-view.mjs';

// A minimal DOM harness checks controller wiring without the native shell.
class Element {
  children=[];dataset={};attributes={};ownText='';
  set textContent(value){this.ownText=String(value);this.children=[];}
  get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('\n');}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.ownText='';this.children=children;}
}
test('drawer navigates attempts, clears old output while loading and restores exact ID',async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>new Element};
  try {
    const container=new Element;
    const attempts=['a','b'].map((id,i)=>({id,dispatchId:id,runId:'r',taskId:'t',source:'Dispatch',label:'Реализация',status:i?'completed':'failed',start:0,end:1000,duration:'1 с',attemptNumber:i+1}));
    const stage={id:'implementation',label:'Реализация',attempts};
    const replies=new Map;let reads=0;const savedIds=[];
    const call=({params})=>{reads++;return new Promise(resolve=>replies.set(params.dispatch,resolve));};
    const reply=id=>({ok:true,result:{dispatch:{id,runId:'r',taskId:'t',status:id==='a'?'failed':'completed'},projection:{dispatchId:id,taskId:'t',runId:'r',outcome:id==='a'?'failed':'succeeded'}}});
    let drawer=mountAttemptDetails(container,call,stage,{selectedId:'a',onSelection:id=>savedIds.push(id)});
    replies.get('a')(reply('a'));await new Promise(resolve=>setImmediate(resolve));
    assert.match(container.textContent,/Результат\nошибка/);
    const tabs=container.children[0].children[1];
    tabs.children[1].onclick();
    assert.match(container.textContent,/Чтение выбранной попытки/);
    assert.doesNotMatch(container.textContent,/Результат\nошибка/);
    replies.get('b')(reply('b'));await new Promise(resolve=>setImmediate(resolve));
    assert.match(container.textContent,/Результат\nуспех/);
    assert.equal(tabs.children[1].attributes['aria-pressed'],'true');
    const tab=tabs.children[1],before=reads;await drawer.update({...stage,attempts:attempts.map(a=>({...a,duration:'2 с'}))});
    assert.equal(tabs.children[1],tab);assert.equal(reads,before);assert.equal(savedIds.at(-1),'b');
    assert.match(tabs.children[1].textContent,/Реализация · Попытка 2/);
    const saved=drawer.snapshot();drawer.dispose();assert.equal(container.textContent,'');
    drawer=mountAttemptDetails(container,call,{...stage,attempts:[...attempts].reverse()},saved);
    assert.equal(drawer.snapshot().selectedId,'b');
    drawer.dispose();replies.get('b')(reply('b'));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(container.textContent,'');
  } finally {globalThis.document=previous;}
});
test('pending human gate stays read-only and says waiting for a decision, not a dispatch launch',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>new Element};
  try{
    const container=new Element;let calls=0;
    const drawer=mountAttemptDetails(container,()=>{calls++;throw Error('A gate must not read a worker');},{id:'acceptance',label:'Приёмка',attempts:[{id:'g',gateId:'g',runId:'r',taskId:'t',source:'Gate',label:'Принимаете результат?',status:'pending',start:0,end:1000,running:true,duration:'1 с'}]});
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(container.textContent,/ожидает решения/);assert.match(container.textContent,/Решение ещё не принято/);
    assert.doesNotMatch(container.textContent,/ожидает запуска|Поручение ещё открыто/);assert.equal(calls,0);drawer.dispose();
  }finally{globalThis.document=previous;}
});
