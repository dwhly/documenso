from pathlib import Path
import re
import unittest
import yaml
ROOT=Path(__file__).resolve().parents[2]
class WorkflowRegression(unittest.TestCase):
    def test_05_build_has_no_publish_credentials(self):
        workflow=yaml.safe_load((ROOT/'.github/workflows/chief-images.yml').read_text())
        self.assertNotEqual(workflow.get('permissions',{}).get('packages'),'write')
        build=workflow['jobs']['build']
        self.assertNotEqual(build.get('permissions',{}).get('packages'),'write')
        self.assertNotIn('login-action',str(build))
        for job in workflow['jobs'].values():
            for step in job['steps']:
                if 'uses' in step:
                    self.assertRegex(step['uses'],r'@[a-f0-9]{40}$')
                if step.get('uses','').startswith('actions/checkout@'):
                    self.assertIs(step['with']['persist-credentials'],False)
        publish=workflow['jobs']['publish']
        self.assertEqual(publish['needs'],'build')
        self.assertIn('docker load',str(publish))
        self.assertNotIn('docker run',str(publish));self.assertNotIn('npm ',str(publish))
        self.assertEqual(set(workflow['jobs']['manifest']['needs']),{'build','publish'})
    def test_04_no_upstream_fallback_without_ee_check(self):
        workflow=yaml.safe_load((ROOT/'.github/workflows/chief-images.yml').read_text())
        build=next(s['run'] for s in workflow['jobs']['build']['steps'] if s.get('name')=='Build')
        fallback=build.split('          else')[-1] if '          else' in build else build.split('else')[1]
        self.assertIn('exit 1',fallback)
        self.assertNotIn('docker/Dockerfile',fallback)
        self.assertIn('python3 chief/spike/check-image-ee.py',build)
        self.assertEqual(set(workflow['jobs']['manifest']['needs']),{'build','publish'})
if __name__=='__main__':unittest.main()
