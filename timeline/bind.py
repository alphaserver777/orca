#!/usr/bin/env python3
"""Explicit card→Run/Task binding, preview by default; never infers from a title."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import socket
import tempfile


def rpc(metadata, method, params, timeout=20):
    meta = json.loads(metadata.read_text())
    endpoint = next(t['endpoint'] for t in meta['transports'] if t['kind'] == 'unix')
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout); sock.connect(endpoint)
        sock.sendall((json.dumps({'id':'timeline-binding','authToken':meta['authToken'],
                                 'method':method,'params':params})+'\n').encode())
        data=b''
        while b'\n' not in data:
            part=sock.recv(1048576)
            if not part: raise RuntimeError('RPC closed')
            data+=part
    result=json.loads(data.split(b'\n')[0])
    if not result.get('ok'): raise RuntimeError('Native RPC rejected '+method)
    return result['result']


def bind(call, workspace_id, instance_id, run, task, write=False):
    workspace=call('worktree.show',{'worktree':'id:'+workspace_id})['worktree']
    if workspace['id']!=workspace_id or workspace.get('instanceId')!=instance_id or workspace.get('hostId','local')!='local':
        raise ValueError('Workspace identity changed or is not local')
    tasks=call('orchestration.taskList',{'run':run})['tasks']
    if not any(t['id']==task and t['run_id']==run for t in tasks):
        raise ValueError('Task is not in the specified Run')
    path=Path(workspace['path']) / '.orca-task-timeline.json'
    identity={'id':workspace_id,'instanceId':instance_id}
    if not write: return {'schema':1,'workspace':identity,'links':[{'runId':run,'taskId':task}]}
    flags=os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW
    lockfd=os.open(path.with_suffix('.json.lock'),flags,0o600)
    try:
        fcntl.flock(lockfd,fcntl.LOCK_EX)
        if path.is_symlink(): raise ValueError('Binding must not be a symlink')
        current=json.loads(path.read_text()) if path.exists() else {'schema':1,'workspace':identity,'links':[]}
        if current.get('schema')!=1 or current.get('workspace')!=identity or not isinstance(current.get('links'),list):
            raise ValueError('Existing binding belongs to another workspace instance; inspect manually')
        link={'runId':run,'taskId':task}
        if link not in current['links']: current['links'].append(link)
        if len(current['links'])>100: raise ValueError('Too many bindings')
        fd,tmp=tempfile.mkstemp(prefix='.timeline-bind-',dir=path.parent)
        try:
            with os.fdopen(fd,'w') as output:
                json.dump(current,output,ensure_ascii=False,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
            if os.geteuid()==0:
                owner=path.parent.stat();os.chown(tmp,owner.st_uid,owner.st_gid)
            os.replace(tmp,path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
        return current
    finally: os.close(lockfd)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata',type=Path,required=True,help='Runtime metadata of the intended server; contents are never printed')
    parser.add_argument('--workspace-id',required=True);parser.add_argument('--instance-id',required=True)
    parser.add_argument('--run',required=True);parser.add_argument('--task',required=True)
    parser.add_argument('--write',action='store_true',help='Persist the verified binding in this workspace only')
    args=parser.parse_args()
    result=bind(lambda method,params:rpc(args.metadata,method,params),args.workspace_id,args.instance_id,args.run,args.task,args.write)
    print(json.dumps(result,ensure_ascii=False,indent=2))
