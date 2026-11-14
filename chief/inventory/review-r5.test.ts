// Review r5 [14]: the e2e harness only uses the local Docker daemon, and it verifies a per-run identity of its
// Postgres and Mailpit through the application's own settings before it migrates, seeds or mails anything.
// These checks are hermetic (no Docker): run.sh refuses a remote daemon before it touches Docker, and identity.cjs
// is exercised against endpoints that are not this run's containers (nothing listening, a foreign Mailpit API).
// The decoy-Postgres and real-run proofs go through chief/inventory/e2e/run.sh itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const runSh = path.join(here, 'e2e/run.sh');
const script = fs.readFileSync(runSh, 'utf8');
const { violations } = require('./e2e/preflight.cjs') as { violations: (env: Env) => string[] };
// Loaded per test, so every check reports on its own.
const identityViolations = async (env: Env, options?: { databaseOnly?: boolean }): Promise<string[]> =>
  (require('./e2e/identity.cjs') as { identityViolations: typeof identityViolations }).identityViolations(env, options);

type Env = Record<string, string | undefined>;

const MARKER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** The environment run.sh builds: test.env sourced into an `env -i` shell. */
const harnessEnv = (): Env => {
  const env: Env = { CHIEF_E2E_ISOLATED: '4242', PATH: '/usr/bin', HOME: '/root' };

  for (const line of fs.readFileSync(path.join(here, 'e2e/test.env'), 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());

    if (m) {
      env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }

  return env;
};

/** A free loopback port (nothing listens on it once this returns). */
const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return port;
};

const runHarness = (env: Record<string, string>) =>
  spawnSync('bash', [runSh, '--phase', 'main'], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/root', ...env } as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: 30_000,
  });

test('[14] run.sh refuses a remote DOCKER_HOST before it touches Docker', () => {
  const res = runHarness({ DOCKER_HOST: 'tcp://10.20.30.40:2376' });
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /REFUSED: DOCKER_HOST=tcp:\/\/10\.20\.30\.40:2376 is not the local Docker endpoint/);
});

test('[14] run.sh refuses a non-default DOCKER_CONTEXT', () => {
  const res = runHarness({ DOCKER_CONTEXT: 'remote-box' });
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /REFUSED: DOCKER_CONTEXT=remote-box/);
});

test('[14] run.sh never inherits Docker settings and pins the local endpoint with an empty Docker config', () => {
  const allowlist = /for v in ([^;]+); do/.exec(script)?.[1] ?? '';
  assert.ok(allowlist.includes('PATH'), allowlist);
  assert.doesNotMatch(allowlist, /DOCKER/);
  assert.match(script, /^LOCAL_DOCKER=unix:\/\/\/var\/run\/docker\.sock$/m);
  assert.match(script, /^export DOCKER_HOST=\$LOCAL_DOCKER$/m);
  assert.match(script, /^DOCKER_CONFIG=\$\(mktemp -d /m);
  assert.match(script, /^unset DOCKER_CONTEXT$/m);
  assert.ok(
    script.indexOf('export DOCKER_HOST=$LOCAL_DOCKER') < script.indexOf('docker run'),
    'pinned before docker run',
  );
});

test('[14] the per-run identity is written into the containers and verified before migrations and server starts', () => {
  const marked = script.indexOf(`ALTER DATABASE documenso_test SET chief_e2e.run_id = '$CHIEF_E2E_RUN_ID'`);
  const verified = script.indexOf('identity "before migrations"');
  const migrated = script.indexOf('prisma migrate deploy');
  assert.ok(marked > script.indexOf('docker run'), 'marked after the container started');
  assert.ok(marked < verified && verified < migrated, 'mark, verify, then migrate');
  assert.match(script, /--label "chief-e2e-\$CHIEF_E2E_RUN_ID"/);
  assert.match(script, /start_server\(\) \{\n {2}preflight "server start \(\$1\)"\n {2}identity "server start/);
  assert.match(script, /ALTER DATABASE documenso_replica SET chief_e2e\.run_id/);
  assert.match(script, /start_server replica --replica/);
});

test('[14] the preflight refuses a remote Docker endpoint or context in the test process too', () => {
  assert.deepEqual(violations({ ...harnessEnv(), DOCKER_HOST: 'unix:///var/run/docker.sock' }), []);
  assert.match(
    violations({ ...harnessEnv(), DOCKER_HOST: 'ssh://me@box' }).join('\n'),
    /DOCKER_HOST is ssh:\/\/me@box/,
  );
  assert.match(violations({ ...harnessEnv(), DOCKER_CONTEXT: 'box' }).join('\n'), /DOCKER_CONTEXT is box/);
});

test('[14] identity refuses to run without a per-run marker', async () => {
  const bad = await identityViolations({ ...harnessEnv() });
  assert.match(bad.join('\n'), /CHIEF_E2E_RUN_ID is not a per-run marker/);
});

test('[14] identity refuses a database URL that is not this run (nothing answers there)', async () => {
  const port = await freePort();
  const url = `postgresql://postgres:x@127.0.0.1:${port}/documenso_test`;
  const env = {
    ...harnessEnv(),
    CHIEF_E2E_RUN_ID: MARKER,
    NEXT_PRIVATE_DATABASE_URL: url,
    NEXT_PRIVATE_DIRECT_DATABASE_URL: url,
  };
  const bad = await identityViolations(env, { databaseOnly: true });
  assert.equal(bad.length, 2, bad.join('\n'));
  assert.match(
    bad.join('\n'),
    /NEXT_PRIVATE_DATABASE_URL \(postgresql:\/\/postgres:\*\*\*@127\.0\.0\.1:\d+\/documenso_test\) did not answer/,
  );
  assert.doesNotMatch(bad.join('\n'), /postgres:x@/, 'passwords are not echoed');
});

test('[14] identity refuses a Mailpit that is not this run (foreign label), and an SMTP port that is not its sink', async () => {
  let label = 'someone-elses-mailpit';
  const api = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ Label: label }));
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  const { port } = api.address() as AddressInfo;
  const dbPort = await freePort();
  const smtpPort = await freePort();
  const url = `postgresql://postgres:x@127.0.0.1:${dbPort}/documenso_test`;
  const env = {
    ...harnessEnv(),
    CHIEF_E2E_RUN_ID: MARKER,
    NEXT_PRIVATE_DATABASE_URL: url,
    NEXT_PRIVATE_DIRECT_DATABASE_URL: url,
    CHIEF_E2E_MAILPIT_URL: `http://127.0.0.1:${port}`,
    NEXT_PRIVATE_SMTP_PORT: String(smtpPort),
  };

  try {
    assert.match(
      (await identityViolations(env)).join('\n'),
      /Mailpit API at .* is not this run's container \(label "someone-elses-mailpit"/,
    );

    // The right label, but the SMTP port the server would send to is not that Mailpit's.
    label = `chief-e2e-${MARKER}`;
    assert.match(
      (await identityViolations(env)).join('\n'),
      new RegExp(`SMTP 127\\.0\\.0\\.1:${smtpPort} probe failed`),
    );
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()));
  }
});
