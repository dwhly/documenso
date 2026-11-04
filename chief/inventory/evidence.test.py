import json
import os
import re
import subprocess
import unittest
from pathlib import Path

class Evidence(unittest.TestCase):
    def test_finding_6_status_matches_canonical_acceptance_and_budget(self):
        status=Path(os.environ.get('SIGN_STATUS','/Users/dano/code/chief-dealroom/docs/status/A-sign.md')).read_text()
        acceptance=json.loads(Path('chief/spike/acceptance.json').read_text())
        budget=json.loads(subprocess.run(['python3','chief/spike/patch-budget.py'],capture_output=True,text=True).stdout)
        self.assertIn(f"{budget['upstream_files']} files / {budget['changed_lines']} added+deleted lines",status)
        self.assertEqual(set(re.findall(r'envelope_[a-z0-9]+',status)),{acceptance['completed_envelope']})
        self.assertNotIn('thin layer in progress',status.lower())
        self.assertIn('## Fix round r2',status)

if __name__=='__main__': unittest.main()
