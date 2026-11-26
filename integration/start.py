"""Fresh private integration instance; never accepts an existing profile/runtime."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'timeline'))
from prepare import check
from prepare_server import prepare_server
from install import apply

def load(name, file):
    spec=importlib.util.spec_from_file_location(name,file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def start(root, source, port, stock=False):
    if root.exists(): raise ValueError('Fresh directory required')
    root.mkdir(parents=True,mode=0o700)
    directory=root/'instance';directory.mkdir(mode=0o700)
    runtime=directory/'runtime';shutil.copytree(source,runtime,symlinks=True)
    check(runtime)
    profile=directory/'profile';profile.mkdir(mode=0o700)
    (root/'bin').mkdir()
    shutil.copy2(ROOT/'integration/test-coordinator.py',root/'bin/codex')
    (root/'bin/codex').chmod(0o700)
    home=directory/'home';home.mkdir(mode=0o700,exist_ok=True)
    if not stock:
        # One renderer build, followed by one purpose-specific server overlay.
        load('combined_package',ROOT/'integration/prepare.py').prepare_combined(runtime,root/'overlay')
        apply(runtime,root/'overlay',root/'backup',profile)
        shutil.copy2(root/'overlay/server.js',root/'workflow-server.js')
        shutil.copy2(runtime/'orcad/orcad-server.js',root/'server-original.js')
        shutil.copy2(runtime/'orcad/.version',root/'artifact-original')
        shutil.copy2(root/'workflow-server.js',runtime/'orcad/orcad-server.js')
        node=next((runtime/'runtimes').glob('*/bin/node'))
        home=directory/'home';home.mkdir(mode=0o700,exist_ok=True)
        preflight_env={k:v for k,v in os.environ.items() if not k.startswith(('ORCA_','CODEX_'))}
        preflight_env.update(HOME=str(home),ORCA_USER_DATA_PATH=str(profile),ORCA_INSTANCE_ID='timeline-disposable-'+str(port),
            COMPOSER_TEST_ROOT=str(root),PATH=str(root/'bin')+os.pathsep+os.environ['PATH'],ORCA_TELEMETRY_DISABLED='1')
        preflight=subprocess.run([str(node),str(runtime/'orcad/orcad-server.js'),'--orcad-startup-preflight',str(uuid.uuid4())],env=preflight_env,capture_output=True,text=True,check=True)
        (runtime/'orcad/.version').write_text(json.loads(preflight.stdout)['artifactVersion']+'\n')
    disposable=load('integration_disposable',ROOT/'timeline/test-disposable.py')
    # start() already validates stock inputs; only this known, checked copy is overlaid.
    disposable.check=lambda candidate: None if candidate==runtime else check(candidate)
    os.environ['COMPOSER_TEST_ROOT']=str(root)
    os.environ['PATH']=str(root/'bin')+os.pathsep+os.environ['PATH']
    record=disposable.start(directory,source,port,startup_timeout=120)
    # Native command setting is essential: Orca's login-shell discovery may ignore PATH.
    # Configure only this fresh profile; no system binary is touched or impersonated.
    from bind import rpc
    rpc(profile/'orca-runtime.json','settings.mutateAgentLaunch',{
        'type':'command','agent':'codex','value':str(root/'bin/codex')})
    load('integration_seed',ROOT/'timeline/seed-disposable.py').seed(directory)
    print('Private combined Orca 1.4.274 started on loopback port '+str(port))
    return record

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True)
    p.add_argument('--source',type=Path,default=Path('/opt/orca/runtime/orca-1.4.274'))
    p.add_argument('--port',type=int,default=39861)
    p.add_argument('--stock',action='store_true',help='Clean native renderer/server control for paired reload diagnosis')
    a=p.parse_args();start(a.directory.resolve(),a.source.resolve(),a.port,stock=a.stock)
