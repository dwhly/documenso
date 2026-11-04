#!/usr/bin/env python3
import json,pathlib,subprocess
own=pathlib.Path('chief/spike/first-party-directories.txt').read_text().splitlines()
rows=[line.split('\t') for line in subprocess.check_output(['git','diff','--numstat','v2.21.1...HEAD'],text=True).splitlines()]
rows=[row for row in rows if not any(row[2].startswith(prefix) for prefix in own)]
lines=sum(int(row[0])+int(row[1]) for row in rows if row[0]!='-')
result={'upstream_files':len(rows),'changed_lines':lines,'within_target':len(rows)<=20 and lines<=1000,'files':[row[2] for row in rows]}
print(json.dumps(result,indent=2))
raise SystemExit(0 if result['within_target'] else 1)
