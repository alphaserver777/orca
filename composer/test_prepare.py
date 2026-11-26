import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import os
import json
import shutil

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'timeline'))
spec=importlib.util.spec_from_file_location('composer_prepare',ROOT/'prepare.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
from prepare import TASK,sha,FINGERPRINTS,prepare as prepare_timeline
from install import apply,rollback

class ComposerPrepareTests(unittest.TestCase):
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
            apply(runtime,composer,root/'composer-backup',profile)
            self.assertEqual(sha(renderer/TASK),json.loads((composer/'overlay.json').read_text())['files'][TASK])
            rollback(runtime,root/'composer-backup');self.assertEqual(sha(renderer/TASK),before)

if __name__=='__main__':unittest.main()
