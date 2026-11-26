import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import os
import json
import shutil
import io
import subprocess
import tarfile

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'timeline'))
spec=importlib.util.spec_from_file_location('composer_prepare',ROOT/'prepare.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
from prepare import TASK,sha,FINGERPRINTS,PREVIOUS_OVERLAYS,cache_index,prepare as prepare_timeline
from install import apply,rollback

class ComposerPrepareTests(unittest.TestCase):
    def test_upgrade_from_exact_e5ee5fc_combined_and_fail_closed_for_unknown(self):
        source=Path(os.environ['ORCA_TIMELINE_RUNTIME'])
        release='5ced28e9cd0f93fbf5c4e0499b8decf15510faef'
        release_sha='a62dd0b30a566d967adc9b221f805d1cf0dc138e2b4bb42ca3be1db23cdc716d'
        server_sha='b158df758e8e8bc15d0d13b5d03fbf59b400ec672a2981110b5df29046e32a91'
        with tempfile.TemporaryDirectory(prefix='combined-release-upgrade-') as directory:
            root=Path(directory);archive=root/'release';archive.mkdir()
            packed=subprocess.run(['git','archive',release],cwd=ROOT.parent,capture_output=True,check=True).stdout
            with tarfile.open(fileobj=io.BytesIO(packed)) as files:files.extractall(archive,filter='data')
            baseline=root/'baseline'
            subprocess.run([sys.executable,str(archive/'integration/prepare.py'),'--runtime',str(source),'--output',str(baseline)],cwd=archive,check=True,capture_output=True)
            self.assertEqual(sha(baseline/TASK),release_sha,'Real archived combined release, not current standalone')
            self.assertEqual(sha(baseline/'server.js'),server_sha)
            original={name:(baseline/name).read_bytes() for name in [TASK,'web-index.html']}
            self.assertEqual(original['web-index.html'].decode(),cache_index(original['web-index.html'].decode(),release_sha))
            runtime=root/'runtime';renderer=runtime/'orcad/out/renderer'
            for name in FINGERPRINTS:
                target=renderer/name;target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source/'orcad/out/renderer'/name,target)
            (runtime/'out').mkdir();(runtime/'out/renderer').symlink_to('../orcad/out/renderer')
            shutil.copy2(source/'VERSION',runtime/'VERSION');shutil.copy2(baseline/'server.js',runtime/'orcad/orcad-server.js')
            for name,data in original.items():(renderer/name).write_bytes(data)
            backend=(runtime/'orcad/orcad-server.js').read_bytes()
            profile=root/'profile';profile.mkdir();(profile/'marker').write_bytes(b'untouched private fixture')
            candidate=root/'candidate';manifest=module.prepare_composer(source,candidate)
            # A consistent cache map alone must never authorize an unknown App.
            (renderer/TASK).write_bytes(original[TASK]+b'\n/* unknown build */\n')
            (renderer/'web-index.html').write_text(cache_index(original['web-index.html'].decode(),sha(renderer/TASK)))
            snapshot=lambda base:{str(p.relative_to(base)):p.read_bytes() for p in base.rglob('*') if p.is_file()}
            before=snapshot(runtime);profile_before=snapshot(profile);rejected=root/'rejected-backup'
            with self.assertRaisesRegex(ValueError,'Unexpected WEB bundle'):
                apply(runtime,candidate,rejected,profile)
            self.assertEqual(snapshot(runtime),before);self.assertEqual(snapshot(profile),profile_before);self.assertFalse(rejected.exists())
            for name,data in original.items():(renderer/name).write_bytes(data)
            apply(runtime,candidate,root/'upgrade-backup',profile)
            for name in original:self.assertEqual((renderer/name).read_bytes(),(candidate/name).read_bytes())
            self.assertEqual(sha(renderer/TASK),manifest['files'][TASK])
            self.assertEqual((renderer/'web-index.html').read_text(),cache_index((renderer/'web-index.html').read_text(),manifest['files'][TASK]))
            self.assertEqual((runtime/'orcad/orcad-server.js').read_bytes(),backend)
            rollback(runtime,root/'upgrade-backup')
            for name,data in original.items():self.assertEqual((renderer/name).read_bytes(),data,'Exact release App and cache map restored')
            self.assertEqual((runtime/'orcad/orcad-server.js').read_bytes(),backend)
            self.assertEqual(snapshot(profile),profile_before)

    def test_pinned_deterministic_overlay_keeps_native_auth_and_draft_contract(self):
        source=Path(os.environ['ORCA_TIMELINE_RUNTIME'])
        before=sha(source/'orcad/out/renderer'/TASK)
        with tempfile.TemporaryDirectory(prefix='composer-overlay-') as directory:
            first,second=Path(directory)/'a',Path(directory)/'b'
            a=module.prepare_composer(source,first);b=module.prepare_composer(source,second)
            self.assertEqual(a,b)
            code=(first/TASK).read_text()
            self.assertIn('OrcaComposerRoot,{}',code)
            self.assertIn('OrcaComposerAppend(OrcaComposerScope(tab.entityId),prompt)',code)
            self.assertNotIn('method:\'orchestration.runCreate\'',code)
            self.assertIn("method:'agentSession.send',params:draft.transport",code)
            self.assertEqual(a['composer']['confirmation'],'native-run-task-workspace-binding')
            self.assertEqual(a['files'][TASK],sha(first/TASK))
            self.assertIn(a['files'][TASK],(first/'web-index.html').read_text())
            self.assertEqual(code.count('l=OrcaSidebarCreateRequest,u='),1)
            self.assertIn('function XYe(){$z()}',code)
            self.assertIn('original:()=>XYe()',code)
            self.assertIn("requestedSurface:'chat',requestId:crypto.randomUUID()",code)
            self.assertIn("import('./worktree-activation-BqzX6JkP.js')",code)
            self.assertIn("['tree','Рабочее дерево…'",code)
            self.assertIn("menu.showPopover()",code)
            self.assertEqual(set(a['files']),{'web-index.html',TASK})
            self.assertEqual(before,sha(source/'orcad/out/renderer'/TASK))
            with self.assertRaises(ValueError):module.prepare_composer(source,first)

    def test_upgrade_from_current_toolbar_overlay_and_rollback(self):
        source=Path(os.environ['ORCA_TIMELINE_RUNTIME'])
        with tempfile.TemporaryDirectory(prefix='composer-upgrade-') as directory:
            root=Path(directory);runtime=root/'runtime';renderer=runtime/'orcad/out/renderer'
            for name in FINGERPRINTS:
                target=renderer/name;target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source/'orcad/out/renderer'/name,target)
            (runtime/'out').mkdir();(runtime/'out/renderer').symlink_to('../orcad/out/renderer')
            shutil.copy2(source/'VERSION',runtime/'VERSION');(runtime/'orcad/orcad-server.js').write_text('unchanged server')
            profile=root/'profile';profile.mkdir()
            baseline=root/'baseline';prepare_timeline(runtime,baseline)
            composer=root/'composer';module.prepare_composer(runtime,composer)
            apply(runtime,baseline,root/'old-backup',profile)
            before=sha(renderer/TASK)
            self.assertIn(before,PREVIOUS_OVERLAYS,'Current standalone must remain an explicitly pinned upgrade input')
            apply(runtime,composer,root/'composer-backup',profile)
            self.assertEqual(sha(renderer/TASK),json.loads((composer/'overlay.json').read_text())['files'][TASK])
            rollback(runtime,root/'composer-backup');self.assertEqual(sha(renderer/TASK),before)

if __name__=='__main__':unittest.main()
