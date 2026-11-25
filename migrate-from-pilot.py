"""One-time root migration of the existing trial. Original trial data is retained."""
from pathlib import Path
import datetime, json, os, pwd, shutil, stat, subprocess, tarfile

SOURCE = Path('/root/professor_ot/private/orca-pilot')
TARGET = Path('/opt/orca')
HOME_PATH = Path('/home/node')
PROJECT = Path('/workspace')
PRIVATE = Path('/root/professor_ot/private/orca-native')
UNIT = 'professorit-orca-native.service'

def run(args, **kw):
    return subprocess.run(args, check=True, **kw)

def ignore_special(directory, names):
    return [name for name in names if stat.S_ISSOCK(os.lstat(Path(directory)/name).st_mode)]

if os.geteuid() != 0:
    raise SystemExit('Run as root.')
if HOME_PATH.exists() or PROJECT.exists():
    raise SystemExit('Target data already exists. Inspect instead of overwriting it.')
if not (TARGET/'.git').is_dir():
    raise SystemExit('Clone the configuration repository into /opt/orca first.')
snapshot = json.loads(subprocess.check_output([
    'docker', 'exec', 'professorit-orca-pilot', '/opt/orca/bin/orca-ide',
    'agent', 'list', '--json'], text=True))
if not snapshot.get('ok'):
    raise SystemExit('Cannot verify active agents; migration has not started.')
if any(a.get('state') == 'working' for a in snapshot['result']['agents']):
    raise SystemExit('A trial agent is working. Wait for it before migrating.')

try:
    account = pwd.getpwnam('orca')
except KeyError:
    run(['useradd', '--system', '--user-group', '--home-dir', str(HOME_PATH),
         '--no-create-home', '--shell', '/bin/bash', 'orca'])
    account = pwd.getpwnam('orca')
if account.pw_dir != str(HOME_PATH) or account.pw_uid == 0:
    raise SystemExit('Unexpected existing orca account.')

runtime = TARGET/'runtime'
runtime.mkdir(exist_ok=True)
for src, name in [(SOURCE/'orca-server-1.4.274-linux-x64', 'orca-1.4.274'),
                  (SOURCE/'codex-runtime', 'codex-0.172.0')]:
    dst = runtime/name
    if dst.exists():
        raise SystemExit('Runtime already exists; inspect it first: '+str(dst))
    shutil.copytree(src, dst, symlinks=True)
run(['chmod', '-R', 'a+rX', str(runtime)])
for wrapper in (TARGET/'bin').iterdir():
    wrapper.chmod(0o755)
if (runtime/'orca-1.4.274/VERSION').read_text().splitlines()[0] != 'orca 1.4.274':
    raise SystemExit('Unexpected Orca release version.')
run([str(TARGET/'bin/codex'), '--version'], stdout=subprocess.DEVNULL)
run(['runuser', '-u', 'orca', '--', str(TARGET/'bin/codex'), '--version'],
    cwd=TARGET, stdout=subprocess.DEVNULL)

PRIVATE.mkdir(mode=0o700, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
checkpoint = PRIVATE/('before-native-'+stamp+'.tar.gz')
run(['systemctl', 'stop', 'professorit-orca-pilot.service'])
with tarfile.open(checkpoint, 'x:gz') as archive:
    archive.add(SOURCE/'home', arcname='home')
    archive.add('/root/professor_ot/derived/work/orca-pilot/example', arcname='example')
checkpoint.chmod(0o600)
shutil.copytree(SOURCE/'home', HOME_PATH, symlinks=True, ignore=ignore_special)
shutil.copytree('/root/professor_ot/derived/work/orca-pilot/example', PROJECT, symlinks=True)

# Remove only copied process-discovery files, not conversations, keys, or databases.
profile = HOME_PATH/'.config/orca-pilot'
for p in [profile/'orcad.lock', profile/'orca-runtime.json',
          profile/'daemon/daemon-v62.pid']:
    if p.is_file():
        p.unlink()
(HOME_PATH/'.profile').write_text('export PATH=/opt/orca/bin:$PATH\n')
(HOME_PATH/'.bashrc').write_text('export PATH=/opt/orca/bin:$PATH\n')
(HOME_PATH/'.local/state/orca').mkdir(parents=True, exist_ok=True)
HOME_PATH.chmod(0o700)
for root in [HOME_PATH, PROJECT]:
    shutil.chown(root, account.pw_uid, account.pw_gid)
    for parent, dirs, files in os.walk(root):
        for name in dirs+files:
            os.lchown(Path(parent)/name, account.pw_uid, account.pw_gid)
(HOME_PATH/'.codex/auth.json').chmod(0o600)
shutil.chown(TARGET/'.git', account.pw_uid, account.pw_gid)
for parent, dirs, files in os.walk(TARGET/'.git'):
    for name in dirs+files:
        os.lchown(Path(parent)/name, account.pw_uid, account.pw_gid)
run(['runuser', '-u', 'orca', '--', 'git', 'config', '--global',
     '--add', 'safe.directory', str(TARGET)],
    cwd=HOME_PATH, env={**os.environ, 'HOME':str(HOME_PATH)})
shutil.copy2(TARGET/'systemd'/UNIT, Path('/etc/systemd/system')/UNIT)
run(['systemctl', 'daemon-reload'])
run(['systemctl', 'disable', 'professorit-orca-pilot.service'])
run(['systemctl', 'enable', '--now', UNIT])
(PRIVATE/'migration.json').write_text(json.dumps({
    'checkpoint':str(checkpoint), 'user':'orca', 'home':str(HOME_PATH),
    'install':str(TARGET), 'trial_data_retained':True,
    'versions':{'orca':'1.4.274','codex':'0.172.0'}}, indent=2)+'\n')
print('Native service started. Original trial files and checkpoint retained.')
