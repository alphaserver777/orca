import os
from pathlib import Path
import shutil
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).parent))
from prepare import prepare, check, FINGERPRINTS, TASK, sha
from install import apply, rollback, verify

LIVE = Path(os.environ.get('ORCA_TIMELINE_RUNTIME', '/opt/orca/runtime/orca-1.4.274'))


class OverlayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='timeline-test-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.runtime = root / 'runtime'
        self.renderer = self.runtime / 'orcad/out/renderer'
        (self.runtime/'out').mkdir(parents=True)
        (self.runtime/'out/renderer').symlink_to('../orcad/out/renderer',target_is_directory=True)
        for name in FINGERPRINTS:
            dest = self.renderer / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(LIVE / 'orcad/out/renderer' / name, dest)
        shutil.copy2(LIVE / 'VERSION', self.runtime / 'VERSION')
        (self.runtime / 'orcad/orcad-server.js').write_text('unchanged fake server')
        self.overlay, self.backup, self.profile = root / 'overlay', root / 'backup', root / 'profile'
        self.profile.mkdir()
        (self.profile / 'private-test-data').write_text('test fixture, no live profile')

    def test_real_web_graph_and_deterministic_overlay(self):
        manifest = prepare(self.runtime, self.overlay)
        second = self.overlay.with_name('second')
        self.assertEqual(manifest, prepare(self.runtime, second))
        self.assertIn('OrcaTimelineLaunch,{onClose:()=>P(`explorer`)}', (self.overlay / TASK).read_text())
        self.assertNotIn('OrcaTimelineLaunch,{mainRef:a,children:', (self.overlay / TASK).read_text())
        self.assertIn('api.runtime.call', (self.overlay / TASK).read_text())
        self.assertNotIn('authToken', ''.join(p.read_text() for p in self.overlay.rglob('*.js')))
        self.assertNotIn('orchestration.runList',(self.overlay / TASK).read_text().split('// ORCA_TIMELINE_END')[0])
        self.assertIn('type="importmap"',(self.overlay / 'web-index.html').read_text())
        check(self.runtime)  # Preparation did not modify its source.

    def test_apply_and_exact_rollback_in_disposable_runtime(self):
        prepare(self.runtime, self.overlay)
        (self.renderer / (TASK + '.br')).write_bytes(b'old compressed fixture')
        apply(self.runtime, self.overlay, self.backup, self.profile)
        self.assertEqual(self.backup.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.backup / 'profile.tar.gz').stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.renderer / (TASK + '.br')).exists())
        verify(self.runtime, self.backup, True)
        rollback(self.runtime, self.backup)
        self.assertIn('timeline='+FINGERPRINTS[TASK],(self.renderer / 'web-index.html').read_text())
        self.assertEqual((self.renderer / (TASK + '.br')).read_bytes(), b'old compressed fixture')
        check(self.runtime)

    def test_wrong_version_and_changed_bundle_fail_closed(self):
        (self.runtime / 'VERSION').write_text('orca 9.9.9')
        with self.assertRaisesRegex(ValueError, '1.4.274'):
            prepare(self.runtime, self.overlay)
        self.assertFalse(self.overlay.exists())
        shutil.copy2(LIVE / 'VERSION', self.runtime / 'VERSION')
        (self.renderer / TASK).write_text('changed')
        with self.assertRaisesRegex(ValueError, 'Unexpected WEB bundle'):
            prepare(self.runtime, self.overlay)

    def test_rollback_refuses_to_overwrite_new_changes(self):
        prepare(self.runtime, self.overlay)
        apply(self.runtime, self.overlay, self.backup, self.profile)
        (self.renderer / TASK).write_text('someone changed this')
        with self.assertRaisesRegex(ValueError, 'Installed file changed'):
            rollback(self.runtime, self.backup)
        self.assertEqual((self.renderer / TASK).read_text(), 'someone changed this')

    def test_rollback_recovers_interrupted_apply(self):
        prepare(self.runtime, self.overlay)
        apply(self.runtime, self.overlay, self.backup, self.profile)
        shutil.copy2(self.backup / 'originals' / TASK, self.renderer / TASK)
        shutil.copy2(self.backup / 'originals' / 'web-index.html', self.renderer / 'web-index.html')
        rollback(self.runtime, self.backup)
        check(self.runtime)

    def test_rollback_cache_map_tampering_fails_before_modifying_app(self):
        prepare(self.runtime,self.overlay)
        apply(self.runtime,self.overlay,self.backup,self.profile)
        expected=sha(self.renderer / TASK)
        (self.backup / 'rollback-index.html').write_text('tampered')
        with self.assertRaisesRegex(ValueError,'Rollback cache index changed'):
            rollback(self.runtime,self.backup)
        self.assertEqual(sha(self.renderer / TASK),expected)

    def test_reapply_refuses_an_unrecognized_cache_map(self):
        prepare(self.runtime,self.overlay)
        apply(self.runtime,self.overlay,self.backup,self.profile)
        rollback(self.runtime,self.backup)
        index=self.renderer/'web-index.html'
        index.write_text(index.read_text().replace('?timeline=','?untrusted='))
        with self.assertRaisesRegex(ValueError,'Unexpected WEB cache map'):
            check(self.runtime)

    def test_rejects_a_different_actually_served_renderer(self):
        (self.runtime/'out/renderer').unlink()
        (self.runtime/'out/renderer').mkdir()
        with self.assertRaisesRegex(ValueError,'WEB entrypoint resolves to another renderer root'):
            check(self.runtime)


if __name__ == '__main__':
    unittest.main()
