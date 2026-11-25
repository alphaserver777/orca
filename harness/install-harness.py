"""Deploy the existing skill set into Codex, preserving original sources and licenses."""
from pathlib import Path
import datetime,hashlib,json,os,pwd,re,shutil,subprocess,tarfile,tempfile,urllib.parse
BASE=Path('/opt/professorit');HOME=Path('/home/node');DEPLOY=BASE/'orca';SOURCE=Path(__file__).resolve().parent
if os.geteuid()!=0:raise SystemExit('Root required')
if not BASE.is_dir() or not Path('/root/professor_ot').is_symlink():raise SystemExit('Relocate workspace first')
CHECK=Path('/opt/orca/.migration/harness');CHECK.mkdir(parents=True,exist_ok=True)
for name in ['bin','rules','skills','tools','runtime','private','work']:(DEPLOY/name).mkdir(parents=True,exist_ok=True)
shutil.chown(DEPLOY,'root','orca');DEPLOY.chmod(0o750)
(DEPLOY/'private').chmod(0o700)
account=pwd.getpwnam('orca')
def user(args,**kw):
 env={**os.environ,'HOME':str(HOME),'ORCA_USER_DATA_PATH':str(HOME/'.config/orca-pilot'),'PATH':str(DEPLOY/'bin')+':/opt/orca/bin:/usr/local/bin:/usr/bin:/bin'}
 return subprocess.run(['runuser','-u','orca','--','env','-i']+[k+'='+v for k,v in env.items() if k in {'HOME','ORCA_USER_DATA_PATH','PATH','LANG'}]+args,cwd=HOME,**kw)
def cli(args):return user(['/opt/orca/bin/orca-ide']+args,capture_output=True,text=True,timeout=120)
def rootgit(path,args):return subprocess.run(['git','-c','safe.directory='+str(path),'-C',str(path)]+args,capture_output=True,text=True,check=True,timeout=30).stdout.strip()
def translate(text):
 return text.replace('/root/professor_ot/bin/professor-kb',str(DEPLOY/'bin/professor-kb')).replace('/root/professor_ot',str(BASE))
# Snapshot only settings affected here; private credentials are never placed in Git.
backup=CHECK/'native-settings-before-import.tar.gz'
if not backup.exists():
 with tarfile.open(backup,'x:gz') as archive:
  for p in [HOME/'.codex/AGENTS.md',HOME/'.gitconfig',HOME/'.profile',HOME/'.bashrc',HOME/'.agents/skills']:
   if p.exists():archive.add(p,arcname=str(p.relative_to(HOME)))
 backup.chmod(0o600)
# Source program and credentials remain single maintained instances; aliases use /opt.
for target,origin in [(DEPLOY/'tools/bookstack',BASE/'agent/knowledge/bookstack/current'),(DEPLOY/'runtime/python',BASE/'.venv')]:
 if not target.exists():target.symlink_to(origin,target_is_directory=True)
(DEPLOY/'private/bookstack').mkdir(exist_ok=True);(DEPLOY/'private/bookstack').chmod(0o700)
config=DEPLOY/'private/bookstack/config.json'
if not config.exists():config.symlink_to(BASE/'agent/secrets/bookstack-kb.json')
for name in ['professor-kb','professor-kb-root','professor-git-ssh','professor-git-ssh-root','professor-path']:
 shutil.copy2(SOURCE/name,DEPLOY/'bin'/name);(DEPLOY/'bin'/name).chmod(0o755)
shutil.copy2(SOURCE/'PLATFORM.md',DEPLOY/'rules/PLATFORM.md')
workspace=BASE/'agent/projects/harness-multiagents/professor-it/WORKSPACE-AGENTS.md'
entry=(BASE/'agent/harness-web-home/AGENTS.md').resolve()
(DEPLOY/'rules/WORKSPACE-AGENTS.md').write_text(translate(workspace.read_text()))
(DEPLOY/'rules/WORKSPACE-ENTRYPOINT.md').write_text(translate(entry.read_text()))
# Skill copies are generated deployment artifacts; source paths and hashes are retained.
roots=[BASE/'agent/harness-web-home/skills',BASE/'agent/projects/professor-it-marketing/MARKETING/AGENT/skills']
manifest={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'root':str(BASE),'skills':[],'projects':[],'warnings':[]}
import yaml
for root in roots:
 for skill in sorted(root.glob('*/SKILL.md')):
  original=skill.read_text();parts=original.split('---',2)
  if len(parts)!=3 or original[:3]!='---':raise RuntimeError('Missing skill metadata: '+skill.parent.name)
  meta=yaml.safe_load(parts[1])
  if not isinstance(meta,dict) or not meta.get('name') or not meta.get('description'):raise RuntimeError('Invalid skill metadata: '+skill.parent.name)
  name=meta['name'];destination=DEPLOY/'skills'/name
  if not destination.exists():shutil.copytree(skill.parent,destination,symlinks=True,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
  for parent,dirs,files in os.walk(destination,followlinks=False):
   for filename in dirs+files:
    p=Path(parent)/filename
    if p.is_symlink():
     target=os.readlink(p)
     if target.startswith('/root/professor_ot'):
      p.unlink();p.symlink_to(target.replace('/root/professor_ot',str(BASE),1))
  supported={'name','description','license','allowed-tools','metadata'}
  extras={k:v for k,v in meta.items() if k not in supported}
  normalized={k:v for k,v in meta.items() if k in supported}
  if extras:
   normalized['metadata']=dict(normalized.get('metadata') or {})
   normalized['metadata']['original-platform-fields']=json.dumps(extras,ensure_ascii=False)
  normalized['description']=str(normalized['description']).replace('DeepSeek Harness','Orca with Codex')
  header='\n'+yaml.safe_dump(normalized,allow_unicode=True,sort_keys=False).rstrip()+'\n'
  if extras.get('disable-model-invocation') is True:
   policy_path=destination/'agents/openai.yaml';policy_path.parent.mkdir(exist_ok=True)
   policy=yaml.safe_load(policy_path.read_text()) if policy_path.exists() else {}
   policy=policy or {};policy.setdefault('policy',{}).setdefault('allow_implicit_invocation',False)
   policy_path.write_text(yaml.safe_dump(policy,allow_unicode=True,sort_keys=False))
  if 'hooks' in extras:manifest['warnings'].append({'skill':name,'reason':'Original hooks preserved as metadata; DSH hooks are not registered in Codex'})
  adapter='\n\n## Среда исполнения Orca\n\nПеред использованием прочитай `/opt/professorit/orca/rules/PLATFORM.md`: она определяет доступные инструменты, новые пути и запуск исполнителей. Обращения к инструментам DSH ниже заменяются штатными средствами Codex и Orca по этому уточнению; предметные правила навыка сохраняются.\n'
  body=translate(parts[2]);(destination/'SKILL.md').write_text('---'+header+'---'+adapter+body)
  # References preserve their origin; only stale absolute locations are translated.
  for p in destination.rglob('*.md'):
   if p.name!='SKILL.md' and not p.is_symlink():
    text=p.read_text();updated=translate(text)
    if updated!=text:p.write_text(updated)
  target=HOME/'.agents/skills'/name
  if target.exists() or target.is_symlink():
   if not target.is_symlink() or target.resolve()!=destination:raise RuntimeError('Skill name already occupied: '+name)
  else:target.symlink_to(destination,target_is_directory=True)
  manifest['skills'].append({'name':name,'source':str(skill.resolve()),'source_sha256':hashlib.sha256(original.encode()).hexdigest(),'deployed':str(destination),'metadata_valid':True})
subprocess.run(['chmod','-R','a+rX',str(DEPLOY/'skills'),str(DEPLOY/'rules')],check=True)
print('Skill deployment prepared: '+str(len(manifest['skills'])),flush=True)
if len(manifest['skills'])!=37:raise RuntimeError('Expected 37 existing skills; inventory changed')
# The new account reads the generated instructions; archived root rules are untouched.
(HOME/'.codex/AGENTS.md').write_text((SOURCE/'GLOBAL-AGENTS.md').read_text());shutil.chown(HOME/'.codex/AGENTS.md','orca','orca')
for name in ['.profile','.bashrc']:
 p=HOME/name;text=p.read_text() if p.exists() else ''
 line='export PATH=/opt/professorit/orca/bin:/opt/orca/bin:$PATH'
 if line not in text:p.write_text(text.rstrip()+'\n'+line+'\n')
 shutil.chown(p,'orca','orca')
# Register canonical projects, leaving every existing branch and working tree untouched.
projects=BASE/'agent/projects';allow={'github.com/alphaserver777/orca'};groups={}
preferred=['professor-it-marketing','site-proffessor-it','lesson_record_bot','lam-education-frappe','telegram_subscribe_bot','flashcards-open-source-app','harness-multiagents','crm','gitops']
for p in sorted(projects.iterdir()):
 if not (p/'.git').exists():continue
 head=rootgit(p,['rev-parse','HEAD']);branch=rootgit(p,['symbolic-ref','--short','-q','HEAD']) if rootgit(p,['rev-parse','--abbrev-ref','HEAD'])!='HEAD' else 'detached'
 common=rootgit(p,['rev-parse','--path-format=absolute','--git-common-dir']);groups.setdefault(str(Path(common).resolve()),[]).append(p)
 for path in [str(p),str(p).replace(str(BASE),'/root/professor_ot',1)]:user(['/usr/bin/git','config','--global','--add','safe.directory',path],check=True)
 remote=subprocess.run(['git','-C',str(p),'remote','get-url','origin'],capture_output=True,text=True).stdout.strip()
 match=re.match(r'git@([^:]+):(.+)',remote)
 if match:allow.add(match[1].lower()+'/'+match[2].strip('/').removesuffix('.git'))
 elif remote.startswith(('https://','ssh://')):
  url=urllib.parse.urlsplit(remote)
  if url.hostname:allow.add(url.hostname.lower()+'/'+url.path.strip('/').removesuffix('.git'))
 if len(manifest['projects'])%10==0:print('Project inventory: '+str(len(manifest['projects'])),flush=True)
 manifest['projects'].append({'name':p.name,'path':str(p),'head':head,'branch':branch,'working_tree_relocated_without_copy':True})
(DEPLOY/'private/git-allowlist.json').write_text(json.dumps(sorted(allow),indent=2)+'\n');(DEPLOY/'private/git-allowlist.json').chmod(0o600)
user(['/usr/bin/git','config','--global','core.sshCommand',str(DEPLOY/'bin/professor-git-ssh')],check=True)
user(['/usr/bin/git','config','--global','ssh.variant','ssh'],check=True)
# Make the new PATH effective for agents, retaining the chosen ordinary service UID.
unit=Path('/opt/orca/systemd/professorit-orca-native.service');text=unit.read_text().replace('Environment=PATH=/opt/orca/bin:','Environment=PATH=/opt/professorit/orca/bin:/opt/orca/bin:')
text='\n'.join(line for line in text.split('\n') if not line.startswith(('NoNewPrivileges=','CapabilityBoundingSet=','ProtectSystem=','ReadWritePaths=','PrivateTmp=')))
unit.write_text(text);shutil.copy2(unit,'/etc/systemd/system/professorit-orca-native.service')
(DEPLOY/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Every visible project source remains in its own original Git repository.
chosen=set(preferred)
for paths in groups.values():
 if not any(p.name in chosen for p in paths):chosen.add(sorted(paths,key=lambda p:(len(p.name),p.name))[0].name)
for name in sorted(chosen):
 p=projects/name
 if not (p/'.git').exists():continue
 r=cli(['repo','add','--path',str(p),'--kind','git','--json'])
 try:d=json.loads(r.stdout)
 except ValueError:d={}
 if not d.get('ok'):manifest['warnings'].append({'project':name,'reason':'Orca registration did not return success'})
manifest['registered_projects_requested']=len(chosen)
(DEPLOY/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Pick up supplementary groups and changed privilege flags; do not interrupt an active agent.
r=cli(['agent','list','--json']);agents=json.loads(r.stdout)
if any(a.get('state')=='working' for a in agents.get('result',{}).get('agents',[])):raise RuntimeError('An Orca agent is active. Settings saved; restart must wait.')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','restart','professorit-orca-native.service'],check=True)
print(json.dumps({'skills':len(manifest['skills']),'working_copies':len(manifest['projects']),'projects_registered':len(chosen),'warnings':manifest['warnings'],'restart':'completed'},ensure_ascii=False),flush=True)
