"""Apply the requested HTTPS route, preserving the existing DSH and webhook routes."""
from pathlib import Path
import datetime,json,os,shutil,subprocess
R=Path('/opt/orca');HERE=Path(__file__).resolve().parent;CHECK=R/'.migration/domain';CHECK.mkdir(parents=True,exist_ok=True);CHECK.chmod(0o700)
if os.geteuid()!=0:raise SystemExit('Root required')
if not shutil.which('socat'):raise SystemExit('socat is required')
cli=['runuser','-u','orca','--','env','-i','HOME=/home/node','PATH=/opt/professorit/orca/bin:/opt/orca/bin:/usr/bin:/bin','ORCA_USER_DATA_PATH=/home/node/.config/orca-pilot','/opt/orca/bin/orca-ide']
r=subprocess.run(cli+['agent','list','--json'],cwd='/home/node',capture_output=True,text=True,check=True);agents=json.loads(r.stdout)
if any(a.get('state')=='working' for a in agents.get('result',{}).get('agents',[])):raise SystemExit('An Orca agent is working; no route change or restart performed.')
unit=Path('/etc/systemd/system/professorit-orca-native.service');edge=Path('/srv/robots/edge/dynamic/professorit-orca.yml')
for source,name in [(unit,'native-service-before.conf'),(Path('/srv/robots/edge/dynamic/professorit-agent.yml'),'dsh-edge-before.yml'),(Path('/opt/professorit/private/harness-web-proxy/nginx.conf'),'dsh-proxy-before.conf')]:
 target=CHECK/name
 if not target.exists():shutil.copy2(source,target);target.chmod(0o600)
if edge.exists() and not (CHECK/'orca-edge-before.yml').exists():shutil.copy2(edge,CHECK/'orca-edge-before.yml')
git=['git','-c','safe.directory=/opt/orca','-C','/opt/orca'];tag='rollback/before-public-domain-2026-11-25'
if subprocess.run(git+['rev-parse','-q','--verify','refs/tags/'+tag],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:subprocess.run(git+['tag',tag],check=True)
subprocess.run(['/usr/bin/python3',str(HERE/'https-only.py')],check=True)
text=unit.read_text().replace('--bind 127.0.0.1','--bind 0.0.0.0').replace('--pairing-address http://localhost:3040','--pairing-address https://agent.professorit.ru').replace('--refuse-public','--allow-public')
pre='ExecStartPre=+/usr/bin/python3 /opt/orca/domain/https-only.py\n'
if pre not in text:text=text.replace('ExecStart=',pre+'ExecStart=',1)
unit.write_text(text);(R/'systemd/professorit-orca-native.service').write_text(text)
shutil.copy2(HERE/'professorit-orca-domain.service','/etc/systemd/system/professorit-orca-domain.service')
subprocess.run(['systemd-analyze','verify',str(unit),'/etc/systemd/system/professorit-orca-domain.service'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','restart','professorit-orca-native.service'],check=True)
subprocess.run(['systemctl','enable','--now','professorit-orca-domain.service'],check=True)
# Readiness before publishing the new route. The old DSH route remains unchanged.
import time,urllib.request
ready=False
for i in range(15):
 try:
  with urllib.request.urlopen('http://172.17.0.1:3088/',timeout=3) as response:ready=response.status==200
  if ready:break
 except OSError:time.sleep(1)
if not ready:raise SystemExit('Private Orca route is not ready; public route was not changed.')
temporary=edge.with_suffix('.tmp');temporary.write_text((HERE/'professorit-orca.yml').read_text());temporary.chmod(0o644);os.replace(temporary,edge)
(CHECK/'applied.json').write_text(json.dumps({'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':'https://agent.professorit.ru','edge_file':str(edge),'dsh_local_port':3035,'dsh_route_untouched':True,'native_pairing_auth':True,'additional_dsh_password':False},indent=2)+'\n')
print('Public HTTPS route published. DSH remains on 127.0.0.1:3035.',flush=True)
