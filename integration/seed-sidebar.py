"""Bounded synthetic long-plan/history fixture, only in a disposable profile."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'timeline'))
root=Path(sys.argv[1]).resolve()
record=json.loads((root/'instance.json').read_text())
if record['profile']!=str(root/'profile') or record['runtime']!=str(root/'runtime'):raise ValueError('Not an isolated disposable profile')
spec=importlib.util.spec_from_file_location('parent_seed',Path(__file__).resolve().parent.parent/'timeline/seed-parent-history.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.seed(root)
with sqlite3.connect(root/'profile/orchestration.db') as db:
 db.execute("UPDATE tasks SET created_at='2026-11-25 08:33:59' WHERE id='task_fixture_a'")
 db.execute("INSERT INTO decision_gates(id,run_id,task_id,question,status,created_at) VALUES(?,?,?,?,?,?)",('gate_fixture_other_pending','run_fixture_shared','task_fixture_a','Принимаете результат?','pending','2026-11-25 10:00:00'))
 plan=json.dumps(dict(kind='orca-plan',schema=1,revision=1,previousGateId=None,plan='Синтетический длинный план\n'+'\n'.join(str(i)+'. Проверить переход, привязку и сохранность данных.' for i in range(1,81))),ensure_ascii=False)
 db.execute("INSERT INTO decision_gates(id,run_id,task_id,question,status,created_at) VALUES(?,?,?,?,?,?)",('gate_fixture_long_plan','run_fixture_shared','task_fixture_current',plan,'pending','2026-11-26 09:00:00'))
print('Only disposable synthetic long-plan and 24h history fixtures seeded')
