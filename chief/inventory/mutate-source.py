"""Revert one reviewed source fix, require its regression to fail, and restore it."""
import json
import subprocess
from pathlib import Path

cases=[
 ('3-pdf-origin','apps/remix/app/chief/public-env.server.ts',lambda s:s.replace('environment.NEXT_PUBLIC_WEBAPP_URL = configured;',''),['npx','tsx','--test','--test-name-pattern=PDF URLs','chief/inventory/fixes.test.ts']),
 ('4-classification','apps/remix/server/chief/procedures.json',lambda s:json.dumps([{**e,'classification':'deal'} if e['name']=='document.share' else e for e in json.loads(s)]),['npx','tsx','--test','--test-name-pattern=finding 4','chief/inventory/fixes.test.ts']),
 ('11-inbox','apps/remix/server/chief/procedures.json',lambda s:json.dumps([{**e,'classification':'deal'} if e['name'].startswith('document.inbox.') else e for e in json.loads(s)]),['npx','tsx','--test','--test-name-pattern=finding 11','chief/inventory/fixes.test.ts']),
 ('2','chief/deploy/compose.yml',lambda s:s.replace('127.0.0.1:8796:3000','8796:3000'),['python3','chief/inventory/fixes.test.py','ReviewRegressions.test_finding_2_no_wildcard_host_bindings']),
 ('7','packages/community-ee/server-only/signing/csc/finalize-tsp-completion.ts',lambda s:s.replace('=> unsupported();','=> {};'),['npx','tsx','--test','--test-name-pattern=finding 7','chief/inventory/fixes.test.ts']),
 ('8','apps/remix/server/chief/pages.json',lambda s:json.dumps([{**e,'classification':'human'} if e['path']=='/organisation/invite/:token' else e for e in json.loads(s)]),['npx','tsx','--test','--test-name-pattern=finding 8','chief/inventory/fixes.test.ts']),
 ('10','chief/spike/check-image-ee.py',lambda s:s.replace("and '/build/' in '/' + entry.name", "and False"),['python3','chief/inventory/fixes.test.py','ReviewRegressions.test_finding_10_detect_unsourcemapped_enterprise_strings']),
 ('12-root','apps/remix/server/chief/policy.ts',lambda s:s.replace("    if (path === '/_root') {\n      path = '/';\n    }",''),['npx','tsx','--test','--test-name-pattern=root data','chief/inventory/fixes.test.ts']),
 ('12-key','apps/remix/server/middleware.ts',lambda s:s.replace('timingSafeEqual(actual, secret)','actual.toString() === secret.toString()'),['npx','tsx','--test','--test-name-pattern=constant-time','chief/inventory/fixes.test.ts']),
 ('12-link','apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx',lambda s:s.replace('<Link to="/articles/signature-disclosure"','<Link to="/"'),['npx','tsx','--test','--test-name-pattern=brand links','chief/inventory/fixes.test.ts']),
]
results=[]
for finding,filename,mutate,command in cases:
    path=Path(filename);original=path.read_text();changed=mutate(original)
    assert changed!=original,finding
    try:
        path.write_text(changed)
        result=subprocess.run(command,capture_output=True,text=True)
        assert result.returncode!=0, f'Mutation survived: {finding}'
        failure=result.stdout+result.stderr
    finally: path.write_text(original)
    restored=subprocess.run(command,capture_output=True,text=True)
    assert restored.returncode==0,restored.stdout+restored.stderr
    results.append({'finding':finding,'old_exit':result.returncode,'restored_exit':restored.returncode,'output':failure})
    print(f'Finding {finding}: old FAIL; restored PASS')
Path('chief/spike/r2-source-mutations.json').write_text(json.dumps(results,indent=2)+'\n')
