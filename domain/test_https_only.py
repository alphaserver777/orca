"""Firewall behavior checks; no host firewall commands are executed."""
import runpy
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('https-only.py')


class FirewallTests(unittest.TestCase):
    def run_script(self, check_code=0, insert_error=False):
        def command(args, **kwargs):
            if '-I' in args and insert_error:
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, check_code if '-C' in args else 0)
        with patch('shutil.which', side_effect=lambda name: '/usr/sbin/' + name), patch('subprocess.run', side_effect=command) as run:
            runpy.run_path(str(SCRIPT))
            return [call.args[0] for call in run.call_args_list]

    def test_existing_rules_are_not_duplicated(self):
        calls = self.run_script()
        self.assertEqual(len(calls), 2)
        self.assertTrue(all('-C' in args for args in calls))

    def test_missing_rules_inserted_for_both_families(self):
        calls = self.run_script(check_code=1)
        inserts = [args for args in calls if '-I' in args]
        self.assertEqual([args[0] for args in inserts], ['/usr/sbin/iptables', '/usr/sbin/ip6tables'])
        for args in inserts:
            self.assertEqual(args[1:], ['-I', 'INPUT', '!', '-i', 'lo', '-p', 'tcp', '--dport', '3040', '-m', 'comment', '--comment', 'orca-https-only', '-j', 'REJECT'])

    def test_rule_insertion_failure_aborts_start(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_script(check_code=1, insert_error=True)


if __name__ == '__main__':
    unittest.main()
