import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const run = (sendRepo?: string) => {
  const env = { ...process.env };
  delete env.SEND_REPO;
  delete env.NODE_TEST_CONTEXT;
  if (sendRepo !== undefined) env.SEND_REPO = sendRepo;
  // Pin the reporter: the assertions below read TAP output, and Node's default reporter differs by environment.
  return spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap',
    process.env.GATE3_DRIFT_TEST_FILE || 'chief/inventory/counterparty-drift.test.ts'], { env, encoding: 'utf8' });
};

test('minor14 drift skips clearly only when SEND_REPO is unset', () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /SKIP SEND_REPO is unset/);
  assert.match(result.stdout, /# skipped 1/);
});

test('minor14 a configured missing Send checkout fails instead of skipping or using a sibling', () => {
  const result = run(resolve('chief/inventory/missing-send-fixture'));
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing-send-fixture/);
  assert.match(result.stdout, /# skipped 0/);
});

test('minor14 an explicitly empty SEND_REPO is a configuration failure, not a skip', () => {
  const result = run('');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /# skipped 0/);
});
