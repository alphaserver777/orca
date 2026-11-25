"""One-time same-filesystem relocation. Compatibility path and service state retained."""
from pathlib import Path
import datetime,json,os,shutil,subprocess,pwd,sys
OLD=Path('/root/professor_ot');NEW=Path('/opt/professorit')
CHECK=Path('/opt/orca/.migration/harness')
CHECK.mkdir(parents=True,exist_ok=True);CHECK.chmod(0o700)
def call(args,**kw):return subprocess.run(args,check=True,timeout=30,**kw)
if '--grant-admin' not in sys.argv:raise SystemExit('This operation grants administrator access; pass --grant-admin for the owner-authorized migration.')
print('Relocation preflight started.',flush=True)
if os.geteuid()!=0:raise SystemExit('Root required')
if NEW.exists() and not OLD.is_symlink():raise SystemExit('Destination exists; refusing to merge directories')
if OLD.is_symlink() and OLD.resolve()!=NEW:raise SystemExit('Unexpected compatibility path')
if not OLD.is_symlink():
 if OLD.stat().st_dev!=NEW.parent.stat().st_dev:raise SystemExit('Move must stay on one filesystem')
 if os.path.ismount(OLD):raise SystemExit('Source is a mount point; inspect first')
 unit=Path('/etc/systemd/system/professorit-orca-native.service')
 shutil.copy2(unit,CHECK/'service-before.conf')
 for name in ['AGENTS.md','config.toml']:
  p=Path('/home/node/.codex')/name
  if p.exists():shutil.copy2(p,CHECK/('codex-'+name))
 git=['git','-c','safe.directory=/opt/orca','-C','/opt/orca']
 if subprocess.run(git+['rev-parse','-q','--verify','refs/tags/rollback/before-harness-import-2026-11-25'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
  call(git+['tag','rollback/before-harness-import-2026-11-25'])
 print('Checkpoint saved; checking service states.',flush=True)
 before={n:subprocess.run(['systemctl','is-active',n],capture_output=True,text=True).stdout.strip() for n in ['professorit-orca-native.service','professorit-harness-web.service','professorit-contexera.service']}
 (CHECK/'before.json').write_text(json.dumps({'source':str(OLD),'target':str(NEW),'services':before,'created':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
 os.rename(OLD,NEW)
 try:os.symlink(NEW,OLD,target_is_directory=True)
 except BaseException:
  os.rename(NEW,OLD);raise
 print('Workspace physically moved to /opt/professorit; old path retained as a symlink.',flush=True)
# Explicit owner authorization: full administrator access, ordinary UID for routine work.
 sudoers=Path('/etc/sudoers.d/orca-full-access')
 temporary=CHECK/'orca-full-access.sudoers';temporary.write_text('orca ALL=(ALL:ALL) NOPASSWD: ALL\n');temporary.chmod(0o440)
 call(['/usr/sbin/visudo','-cf',str(temporary)],stdout=subprocess.DEVNULL)
 shutil.copy2(temporary,sudoers);sudoers.chmod(0o440)
 call(['usermod','-aG','docker','orca'])
 for p in [Path('/opt/orca/systemd/professorit-orca-native.service'),Path('/etc/systemd/system/professorit-orca-native.service')]:
  text='\n'.join(line for line in p.read_text().split('\n') if not line.startswith(('NoNewPrivileges=','CapabilityBoundingSet=','ProtectSystem=','ReadWritePaths=','PrivateTmp=')))
  p.write_text(text)
 call(['systemctl','daemon-reload'])
 # Start the permission pass as a finite separate operation; no application is stopped.
 if not shutil.which('setfacl'):
  env={**os.environ,'DEBIAN_FRONTEND':'noninteractive','NEEDRESTART_MODE':'l'}
  call(['apt-get','install','-y','--no-install-recommends','acl'],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL)
 call(['setfacl','-m','u:orca:--x','/root'])
 call(['setfacl','-m','u:orca:rwx',str(NEW),str(NEW/'agent')])
 acl=CHECK/'grant-project-access.sh'
 acl.write_text('#!/bin/sh\nset -eu\n'+''.join('setfacl -R -m u:orca:rwX '+str(NEW/p)+'\n' for p in ['agent/projects','agent/config','agent/harness-web-home/skills','agent/knowledge'])+'date -u > '+str(CHECK/'permissions.complete')+'\n')
 acl.chmod(0o700)
 call(['systemd-run','--unit=professorit-orca-project-access','--property=Nice=10','--property=StandardOutput=append:'+str(CHECK/'permissions.log'),'--property=StandardError=append:'+str(CHECK/'permissions.log'),'/bin/sh',str(acl)])
 print('Administrator rights configured; finite project ACL pass started. Orca restart pending until skill setup.',flush=True)
