import test from 'node:test';
import assert from 'node:assert/strict';
import {timestamp, duration, timeline, family, reader} from './model.mjs';

const tasks = [
  {id: 'root', run_id: 'r', status: 'dispatched', created_at: '2026-11-25 14:00:00'},
  {id: 'child', parent_id: 'root', run_id: 'r', display_name: '<img onerror=alert(1)>', status: 'dispatched'},
  {id: 'other', run_id: 'r'}, {id: 'foreign', parent_id: 'root', run_id: 'other'}
];
const dispatches = [
  {id: 'd1', taskId: 'child', runId: 'r', status: 'failed', dispatchedAt: '2026-11-25 14:00:10', completedAt: '2026-11-25 14:00:12'},
  {id: 'd2', taskId: 'child', runId: 'r', status: 'dispatched', dispatchedAt: '2026-11-25 14:01:00'},
  {id: 'bad', taskId: 'other', runId: 'r', status: 'dispatched', dispatchedAt: '2026-11-25 13:00:00'},
  {id: 'foreign', taskId: 'child', runId: 'other', dispatchedAt: '2026-11-25 12:00:00'}
];
const gates = [{id: 'g1', task_id: 'root', run_id: 'r', status: 'pending', created_at: '2026-11-25 14:00:15'}];
const now = timestamp('2026-11-25T14:02:00Z');

test('SQLite timestamps are UTC regardless of process TZ; invalid time has no duration', () => {
  assert.equal(timestamp('2026-11-25 14:00:00'), timestamp('2026-11-25T14:00:00Z'));
  assert.equal(timestamp(null), null); assert.equal(timestamp('garbage'), null);
  assert.equal(duration(18881000), '5 ч 14 мин 41 с');
});
test('one task family and run only, retries separate, a single wall-clock domain', () => {
  const m = timeline({tasks, dispatches, gates}, 'root', now);
  assert.deepEqual(m.rows.map(r => r.id), ['root', 'child', 'g1']);
  assert.deepEqual(m.rows[1].attempts.map(a => a.id), ['d1', 'd2']);
  assert.equal(m.start, timestamp('2026-11-25 14:00:00'));
  assert.equal(m.end, now); assert.equal(m.rows[1].attempts[0].duration, '2 с');
  assert.equal(m.rows[1].attempts[1].duration, '1 мин 0 с');
  assert.match(m.unknown, /отсутствуют/);
});
test('running attempt and human wait grow with current time, settled attempts do not', () => {
  const a = timeline({tasks, dispatches, gates}, 'root', now);
  const b = timeline({tasks, dispatches, gates}, 'root', now + 10000);
  assert.equal(a.rows[1].attempts[0].end, b.rows[1].attempts[0].end);
  assert.equal(b.rows[1].attempts[1].end - a.rows[1].attempts[1].end, 10000);
  assert.equal(b.rows[2].attempts[0].end, now + 10000);
  assert.equal(a.current.length, 2);
});
test('empty, missing, invalid intervals and cyclic family are safe', () => {
  assert.equal(timeline({tasks, dispatches: [], gates: []}, 'root', now).hasHistory, false);
  assert.equal(timeline({tasks, dispatches, gates}, 'missing', now), null);
  assert.equal(family([{id:'a', parent_id:'b'},{id:'b', parent_id:'a'}], 'a').length, 2);
  const m = timeline({tasks, dispatches: [{...dispatches[0], completedAt: '2026-11-25 13:00:00'}], gates: []}, 'root', now);
  assert.equal(m.hasHistory, false); assert.match(m.rows[1].attempts[0].duration, /Нет данных/);
});
test('reader paginates and scopes worker detail requests; retains only approved fields', async () => {
  const calls = [];
  const api = reader(async ({method, params}) => {
    calls.push({method, params});
    if (method.endsWith('workerList')) return {ok:true,result:{workers: params.cursor ? [{taskId:'other',dispatchId:'bad'}] : [{taskId:'child',dispatchId:'d1'}],page:{nextCursor: params.cursor ? null : 'next'}}};
    if (method.endsWith('workerShow')) return {ok:true,result:{dispatch:{...dispatches[0], startOptions:{secret:'do not retain'}}}};
    if (method.endsWith('gateList')) return {ok:true,result:{gates:[...gates,{id:'other',task_id:'other',run_id:'r'}]}};
    throw Error(method);
  });
  const data = await api.history('r', tasks, 'root');
  assert.equal(calls.filter(c => c.method.endsWith('workerList')).length, 2);
  assert.deepEqual(calls.filter(c => c.method.endsWith('workerShow')).map(c => c.params.dispatch), ['d1']);
  assert.equal(data.dispatches.length, 1); assert.equal(data.gates.length, 1);
  assert.ok(!JSON.stringify(data.dispatches).includes('secret'));
});
test('authorization errors propagate without exposing server response', async () => {
  const api = reader(async () => ({ok:false,error:{message:'sensitive'}}));
  await assert.rejects(api.tasks('r'), /Не удалось/);
});
