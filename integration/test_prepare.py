import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import subprocess

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'timeline'))
from prepare import sha,TASK
spec=importlib.util.spec_from_file_location('combined',ROOT/'integration/prepare.py')
combined=importlib.util.module_from_spec(spec);spec.loader.exec_module(combined)

class CombinedPackageTests(unittest.TestCase):
    def test_one_deterministic_package_preserves_both_layers_and_pins_sources(self):
        source=Path(os.environ['ORCA_TIMELINE_RUNTIME'])
        before={name:sha(source/name) for name in ['orcad/orcad-server.js','orcad/out/renderer/'+TASK]}
        with tempfile.TemporaryDirectory() as tmp:
            a,b=Path(tmp)/'a',Path(tmp)/'b'
            first=combined.prepare_combined(source,a);second=combined.prepare_combined(source,b)
            self.assertEqual(first,second)
            self.assertEqual(first['server'],sha(a/'server.js'))
            self.assertEqual(first['renderer'][TASK],sha(a/TASK))
            code=(a/TASK).read_text()
            self.assertIn('mountPurpleflowDecision',code)
            self.assertIn('data-purpleflow',code)
            self.assertIn('Copyright (c) 2026 PurpleSchool',code)
            self.assertIn('method:\'agentSession.send\',params:draft.transport',code)
            self.assertIn('onResponse,onError:error=>onResponse',code)
            self.assertIn(first['renderer'][TASK],(a/'web-index.html').read_text())
            server=(a/'server.js').read_text()
            self.assertIn("if(!planPerson(ctx.caller,ctx.clientKind,_Js(ctx),ctx.orchestrationCaller))throw Error('person_required')",server)
            self.assertIn('SAVEPOINT workflow_plan_answer',server)
            self.assertEqual(set(first['renderer']),{TASK,'web-index.html'})
            with self.assertRaises(ValueError):combined.prepare_combined(source,a)
        self.assertEqual(before,{name:sha(source/name) for name in before})

    def test_committed_browser_bundle_is_the_manifest_input(self):
        bundle=(ROOT/'integration/purpleflow.bundle.js').read_text()
        self.assertIn('function Timeline(',bundle)
        self.assertIn('function GateBar(',bundle)
        self.assertIn('function PlanStageDrawer(',bundle)
        self.assertNotIn('Отменить задачу',bundle)
        source=json.loads((ROOT/'integration/purpleflow/upstream.json').read_text())
        self.assertEqual(source['commit'],'6476bf53c987b426418acad148b449ffbf4d4072')

    def test_provider_discovery_is_finite_without_a_profile_or_credentials(self):
        for args in [['--version'],['--help'],[]]:
            with self.subTest(args=args):
                result=subprocess.run([sys.executable,str(ROOT/'integration/test-coordinator.py'),*args],
                    env={'PATH':os.environ['PATH']},capture_output=True,text=True,timeout=2,check=True)
                self.assertTrue(result.stdout.strip())

if __name__=='__main__':unittest.main()
