import test from 'node:test';
import assert from 'node:assert/strict';
import * as routes from './routes.mjs';
import {newDraft,requestEnvelope,coordinatorPrompt,resolvedRoute} from './draft.mjs';
const workspace={id:'repo::card',instanceId:'instance',repoId:'repo'};
const diff=count=>'diff --git a/file b/file\n--- a/file\n+++ b/file\n'+Array.from({length:count},(_,i)=>(i%2?'-old':'+new')+i).join('\n');

test('quick preview retains conditional review and actual diff uses the strict 120-line boundary',()=>{
  assert.ok(routes.routeFor('quick').includes('review'));
  assert.equal(routes.QUICK_REVIEW_LINES,120);
  for(const lines of [0,119,120,121]){
    assert.equal(routes.changedLines(diff(lines)),lines);
    assert.equal(routes.needsIndependentReview('quick',diff(lines)),lines>120);
    assert.equal(routes.routeFor('quick',false,diff(lines)).includes('review'),lines>120);
  }
  assert.equal(routes.needsIndependentReview('quick',null),true);
  assert.equal(routes.needsIndependentReview('task',diff(0)),true);
  assert.equal(routes.changedLines('--- a\n+++ b\n+\n-\n+new\n-old\n++ignored\n--ignored'),2);
  assert.ok(routes.routeFor('quick',true,diff(120)).includes('visual'));
  assert.ok(!routes.routeFor('quick').includes('approval'));
});
test('epic checks each phase and final result; bug clarifies, reproduces and agrees the cause before implementation',()=>{
  assert.deepEqual(routes.routeFor('epic'),['clarify','design','approval','milestones','checks','review','acceptance','finish']);
  assert.deepEqual(routes.routeFor('bug').slice(0,4),['clarify','reproduce','plan','approval']);
  const epic=requestEnvelope({...newDraft(),description:'Большая задача',mode:'epic'},workspace,'chat');
  assert.equal(epic.routePolicy.checksAfterEachPhase,true);assert.equal(epic.routePolicy.finalChecks,true);
  const bug=requestEnvelope({...newDraft(),description:'Ошибка',mode:'bug'},workspace,'chat');
  assert.equal(bug.routePolicy.confirmCauseBeforeImplement,true);
  const text=coordinatorPrompt(bug);
  assert.ok(text.indexOf('Уточнение симптомов')<text.indexOf('Воспроизведение'));
  assert.ok(text.indexOf('Согласование причины')<text.indexOf('5. Реализация'));
});
test('preview, stored rules and coordinator prompt share descriptions, two correction rounds and owner acceptance',()=>{
  for(const mode of Object.keys(routes.modes)){
    const draft={...newDraft(),description:'Постановка',mode,visual:true};
    const preview=resolvedRoute(draft),envelope=requestEnvelope(draft,workspace,'chat'),prompt=coordinatorPrompt(envelope);
    assert.deepEqual(preview.details,envelope.routeDetails);assert.deepEqual(preview.policy,envelope.routePolicy);
    assert.equal(envelope.routePolicy.correctionRounds,2);assert.equal(envelope.routePolicy.acceptance,'owner');
    for(const stage of preview.details){assert.ok(prompt.includes(stage.title));assert.ok(prompt.includes(stage.detail));}
    assert.match(prompt,/двух раундов исправлений/);assert.match(prompt,/приёмка владельцем/);
    assert.match(prompt,/Создание Run\/Task не подтверждает выполнение/);
  }
});
