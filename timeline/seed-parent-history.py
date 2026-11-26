"""Extend only an isolated timeline fixture with a bound grandchild and early root decision."""
import argparse
import json
import sqlite3
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec


def seed(directory):
    spec=spec_from_file_location('seed_disposable',Path(__file__).with_name('seed-disposable.py'))
    module=module_from_spec(spec);spec.loader.exec_module(module)
    result=module.seed(directory)
    record=json.loads((directory/'instance.json').read_text())
    if record['profile']!=str(directory/'profile'): raise ValueError('Not this disposable profile')
    with sqlite3.connect(directory/'profile/orchestration.db') as db:
        db.execute("UPDATE tasks SET created_at='2026-11-26 08:36:17', completed_at='2026-11-26 08:50:00'")
        db.execute("UPDATE dispatch_contexts SET dispatched_at='2026-11-26 08:45:00', completed_at='2026-11-26 08:46:00'")
        db.execute("UPDATE tasks SET created_at='2026-11-26 08:33:59', completed_at=NULL, status='ready' WHERE id='task_fixture_a'")
        db.execute("UPDATE tasks SET created_at='2026-11-26 08:36:17' WHERE id='task_fixture_a_child'")
        db.execute("INSERT INTO tasks(id,run_id,parent_id,task_title,spec,status,created_at) VALUES(?,?,?,?,?,?,?)",
            ('task_fixture_current','run_fixture_shared','task_fixture_a_child','Реализация A','Synthetic fixture','ready','2026-11-26 08:44:01'))
        db.execute("INSERT INTO tasks(id,run_id,parent_id,task_title,spec,status) VALUES(?,?,?,?,?,?)",
            ('task_fixture_future','run_fixture_shared','task_fixture_a','Приёмка A','Synthetic fixture','pending'))
        # Preserve the observed production ordering without embedding any production identity.
        db.execute("INSERT INTO decision_gates(id,run_id,task_id,question,status,created_at,resolved_at) VALUES(?,?,?,?,?,?,?)",
            ('gate_fixture_early','run_fixture_shared','task_fixture_a','Согласовать план A?','resolved','2026-11-26 08:34:00','2026-11-26 08:35:47'))
        db.execute("INSERT INTO decision_gates(id,run_id,task_id,question,status,created_at,resolved_at) VALUES(?,?,?,?,?,?,?)",
            ('gate_fixture_b','run_fixture_shared','task_fixture_b','Согласовать план B?','resolved','2026-11-26 08:34:00','2026-11-26 08:35:47'))
    a=result['cards'][0]
    binding={'schema':1,'workspace':{'id':a['id'],'instanceId':a['instanceId']},'links':[{'runId':'run_fixture_shared','taskId':'task_fixture_current'},{'runId':'run_fixture_extra','taskId':'task_fixture_a_extra'}]}
    # Card A is now explicitly bound to the grandchild, never inferred from its path.
    path=Path(a['id'].split('::',1)[1])/'.orca-task-timeline.json'
    if not path.is_relative_to(directory): raise ValueError('Not a disposable card')
    path.write_text(json.dumps(binding))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True)
    args=parser.parse_args();seed(args.directory.resolve());print('Isolated parent-history fixture seeded')
