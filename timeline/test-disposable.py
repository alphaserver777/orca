"""Start isolated same-version Orca; fixtures, profile and invitations stay private.

Run with a fresh --directory inside timeline/.local. No live profile is read.
The browser test owns only this child process and its temporary invitations.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import signal
from prepare import check


def start(directory, source, port, startup_timeout=45):
    if source.is_relative_to(directory) or directory.is_relative_to(source):
        raise ValueError('Disposable directory must be separate from the source runtime')
    directory.mkdir(parents=True,exist_ok=True)
    directory.chmod(0o700)
    runtime=directory/'runtime'
    if not runtime.exists(): shutil.copytree(source,runtime,symlinks=True)
    check(runtime)
    home,profile,project=directory/'home',directory/'profile',directory/'project'
    for p in (home,profile,project): p.mkdir(exist_ok=True)
    if not (project/'.git').exists():
        subprocess.run(['git','init','-q',str(project)],check=True)
        subprocess.run(['git','-C',str(project),'-c','user.name=Timeline fixture','-c','user.email=fixture@invalid','commit','--allow-empty','-qm','Disposable fixture'],check=True)
    env={k:v for k,v in os.environ.items() if not k.startswith(('ORCA_','CODEX_'))}
    env.update(HOME=str(home),ORCA_USER_DATA_PATH=str(profile),ORCA_INSTANCE_ID='timeline-disposable-'+str(port),ORCA_TELEMETRY_DISABLED='1',DO_NOT_TRACK='1')
    log=directory/'server.log'
    with log.open('w') as output:
        process=subprocess.Popen([str(runtime/'bin/orca-ide'),'serve','--port',str(port),'--bind','127.0.0.1','--pairing-address',f'http://127.0.0.1:{port}','--refuse-public','--project-root',str(project)],env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
    log.chmod(0o600)
    record={'pid':process.pid,'port':port,'runtime':str(runtime),'home':str(home),'profile':str(profile),'project':str(project)}
    (directory/'instance.json').write_text(json.dumps(record));(directory/'instance.json').chmod(0o600)
    for _ in range(int(startup_timeout*10)):
        if (profile/'orca-runtime.json').exists() and 'Web client URL:' in log.read_text(): return record
        if process.poll() is not None: raise RuntimeError('Disposable server failed; inspect private log')
        time.sleep(.1)
    stop(directory)
    raise RuntimeError(f'Disposable server did not start within {startup_timeout}s; inspect private log')


def stop(directory):
    record=json.loads((directory/'instance.json').read_text())
    runtime=str((directory/'runtime').resolve())+'/'
    if record['runtime']!=runtime.rstrip('/'): raise ValueError('Not this disposable runtime')
    if record['profile']!=str(directory/'profile') or record['home']!=str(directory/'home'):
        raise ValueError('Not an isolated disposable home/profile')
    owned=[]
    for process in Path('/proc').iterdir():
        if not process.name.isdigit(): continue
        try: args=(process/'cmdline').read_bytes().split(b'\0')
        except (FileNotFoundError,PermissionError,ProcessLookupError): continue
        if args and args[0].decode(errors='replace').startswith(runtime): owned.append(int(process.name))
    for pid in owned:
        try: os.kill(pid,signal.SIGTERM)
        except ProcessLookupError: pass
    # Stop only executables from the copied runtime, including its own PTY daemon.
    for _ in range(50):
        live=[]
        for pid in owned:
            try:
                status=Path(f'/proc/{pid}/status').read_text()
                if '\nState:\tZ' not in status: live.append(pid)
            except FileNotFoundError: pass
        if not live: return
        time.sleep(.1)
    raise RuntimeError('Some disposable processes are still alive; no other server was signalled')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True);parser.add_argument('--port',type=int,default=39741)
    parser.add_argument('--source',type=Path,default=Path('/opt/orca/runtime/orca-1.4.274'))
    parser.add_argument('--stop',action='store_true')
    args=parser.parse_args()
    if args.stop:
        stop(args.directory.resolve());print('Only disposable runtime processes stopped')
    else:
        record=start(args.directory.resolve(),args.source.resolve(),args.port)
        print('Disposable Orca started; pid='+str(record['pid'])+'; no invitation or profile data printed')
