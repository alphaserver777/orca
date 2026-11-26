import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeline, stagesFor} from './model.mjs';

test('review retries, sequential acceptance and real concurrency keep recorded times; foreign pending gate is excluded',()=>{
  const tasks=[{id:'root',run_id:'r',created_at:'2026-11-25 00:00:00'},
    {id:'review',parent_id:'root',run_id:'r',task_title:'Ревью'}];
  const dispatches=[['d1','01:00:00','01:30:00'],['d2','02:00:00','02:30:00']].map(([id,start,end])=>
    ({id,taskId:'review',runId:'r',status:'completed',dispatchedAt:'2026-11-25 '+start,completedAt:'2026-11-25 '+end}));
  const gate={id:'result',task_id:'review',run_id:'r',question:'Принять результат реализации плана?',status:'pending',created_at:'2026-11-25 03:00:00'};
  const now=Date.parse('2026-11-25T23:00:00Z');
  const render=gates=>stagesFor(timeline({tasks,dispatches,gates},'root',now,'review').rows,'review');
  let rows=render([gate,{...gate,id:'other',task_id:'root'}]);
  assert.equal(rows.find(r=>r.id==='approval').attempts.length,0);
  const review=rows.find(r=>r.id==='review').attempts,acceptance=rows.find(r=>r.id==='acceptance').attempts;
  assert.equal(review.length,2);assert.equal(acceptance.length,1);
  assert.ok(acceptance[0].start>review[1].end);assert.equal(acceptance[0].end,now);
  rows=render([{...gate,created_at:'2026-11-25 01:15:00'}]);
  assert.ok(rows.find(r=>r.id==='acceptance').attempts[0].start<review[0].end,'A real concurrent gate is not moved after the review');
});

test('structured plan content cannot be mistaken for acceptance',()=>{
  const rows=[{question:JSON.stringify({kind:'orca-plan',schema:1,plan:'Приёмка результата'}),attempts:[{source:'Gate',id:'plan'}]}];
  assert.deepEqual(stagesFor(rows).find(r=>r.id==='approval').attempts.map(a=>a.id),['plan']);
});

test('groups both reviews and distinguishes decisions without guessing by order', () => {
  const r = 'run_abc';
  const t = '2026-11-25T12:00:00Z';
  const tasks = [{id:'root',run_id:r,created_at:t},
    ...['Первое ревью', 'Повторное независимое ревью'].map((task_title,i)=>({id:'r'+i,run_id:r,parent_id:'root',task_title}))];
  const dispatches = ['failed','completed'].map((status,i)=>({id:'d'+i,taskId:'r'+i,runId:r,status,dispatchedAt:t,completedAt:'2026-11-25T12:01:00Z'}));
  const gates = ['Принимаете результат?', 'Согласовать план?', 'Продолжить?'].map((question,i)=>({id:'g'+i,task_id:'root',run_id:r,question,status:'resolved',created_at:t,resolved_at:t}));
  const model = timeline({tasks,dispatches,gates},'root');
  const stages = new Map(stagesFor(model.rows).map(row=>[row.id,row.attempts]));
  assert.deepEqual(stages.get('review').map(a=>a.status),['failed','completed']);
  assert.deepEqual(stages.get('approval').map(a=>a.id),['g1']);
  assert.deepEqual(stages.get('acceptance').map(a=>a.id),['g0']);
  assert.deepEqual(stages.get('checks'),[]);
  assert.deepEqual(stages.get('other').map(a=>a.id),['g2']);
});

test('recognizes ordinary check and testing task titles', () => {
  const titles = ['Тестирование', 'Проверка', 'Проверка регрессии', 'Независимая проверка', 'Реализация и проверка'];
  const rows = titles.map((label, id) => ({label, attempts:[{id,source:'Dispatch'}]}));
  const stages = new Map(stagesFor(rows).map(row => [row.id,row.attempts.map(attempt => attempt.id)]));
  assert.deepEqual(stages.get('checks'),[0,1,2]);
  assert.deepEqual(stages.get('review'),[3]);
  assert.deepEqual(stages.get('implementation'),[4]);
  assert.equal(stages.has('other'),false);
});
