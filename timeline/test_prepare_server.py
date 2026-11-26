import hashlib
import os
from pathlib import Path
import tempfile
import unittest

from prepare_server import prepare_server, SERVER_SHA


class ServerOverlayTests(unittest.TestCase):
    def test_pinned_native_source_and_narrow_routes(self):
        source=Path(os.environ.get('ORCA_TIMELINE_RUNTIME','/opt/orca/runtime/orca-1.4.274'))/'orcad/orcad-server.js'
        before=source.read_bytes()
        self.assertEqual(hashlib.sha256(before).hexdigest(),SERVER_SHA)
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'patched.js'
            prepare_server(source,output)
            patched=output.read_text()
            self.assertIn('workflowPlan.respond',patched)
            self.assertIn('planPerson(ctx.caller,ctx.clientKind,_Js(ctx),ctx.orchestrationCaller)',patched)
            self.assertEqual(patched.count('cDn="orchestration.person-approvals.v1"'),before.decode().count('cDn="orchestration.person-approvals.v1"'))
            with self.assertRaisesRegex(ValueError,'Output must not exist'):
                prepare_server(source,output)
        self.assertEqual(source.read_bytes(),before)

    def test_unrecognized_server_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'other.js';source.write_text('not the pinned Orca server')
            output=Path(directory)/'patched.js'
            with self.assertRaisesRegex(ValueError,'Unexpected Orca server version'):
                prepare_server(source,output)
            self.assertFalse(output.exists())
