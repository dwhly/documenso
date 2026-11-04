#!/usr/bin/env python3
"""Check docker-save layers without importing or displaying implementation bodies."""
import argparse
import json
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('archive', help='Archive produced by docker image save')
args = parser.parse_args()
findings = []
layer_count = 0
with tarfile.open(args.archive) as archive:
    manifest = json.load(archive.extractfile('manifest.json'))
    for image in manifest:
        for layer in image['Layers']:
            layer_count += 1
            path_entries = []
            sourcemaps = []
            ee_strings = []
            with tarfile.open(fileobj=archive.extractfile(layer), mode='r|*') as files:
                for entry in files:
                    if 'packages/ee' in entry.name or 'packages/ee' in entry.linkname:
                        path_entries.append({'path': entry.name, 'size': entry.size, 'link': entry.linkname})
                    if entry.isfile() and entry.name.endswith('.map'):
                        content = files.extractfile(entry).read()
                        if b'packages/ee/' in content or b'packages\\\\ee\\\\' in content:
                            sourcemaps.append(entry.name)
                    if entry.isfile() and '/build/' in '/' + entry.name and not entry.name.endswith('.map'):
                        content = files.extractfile(entry).read()
                        for marker in [b'CSC OAuth callback state mismatch', b'No signature found in request']:
                            if marker in content:
                                ee_strings.append({'path': entry.name, 'marker': marker.decode()})
            if path_entries or sourcemaps or ee_strings:
                findings.append({'layer': layer, 'ee_path_entries': path_entries, 'ee_sourcemaps': sourcemaps, 'ee_strings': ee_strings})
result = {
    'passed': not findings,
    'layers_checked': layer_count,
    'ee_path_entries': sum(len(x['ee_path_entries']) for x in findings),
    'ee_sourcemaps': sum(len(x['ee_sourcemaps']) for x in findings),
    'ee_strings': sum(len(x['ee_strings']) for x in findings),
    'findings': findings,
}
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['passed'] else 1)
