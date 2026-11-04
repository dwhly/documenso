import io
import json
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

class ReviewRegressions(unittest.TestCase):
    def test_finding_2_no_wildcard_host_bindings(self):
        config=json.loads(subprocess.check_output(['docker','compose','-f','chief/deploy/compose.yml','config','--format','json']))
        for port in config['services']['sign']['ports']:
            self.assertEqual(port['host_ip'], '127.0.0.1')

    def test_finding_10_detect_unsourcemapped_enterprise_strings(self):
        for marker in ['CSC OAuth callback state mismatch','No signature found in request']:
            with tempfile.TemporaryDirectory() as d:
                layer=io.BytesIO()
                with tarfile.open(fileobj=layer,mode='w') as t:
                    body=f'console.error("{marker}");'.encode()
                    item=tarfile.TarInfo('app/apps/remix/build/server/chunk-123.js');item.size=len(body)
                    t.addfile(item,io.BytesIO(body))
                archive=Path(d)/'image.tar'
                with tarfile.open(archive,'w') as t:
                    for name,body in [('manifest.json',json.dumps([{'Layers':['layer.tar']}]).encode()),('layer.tar',layer.getvalue())]:
                        item=tarfile.TarInfo(name);item.size=len(body);t.addfile(item,io.BytesIO(body))
                result=subprocess.run(['python3','chief/spike/check-image-ee.py',str(archive)],capture_output=True,text=True)
                self.assertEqual(result.returncode,1,result.stdout)
                self.assertEqual(json.loads(result.stdout)['ee_strings'],1)

if __name__=='__main__': unittest.main()
