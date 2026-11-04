"""Mutation-check executable fixes in the disposable acceptance container, restoring every file."""
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

container='chief-sign-v1-sign-1'
root='/app/apps/remix/build/server/hono/'
results=json.loads(Path('chief/spike/r2-runtime-mutations.json').read_text()) if os.environ.get('SIGN_MUTATION') else []
def command(args,**kw): return subprocess.run(args,capture_output=True,text=True,**kw)
def write(path,content):
    with tempfile.NamedTemporaryFile('w') as f:
        f.write(content);f.flush()
        r=command(['docker','cp',f.name,container+':'+path]);assert r.returncode==0,r.stderr
        r=command(['docker','exec','-u','root',container,'chmod','644',path]);assert r.returncode==0,r.stderr

def restart():
    r=command(['docker','restart',container]);assert r.returncode==0,r.stderr
    for _ in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8796/api/deal/openapi.json',timeout=1) as response:
                if response.status==200:return
        except Exception: time.sleep(.5)
    raise RuntimeError('mutated server did not start')

cases=[
 ('3-origin','server/csrf-middleware.js',lambda s:s.replace(' && !isRecipientOrigin(c.req.raw)',''),'recipient origin passes'),
 ('1-multipart','server/middleware.js',lambda s:s.replace("for (const [key, value] of form.entries()) {", "for (const [key, value] of [['payload', form.get('payload')]]) {"),'payload brackets'),
 ('1-content-type','server/middleware.js',lambda s:s.replace("return c.json({\n          error: 'JSON or multipart body required'\n        }, 415);",'payloads.push(null);'),'unsupported API content'),
 ('3','server/chief/recipient-listener.js',lambda s:s.replace('if (!isRecipientRequest(', 'if (false && !isRecipientRequest('),'independent recipient socket'),
 ('5','server/chief/deal-api.js',lambda s:s.replace("if (scope && typeof scope", "if (false && scope && typeof scope"),'issuing team'),
 ('9-size','server/middleware.js',lambda s:s.replace('maxSize: 25 * 1024 * 1024','maxSize: 250 * 1024 * 1024'),'oversized unauthenticated'),
 ('9-parse','server/middleware.js',lambda s:s.replace("return c.json({\n        error: 'Malformed request body'\n      }, 400);", "throw new Error('Malformed request body');"),'malformed JSON and multipart'),
 ('11-rate','server/router.js',lambda s:s.replace("app.use('/api/deal/*', apiV2RateLimitMiddleware);",''),'supplemental API applies'),
]
for finding,file,mutate,pattern in cases:
    if os.environ.get('SIGN_MUTATION') and os.environ['SIGN_MUTATION'] != finding: continue
    path=root+file;original=command(['docker','exec',container,'cat',path]).stdout
    changed=mutate(original);assert changed!=original,finding
    test=['node','--test','--test-name-pattern='+pattern,'chief/inventory/http.test.mjs']
    try:
        write(path,changed);restart()
        old=command(test,env={**os.environ,'CI':'true'});assert old.returncode!=0,'Mutation survived '+finding
    finally: write(path,original);restart()
    new=command(test,env={**os.environ,'CI':'true'});assert new.returncode==0,new.stdout+new.stderr
    results.append({'finding':finding,'old_exit':old.returncode,'restored_exit':new.returncode,'old_output':old.stdout+old.stderr,'restored_output':new.stdout})
    Path('chief/spike/r2-runtime-mutations.json').write_text(json.dumps(results,indent=2)+'\n')
    print(f'Finding {finding}: old FAIL; restored PASS',flush=True)

if os.environ.get('SIGN_MUTATION'): raise SystemExit(0)

path=root+'server/chief/deal-api.js';original=command(['docker','exec',container,'cat',path]).stdout
changed=original.replace('if (native._def.middlewares[0] !== authenticatedMiddleware._middlewares[0]) {','if (false) {')
assert changed!=original
command(['docker','cp','chief/inventory/auth-guard.mjs',container+':/tmp/chief-auth-guard.mjs'])
test=['docker','exec',container,'node','/tmp/chief-auth-guard.mjs']
try:
    write(path,changed)
    old=command(test);assert old.returncode!=0,'Auth guard mutation survived'
finally: write(path,original)
new=command(test);assert new.returncode==0,new.stdout+new.stderr
results.append({'finding':'4-auth','old_exit':old.returncode,'restored_exit':new.returncode,'old_output':old.stdout+old.stderr,'restored_output':new.stdout})
Path('chief/spike/r2-runtime-mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print('Finding 4-auth: old FAIL; restored PASS',flush=True)
