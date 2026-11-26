import json
from pathlib import Path
import tempfile
import unittest
from bind import bind


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.workspace={'id':'card','instanceId':'instance','hostId':'local','path':str(self.root)}
        self.call=lambda method,params: {'worktree':self.workspace} if method=='worktree.show' else {'tasks':[{'id':'task_a','run_id':'run_a'},{'id':'task_b','run_id':'run_b'}]}
    def test_preview_does_not_write_and_explicit_write_is_idempotent(self):
        bind(self.call,'card','instance','run_a','task_a')
        self.assertEqual(list(self.root.iterdir()),[])
        bind(self.call,'card','instance','run_a','task_a',True)
        result=bind(self.call,'card','instance','run_a','task_a',True)
        self.assertEqual(len(result['links']),1)
        result=bind(self.call,'card','instance','run_b','task_b',True)
        self.assertEqual(len(result['links']),2)
    def test_reused_instance_wrong_family_and_symlink_are_rejected(self):
        with self.assertRaises(ValueError):bind(self.call,'card','old','run_a','task_a',True)
        with self.assertRaises(ValueError):bind(self.call,'card','instance','run_b','task_a',True)
        (self.root/'.orca-task-timeline.json').symlink_to(self.root/'outside')
        with self.assertRaises(ValueError):bind(self.call,'card','instance','run_a','task_a',True)
        self.assertFalse((self.root/'outside').exists())


if __name__=='__main__':unittest.main()
