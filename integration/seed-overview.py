"""Finite synthetic data in a disposable instance. No models or real decisions."""
import argparse,json,sqlite3,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'timeline'))
from bind import rpc,bind

def seed(root):
    record=json.loads((root/'instance/instance.json').read_text());profile=Path(record['profile'])
    if profile!=root/'instance/profile':raise ValueError('Not this disposable')
    call=lambda m,p:rpc(profile/'orca-runtime.json',m,p,timeout=120)
    call('orchestration.runList',{})  # Initialize native lazy schema in this disposable only.
    repos=call('repo.list',{})['repos'];repo=repos[0] if repos else call('repo.add',{'path':record['project'],'kind':'git'})['repo']
    def card(name,parent=None):
        existing=next((c for c in call('worktree.list',{'limit':200})['worktrees'] if c.get('displayName')==name),None)
        if existing:
            if existing.get('parentWorktreeId')!=(parent['id'] if parent else None):raise ValueError('Fixture parent changed')
            return existing
        return call('worktree.create',{'repo':'id:'+repo['id'],'name':name,'baseBranch':'master','setup':'skip',**({'parentWorktree':'id:'+parent['id']} if parent else {'noParent':True})})['worktree']
    parent=card('overview-parent');a=card('overview-a',parent);review=card('overview-review',parent);b=card('overview-b',parent);foreign=card('overview-foreign');one=card('overview-one');empty=card('overview-empty')
    with sqlite3.connect(profile/'orchestration.db') as db:
        for run in ('run_overview','run_second'):
            db.execute('INSERT INTO runs(id,objective) VALUES(?,?)',(run,'Disposable overview fixture'))
        for id,run,up,title,status in [('task_overview_a','run_overview',None,'ТЕСТ: первая задача','blocked'),('task_overview_review','run_overview','task_overview_a','Ревью первой задачи','completed'),('task_overview_b','run_overview',None,'ТЕСТ: соседняя задача того же Run','completed'),('task_second','run_second',None,'ТЕСТ: другой Run','blocked'),('task_unrelated','run_overview',None,'ПОСТОРОННЯЯ ЗАДАЧА','blocked')]:
            db.execute('INSERT INTO tasks(id,run_id,parent_id,task_title,spec,status,created_at) VALUES(?,?,?,?,?,?,?)',(id,run,up,title,'Disposable fixture',status,'2026-11-26 07:00:00'))
        for id,task,status,start,end in [('ctx_overview_a','task_overview_a','completed','2026-11-26 07:05:00','2026-11-26 07:09:00'),('ctx_overview_r1','task_overview_review','failed','2026-11-26 07:10:00','2026-11-26 07:11:00'),('ctx_overview_r2','task_overview_review','completed','2026-11-26 07:12:00','2026-11-26 07:13:00')]:
            db.execute('INSERT INTO dispatch_contexts(id,run_id,task_id,status,dispatched_at,completed_at) VALUES(?,?,?,?,?,?)',(id,'run_overview',task,status,start,end))
        for id,run,task,question in [('gate_overview_event','run_overview','task_unrelated',json.dumps({'kind':'orca-plan','schema':1,'revision':1,'previousGateId':None,'plan':'ТЕСТ: событие новой задачи'})),('gate_overview_plan','run_overview','task_overview_a',json.dumps({'kind':'orca-plan','schema':1,'revision':1,'previousGateId':None,'plan':'ТЕСТ: настоящий одноразовый план'})),('gate_overview_accept','run_second','task_second','Принимаете результат одноразовой задачи?')]:
            db.execute('INSERT INTO decision_gates(id,run_id,task_id,question,options) VALUES(?,?,?,?,?)',(id,run,task,question,'[]'))
    for c,run,task in [(a,'run_overview','task_overview_a'),(review,'run_overview','task_overview_review'),(b,'run_overview','task_overview_b'),(b,'run_second','task_second'),(foreign,'run_overview','task_unrelated'),(one,'run_overview','task_overview_a')]:
        bind(call,c['id'],c['instanceId'],run,task,True)
    value={k:v for k,v in locals().items() if k in ('parent','a','review','b','foreign','one','empty')}
    (root/'overview-fixtures.json').write_text(json.dumps(value));print('Disposable parent without bind, two Runs, attempts and isolated neighbor seeded')
    return value

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True,type=Path);seed(p.parse_args().directory.resolve())
