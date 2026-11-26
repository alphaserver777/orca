"""Four long synthetic tasks, completed route and a historical child; disposable only."""
import importlib.util,json,sqlite3,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve()
spec=importlib.util.spec_from_file_location('overview',Path(__file__).with_name('seed-overview.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fixtures=json.loads((root/'overview-fixtures.json').read_text()) if (root/'overview-fixtures.json').exists() else module.seed(root)
record=json.loads((root/'instance/instance.json').read_text())
assert record['profile']==str(root/'instance/profile')
call=lambda m,p:module.rpc(Path(record['profile'])/'orca-runtime.json',m,p,timeout=120)
parent=fixtures['parent']
legacy=call('worktree.create',{'repo':'id:'+parent['repoId'],'name':'overview-legacy','baseBranch':'master','setup':'skip','parentWorktree':'id:'+parent['id']})['worktree']
titles={'task_overview_a':'Кнопка «Таймлайн» в Orca: согласование полного плана работы','task_second':'Полный цикл разработки в Orca с проверкой всех переходов','task_overview_b':'Раунд 1: кнопка в карточке и привязка к задаче исходного пространства','task_chart_four':'Повторное независимое ревью после исправления замечаний P1'}
with sqlite3.connect(Path(record['profile'])/'orchestration.db') as db:
    for task,title in list(titles.items())[:3]:db.execute('UPDATE tasks SET task_title=? WHERE id=?',(title,task))
    db.execute('INSERT INTO tasks(id,run_id,task_title,spec,status,created_at,completed_at) VALUES(?,?,?,?,?,?,?)',('task_chart_four','run_second',titles['task_chart_four'],'Synthetic fixture','completed','2026-11-26 07:00:00','2026-11-26 07:15:00'))
    # Completed task has recorded intervals for each stage; no invented UI stages.
    for i,title in enumerate(['Уточнение','План','Реализация','Проверки','Ревью','Коммит']):
        task='task_chart_stage_'+str(i)
        start='2026-11-26 07:00:'+['00','05','08','11','11.1','15'][i];end='2026-11-26 07:00:'+['05','08','11','11.1','14','15.1'][i]
        db.execute('INSERT INTO tasks(id,run_id,parent_id,task_title,spec,status,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?)',(task,'run_overview','task_overview_b',title,'Synthetic fixture','completed',start,end))
        db.execute('INSERT INTO dispatch_contexts(id,run_id,task_id,status,dispatched_at,completed_at) VALUES(?,?,?,?,?,?)',('ctx_chart_'+str(i),'run_overview',task,'completed',start,end))
    db.execute("UPDATE tasks SET completed_at='2026-11-26 07:00:16' WHERE id='task_overview_b'")
    for gate,question,start,end in [('gate_chart_plan','Согласовать план?','07:00:08','07:00:08.5'),('gate_chart_accept','Принимаете результат?','07:00:14','07:00:15')]:
        db.execute('INSERT INTO decision_gates(id,run_id,task_id,question,status,created_at,resolved_at) VALUES(?,?,?,?,?,?,?)',(gate,'run_overview','task_overview_b',question,'resolved','2026-11-26 '+start,'2026-11-26 '+end))
module.bind(call,fixtures['b']['id'],fixtures['b']['instanceId'],'run_second','task_chart_four',True)
# Persist a legacy lineage fixture after stopping this disposable runtime.
(root/'chart-fixtures.json').write_text(json.dumps({'titles':titles,'legacyId':legacy['id']}))
print('Four synthetic tasks and completed route seeded; models called: 0')
