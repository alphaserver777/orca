import assert from 'node:assert/strict';
import test from 'node:test';
import {modes,routeFor,stages,suggestMode} from './routes.mjs';

test('routes preview the same steps that can be stored on launch',()=>{
  for (const mode of Object.keys(modes)) {
    const route = routeFor(mode,true);
    assert.ok(route.every(step=>Object.hasOwn(stages,step)));
    assert.equal(route.filter(step=>step==='acceptance').length,1);
    assert.equal(route.includes('visual'),mode!=='review');
  }
  assert.deepEqual(routeFor('review'),['review','acceptance']);
  assert.ok(!routeFor('quick').includes('approval'));
  assert.deepEqual(routeFor('bug').slice(0,2),['clarify','reproduce']);
  assert.equal(routeFor('refactor')[0],'baseline');
  assert.throws(()=>routeFor('constructor'));
});
test('automatic suggestion explains itself and an unclassified description uses the ordinary task route',()=>{
  for (const [text,mode] of [['Проведи ревью кода','review'],['Исправь баг','bug'],['Исправь опечатку','quick'],['Рефакторинг модуля','refactor'],['Перенос по этапам','epic'],['Добавь поиск','task']]) {
    const suggestion=suggestMode(text);
    assert.equal(suggestion.mode,mode);
    assert.ok(suggestion.reason.length>0);
  }
});
