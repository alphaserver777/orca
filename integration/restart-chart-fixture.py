"""Restart only the supplied disposable; emulate one historical lineage record offline."""
import hashlib,importlib.util,json,os,sqlite3,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve();directory=root/'instance'
source=Path(os.environ['ORCA_TIMELINE_RUNTIME']).resolve()
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'timeline'))
record=json.loads((directory/'instance.json').read_text())
assert record['profile']==str(directory/'profile') and record['runtime']==str(directory/'runtime')
spec=importlib.util.spec_from_file_location('disposable',Path(__file__).resolve().parent.parent/'timeline/test-disposable.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.stop(directory)
legacy=json.loads((root/'chart-fixtures.json').read_text())['legacyId']
with sqlite3.connect(directory/'profile/profiles/local-default/profile-state.db') as db:
    # Only this explicit legacy child loses confirmation; actionable children remain exact.
    for table in ['profile_state_documents','profile_state_document_parts']:
        for row in db.execute('select rowid,payload from '+table).fetchall():
            try:value=json.loads(row[1])
            except (ValueError,TypeError):continue
            def visit(v):
                if isinstance(v,dict):
                    if v.get('worktreeId')==legacy and 'capture' in v:
                        v['capture']['confidence']='inferred';return True
                    return any([visit(x) for x in v.values()])
                if isinstance(v,list):return any([visit(x) for x in v])
                return False
            if visit(value):
                payload=json.dumps(value,separators=(',',':'),ensure_ascii=False)
                db.execute('update '+table+' set payload=?,content_hash=? where rowid=?',(payload,hashlib.sha256(payload.encode()).hexdigest(),row[0]))
m.check=lambda candidate:None if candidate==directory/'runtime' else (_ for _ in ()).throw(ValueError('Wrong runtime'))
os.environ['COMPOSER_TEST_ROOT']=str(root)
m.start(directory,source,record['port'],startup_timeout=120)
print('Only disposable restarted with historical lineage fixture')
