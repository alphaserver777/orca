"""Seed only a test-disposable.py instance; no workers or agents are started."""
import argparse
import json
from pathlib import Path
import sqlite3
from bind import bind, rpc


def seed(directory):
    record=json.loads((directory/'instance.json').read_text())
    metadata=Path(record['profile'])/'orca-runtime.json'
    if metadata.parent != directory/'profile': raise ValueError('Not this disposable profile')
    call=lambda method,params:rpc(metadata,method,params)
    call('orchestration.runList',{})  # Initialize the stock lazy orchestration schema in this disposable profile.
    repos=call('repo.list',{})['repos']
    repo=repos[0] if repos else call('repo.add',{'path':record['project'],'kind':'git'})['repo']
    workspaces=call('worktree.list',{})['worktrees']
    cards=[]
    for name in ('card-a','card-b','card-empty'):
        card=next((w for w in workspaces if w.get('displayName')==name),None)
        if not card: card=call('worktree.create',{'repo':'id:'+repo['id'],'name':name,'baseBranch':'master','setup':'skip'})['worktree']
        cards.append(card)
    # Fixture SQL is confined to the disposable schema. Production writes use native Tasks.
    with sqlite3.connect(metadata.parent/'orchestration.db') as db:
        for run in ('run_fixture_shared','run_fixture_extra'):
            db.execute('INSERT OR IGNORE INTO runs(id,objective) VALUES(?,?)',(run,run))
        entries=[('task_fixture_a','run_fixture_shared',None,'Задача A'),
                 ('task_fixture_a_child','run_fixture_shared','task_fixture_a','Первое ревью A'),
                 ('task_fixture_a_review','run_fixture_shared','task_fixture_a','Повторное ревью A'),
                 ('task_fixture_b','run_fixture_shared',None,'Задача B'),
                 ('task_fixture_b_child','run_fixture_shared','task_fixture_b','Этап B'),
                 ('task_fixture_a_extra','run_fixture_extra',None,'Другой запуск A')]
        for task,run,parent,title in entries:
            db.execute('INSERT OR IGNORE INTO tasks(id,run_id,parent_id,task_title,spec,status,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?)',
                (task,run,parent,title,'Disposable timeline fixture','completed','2026-11-25 14:18:28','2026-11-25T19:38:56.495Z'))
        for suffix in ('a','b'):
            db.execute('INSERT OR IGNORE INTO dispatch_contexts(id,run_id,task_id,status,dispatched_at,completed_at) VALUES(?,?,?,?,?,?)',
                ('ctx_fixture_'+suffix,'run_fixture_shared','task_fixture_'+suffix+'_child','completed','2026-11-25 19:33:35','2026-11-25T19:34:40.519Z'))
        db.execute('INSERT OR IGNORE INTO dispatch_contexts(id,run_id,task_id,status,dispatched_at,completed_at) VALUES(?,?,?,?,?,?)',
            ('ctx_fixture_review','run_fixture_shared','task_fixture_a_review','completed','2026-11-25 19:35:35','2026-11-25T19:36:40.519Z'))
        db.execute("UPDATE dispatch_contexts SET status='failed' WHERE id='ctx_fixture_a'")
    for card,run,task in [(cards[0],'run_fixture_shared','task_fixture_a'),(cards[0],'run_fixture_extra','task_fixture_a_extra'),(cards[1],'run_fixture_shared','task_fixture_b')]:
        bind(call,card['id'],card['instanceId'],run,task,write=True)
    result={'cards':[{k:c[k] for k in ('id','instanceId','displayName')} for c in cards]}
    (directory/'fixtures.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--directory',type=Path,required=True)
    args=parser.parse_args();seed(args.directory.resolve());print('Three disposable cards seeded; no live profile or invitations used')
