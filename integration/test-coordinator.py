#!/usr/bin/python3
"""Deterministic Codex app-server replacement, ONLY for an isolated test profile.

It inherits the genuine native per-session tool environment. It never invents an
identity, reads production credentials, calls a model, or writes an Orca database.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

if '--version' in sys.argv:
    print('codex-cli 0.172.0');sys.exit(0)
if '--help' in sys.argv:
    print('Deterministic fixture: app-server; --no-daemon');sys.exit(0)
if 'app-server' not in sys.argv[1:]:
    # Native discovery/hook probes are finite commands, not protocol sessions.
    print('{}');sys.exit(0)
root=Path(os.environ['COMPOSER_TEST_ROOT']).resolve()
if not (root/'instance/instance.json').exists():raise RuntimeError('Disposable instance required')

def emit(value):
    print(json.dumps(value),flush=True)

def command(*args):
    cli=os.environ.get('ORCA_CLI_COMMAND')
    if not cli:raise RuntimeError('Native CLI environment missing')
    out=subprocess.run([cli,*args,'--json',*(['--full'] if args[0]=='orchestration' else [])],env=os.environ.copy(),text=True,capture_output=True,check=False)
    result=json.loads(out.stdout)
    if args[0]=='orchestration':
        with (root/'cli-evidence.jsonl').open('a') as evidence:evidence.write(json.dumps({'command':args[:2],'response':result})+'\n')
    if not result.get('ok'):raise RuntimeError('Native CLI refused '+args[0]+' '+args[1]+': '+str(result.get('error',{}).get('code')))
    if args[:2] in [('orchestration','run-create'),('orchestration','task-create')] and '--retry-request' not in args:
        request_id=result['result']['mutation']['requestId']
        command('orchestration','request-show','--request',request_id)
        replay=command(*args,'--retry-request',request_id)
        kind='run' if args[1]=='run-create' else 'task'
        if replay[kind]['id']!=result['result'][kind]['id'] or not replay['mutation']['replayed']:
            raise RuntimeError('Native recovery duplicated a mutation')
    return result['result']

def create_request(text):
    session=os.environ.get('ORCA_AGENT_SESSION_ID')
    if not session or not os.environ.get('ORCA_AGENT_SESSION_SPAWN_TOKEN'):
        raise RuntimeError('No native per-session caller evidence; refusing to impersonate')
    match=re.search(r'Идентификатор запроса: ([\da-f-]{36})',text)
    if not match:raise RuntimeError('No composer request')
    request_id=match[1];source=Path.cwd().resolve()
    if not source.is_relative_to(root):raise RuntimeError('Not a disposable workspace')
    directory=source/'.orca-task-materials'/request_id
    request=json.loads((directory/'request.json').read_text())
    if request['coordinatorSessionId']!=session:raise RuntimeError('Wrong native coordinator')
    receipt=directory/'result.json'
    if receipt.exists():return json.loads(receipt.read_text())
    caller='orca_session_id:'+session
    run=command('orchestration','run-create','--objective','Deterministic composer '+request_id,'--from',caller)['run']
    spec=json.dumps({'requestId':request_id,'mode':request['mode'],'steps':request['steps'],'routePolicy':request.get('routePolicy'),'routeDetails':request.get('routeDetails')},ensure_ascii=False)
    task=command('orchestration','task-create','--run',run['id'],'--from',caller,'--spec',spec,'--task-title',request['title'])['task']
    target=command('worktree','create','--repo','id:'+request['workspace']['repoId'],'--name','composer-'+request_id[:8],'--no-parent','--setup','skip')['worktree']
    binding={'schema':1,'workspace':{'id':target['id'],'instanceId':target['instanceId']},'links':[{'runId':run['id'],'taskId':task['id']}]}
    (Path(target['path'])/'.orca-task-timeline.json').write_text(json.dumps(binding))
    result={'schema':1,'requestId':request_id,'coordinatorSessionId':session,'sourceWorkspaceId':request['workspace']['id'],'sourceInstanceId':request['workspace']['instanceId'],
        'runId':run['id'],'taskId':task['id'],'workspaceId':target['id'],'instanceId':target['instanceId'],'repoId':target['repoId']}
    gate=command('orchestration','gate-create','--task',task['id'],'--from',caller,'--question',json.dumps({'kind':'orca-plan','schema':1,'revision':1,'previousGateId':None,'plan':'ТЕСТОВЫЙ ПЛАН. Редакция 1\n1. Уточнить изменение.\n2. Реализовать после принятия плана.\n3. Проверить результат.'},ensure_ascii=False))['gate']
    target_chat=command('agent','launch','--agent','codex','--surface','chat','--worktree','id:'+target['id'],'--focus')
    handle=target_chat['outcome']['handle']
    target_session=target_chat['outcome'].get('sessionId') or re.sub(r'^(orca_session_id:|structured-agent-session-)','',handle)
    command('chat','rename','--session',target_session,'--name','ТЕСТ: чат задачи')
    result['targetSessionId']=target_session
    result['gateId']=gate['id']
    receipt.write_text(json.dumps(result));(root/'coordinator-result.json').write_text(json.dumps(result))
    return result


def coordinate(text):
    if re.search(r'Идентификатор запроса: ([\da-f-]{36})',text):return create_request(text)
    record=root/'coordinator-result.json'
    if not record.exists():return {'fixture':'idle'}
    result=json.loads(record.read_text())
    if os.environ.get('ORCA_AGENT_SESSION_ID')!=result['coordinatorSessionId']:return {'fixture':'not coordinator'}
    caller='orca_session_id:'+result['coordinatorSessionId']
    gates=command('orchestration','gate-list','--task',result['taskId'],'--run',result['runId'],'--from',caller)['gates']
    entries=sorted([(json.loads(g['question']),g) for g in gates if json.loads(g['question']).get('kind')=='orca-plan'],key=lambda x:x[0]['revision'])
    plan,gate=entries[-1]
    if gate['status']!='resolved':return {'fixture':'waiting'}
    answer=json.loads(gate['resolution'])
    if answer['decision']=='return':
        (root/'return-observed.json').write_text(json.dumps(answer))
        if 'fixture: next revision' not in text:return {'fixture':'returned, implementation held'}
        question={'kind':'orca-plan','schema':1,'revision':plan['revision']+1,'previousGateId':gate['id'],'plan':'ТЕСТОВЫЙ ПЛАН. Редакция 2\n1. Уточнить изменение.\n2. Реализовать только после принятия актуальной редакции.\n3. Добавить проверку восстановления после reload.\nУчтён комментарий: '+answer['comment']}
        return command('orchestration','gate-create','--task',result['taskId'],'--from',caller,'--question',json.dumps(question,ensure_ascii=False))
    if answer['decision']=='accept':
        marker=root/'implementation-start.json'
        if marker.exists():return {'fixture':'already started'}
        tasks=command('orchestration','task-list','--run',result['runId'],'--from',caller)['tasks']
        task=next(t for t in tasks if t['id']==result['taskId'])
        if task['status']!='ready':raise RuntimeError('Native Task is not ready for implementation')
        workspace=command('worktree','show','--worktree','id:'+result['workspaceId'])['worktree']
        target=Path(workspace['path']).resolve()
        if workspace['instanceId']!=result['instanceId'] or not target.is_relative_to(root):raise RuntimeError('Disposable task workspace changed')
        try:
            with marker.open('x') as f:json.dump({'testOnly':True,'nativeTaskStatus':'ready','nativeDispatch':False,'taskId':result['taskId'],'gateId':gate['id'],'revision':plan['revision'],'count':1},f)
        except FileExistsError:return {'fixture':'already started'}
        (target/'.integration-test-execution.txt').write_text('Test-only bounded execution after native plan acceptance; no model or real implementation.\n')
        return {'fixture':'one bounded test execution; native Task remains ready, no Dispatch impersonation'}

thread='fixture-'+str(uuid.uuid4())
for line in sys.stdin:
    try:
        message=json.loads(line);method=message.get('method');params=message.get('params') or {}
        with (root/'fixture-methods.txt').open('a') as log:log.write(str(method)+'\n')
        if 'id' not in message:continue
        if method=='initialize':result={'userAgent':'composer-fixture/0.172.0','platformFamily':'unix','platformOs':'linux'}
        elif method=='account/read':result={'account':{'type':'chatgpt','email':'fixture@invalid','planType':'free'},'requiresOpenaiAuth':False}
        elif method=='account/rateLimits/read':result={'rateLimits':None,'rateLimitsByLimitId':{}}
        elif method in ('skills/list','hooks/list'):result={'data':[],'errors':[]}
        elif method=='model/list':result={'data':[{'id':'fixture','model':'fixture','displayName':'Deterministic fixture','isDefault':True,'supportedReasoningEfforts':[{'reasoningEffort':'low','description':'Fixture'}],'defaultReasoningEffort':'low','inputModalities':['text'],'supportsPersonality':False}],'nextCursor':None}
        elif method in ('thread/start','thread/resume','thread/read'):
            with (root/'fixture-sessions.jsonl').open('a') as evidence:evidence.write(json.dumps({'sessionId':os.environ.get('ORCA_AGENT_SESSION_ID'),'executable':sys.argv[0],'method':method})+'\n')
            thread=params.get('threadId') or thread
            result={'thread':{'id':thread,'preview':'','ephemeral':False,'modelProvider':'fixture','createdAt':int(time.time()),'updatedAt':int(time.time()),'status':{'type':'idle'},'path':None,'cwd':os.getcwd(),'cliVersion':'0.172.0','source':'appServer','turns':[]},'model':'fixture','modelProvider':'fixture','serviceTier':None,'cwd':os.getcwd(),'approvalPolicy':'never','sandbox':{'type':'dangerFullAccess'},'reasoningEffort':'low'}
        elif method in ('turn/start','turn/steer'):
            steering=method=='turn/steer'
            turn=params.get('expectedTurnId') if steering else 'turn-'+str(uuid.uuid4())
            state={'id':turn,'items':[],'status':'inProgress','error':None}
            emit({'id':message['id'],'result':{'turnId':turn} if steering else {'turn':state}})
            if not steering:emit({'method':'turn/started','params':{'threadId':thread,'turn':state}})
            text='\n'.join(item.get('text','') for item in params.get('input',[]) if item.get('type')=='text')
            try:answer=json.dumps(coordinate(text))
            except Exception as error:
                answer='Fixture failed: '+str(error);(root/'fixture-error.txt').write_text(answer)
            item={'type':'agentMessage','id':'reply-'+str(uuid.uuid4()),'text':answer,'phase':'final_answer'}
            emit({'method':'item/completed','params':{'threadId':thread,'turnId':turn,'item':item}})
            emit({'method':'turn/completed','params':{'threadId':thread,'turn':{**state,'status':'completed','items':[item]}}})
            continue
        else:result={}
        emit({'id':message['id'],'result':result})
    except Exception as error:
        (root/'fixture-error.txt').write_text(str(error))
        if 'id' in message:emit({'id':message['id'],'error':{'code':-32603,'message':'Deterministic fixture failed'}})
