"""Prepare a version-pinned RPC overlay in a new file; never changes source runtime."""
import argparse
import hashlib
from pathlib import Path

SERVER_SHA='b1264cd74d4dc839fc6572976707db6ed72f6442da051e80678c2b44b5db8b88'

def prepare_server(source,output):
    raw=source.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=SERVER_SHA: raise ValueError('Unexpected Orca server version')
    if output.exists(): raise ValueError('Output must not exist')
    root=Path(__file__).parent
    shared=(root/'decisions.mjs').read_text().replace('export function ','function ')
    bindings=(root/'bindings.mjs').read_text().split('export function bindingCandidates',1)[1].split('export async function',1)[0]
    model=(root/'model.mjs').read_text().split('export function family',1)[1].split('export function timeline',1)[0]
    overview=(root/'overview.mjs').read_text().replace('export const ','const ').replace('export function ','function ')
    code='function bindingCandidates'+bindings+'\nfunction family'+model+'\n'+overview+'\n'+shared+'\n'+(root/'decision-server.mjs').read_text()+'\n'+(root/'overview-server.mjs').read_text()+'\n'
    text=raw.decode()
    anchor='eGt=null,exm=[Xr('
    if text.count(anchor)!=1: raise ValueError('RPC registry anchor changed')
    text=text.replace(anchor,'eGt=null,exm=[...orcaPlanMethods(),...overviewMethods(),Xr(',1)
    anchor='function gdb(e,t){let r=this.db.prepare("SELECT * FROM decision_gates WHERE id = ?").get(e);if(r){'
    if text.count(anchor)!=1: raise ValueError('Native gate CAS anchor changed')
    guard='if(planEnvelope(r)){let latest=planHistory(this.listGates({taskId:r.task_id}),r.run_id,r.task_id).current;if(r.status!=="pending"||latest?.gate.id!==e)throw Error("decision_conflict");}'
    text=text.replace(anchor,anchor+guard,1)
    anchor='let l=wl("gate"),c=JSON.stringify(e.options??[]);this.db.prepare("INSERT INTO decision_gates'
    if text.count(anchor)!=1: raise ValueError('Native plan publication anchor changed')
    publication='let incoming=planEnvelope({question:e.question});if(incoming){let history=planHistory(this.listGates({taskId:e.taskId}),r,e.taskId),previous=history.current;if(history.error||incoming.revision!==(previous?previous.plan.revision+1:1)||incoming.previousGateId!==(previous?.gate.id??null))throw Error("plan_revision_conflict");if(previous?.gate.status==="pending")this.timeoutGate(previous.gate.id);}'
    text=text.replace(anchor,publication+anchor,1)
    # Purpose-specific plan and workspace-task methods; general WEB grants stay intact.
    anchor='TMS=["orcaAccount.selectOrg"'
    if text.count(anchor)!=1: raise ValueError('Paired RPC routing anchor changed')
    text=text.replace(anchor,'TMS=["workflowTasks.read","workflowTasks.history","workflowTasks.subscribe","workflowPlan.read","workflowPlan.respond","workflowPlan.subscribe","orcaAccount.selectOrg"',1)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(code+text)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();prepare_server(a.source,a.output)
    print('Native workflow RPC overlay prepared; source unchanged')
