// Review r4 [14]: the e2e harness's isolation preflight (chief/inventory/e2e/preflight.cjs) refuses inherited or
// dotenv-restored database replicas, Nodemailer services, SMTP credentials and other mail/upload providers, and
// accepts only the throwaway Postgres + loopback Mailpit configuration from test.env.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const { violations } = require('./e2e/preflight.cjs') as { violations: (env: NodeJS.ProcessEnv) => string[] };

/** The environment run.sh builds: test.env sourced into an `env -i` shell. */
const harnessEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { CHIEF_E2E_ISOLATED: '4242', PATH: '/usr/bin', HOME: '/root' };

  for (const line of fs.readFileSync(path.join(here, 'e2e/test.env'), 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());

    if (m) {
      env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }

  return env;
};

test('[14] the harness configuration itself passes', () => {
  assert.deepEqual(violations(harnessEnv()), []);
});

test('[14] the replica phase (a second database on the throwaway Postgres) passes', () => {
  const env = harnessEnv();
  env.NEXT_PRIVATE_DATABASE_REPLICA_URLS = env.NEXT_PRIVATE_DATABASE_URL!.replace(/\/documenso_test$/, '/documenso_replica');
  assert.deepEqual(violations(env), []);
});

const refused: Array<[string, NodeJS.ProcessEnv, RegExp]> = [
  ['an inherited replica URL', { NEXT_PRIVATE_DATABASE_REPLICA_URLS: 'postgresql://u:p@db.stack.internal:5432/documenso' }, /REPLICA_URLS points at db\.stack\.internal/],
  ['a replica list with one external entry', { NEXT_PRIVATE_DATABASE_REPLICA_URLS: 'postgresql://u:p@127.0.0.1:55499/documenso_replica, postgresql://u:p@10.0.0.5:5432/documenso' }, /points at 10\.0\.0\.5/],
  ['a replica on the right host but another port', { NEXT_PRIVATE_DATABASE_REPLICA_URLS: 'postgresql://u:p@127.0.0.1:5432/documenso_test' }, /127\.0\.0\.1:5432/],
  ['an external primary URL', { NEXT_PRIVATE_DATABASE_URL: 'postgresql://u:p@prod-db:5432/documenso' }, /NEXT_PRIVATE_DATABASE_URL points at prod-db/],
  ['a POSTGRES_PRISMA_URL alias', { POSTGRES_PRISMA_URL: 'postgres://u:p@neon.example:5432/x' }, /POSTGRES_PRISMA_URL/],
  ['a libpq PGHOST', { PGHOST: 'prod-db' }, /PGHOST/],
  ['a Nodemailer service (overrides host/port)', { NEXT_PRIVATE_SMTP_SERVICE: 'gmail' }, /NEXT_PRIVATE_SMTP_SERVICE is set/],
  ['SMTP credentials', { NEXT_PRIVATE_SMTP_USERNAME: 'me@example.com', NEXT_PRIVATE_SMTP_PASSWORD: 'x' }, /SMTP_USERNAME is set[\s\S]*SMTP_PASSWORD is set/],
  ['an SMTP API key', { NEXT_PRIVATE_SMTP_APIKEY: 'k' }, /SMTP_APIKEY is set/],
  ['another SMTP host', { NEXT_PRIVATE_SMTP_HOST: 'smtp.example.com' }, /not the Mailpit sink/],
  ['another SMTP port', { NEXT_PRIVATE_SMTP_PORT: '587' }, /not the Mailpit sink/],
  ['another transport', { NEXT_PRIVATE_SMTP_TRANSPORT: 'resend', NEXT_PRIVATE_RESEND_API_KEY: 're_x' }, /not smtp-auth[\s\S]*RESEND_API_KEY is set/],
  ['S3 uploads', { NEXT_PUBLIC_UPLOAD_TRANSPORT: 's3', NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID: 'AK' }, /UPLOAD_ACCESS_KEY_ID is set[\s\S]*not database/],
  ['a run outside run.sh', { CHIEF_E2E_ISOLATED: '' }, /CHIEF_E2E_ISOLATED is unset/],
];

for (const [what, override, expected] of refused) {
  test(`[14] refuses ${what}`, () => {
    const bad = violations({ ...harnessEnv(), ...override });
    assert.ok(bad.length > 0, 'refused');
    assert.match(bad.join('\n'), expected);
  });
}

test('[14] the CLI exits non-zero with every violation listed', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = { ...harnessEnv(), NEXT_PRIVATE_SMTP_SERVICE: 'gmail', NEXT_PRIVATE_DATABASE_REPLICA_URLS: 'postgresql://u:p@x.invalid:5432/d' };
  const res = spawnSync(process.execPath, [path.join(here, 'e2e/preflight.cjs'), 'test'], { env, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /REFUSED[\s\S]*REPLICA_URLS[\s\S]*SMTP_SERVICE/);
  assert.doesNotMatch(res.stderr, /u:p@/, 'credentials in URLs are not echoed');
});

test('[14] run.sh scrubs its environment, keeps an allowlist, and runs the preflight before containers and servers', () => {
  const script = fs.readFileSync(path.join(here, 'e2e/run.sh'), 'utf8');
  assert.match(script, /exec env -i "\$\{keep\[@\]\}" bash "\$0" "\$@"/);
  assert.ok(script.indexOf('preflight "before containers and migrations"') < script.indexOf('docker run'), 'preflight before docker run');
  assert.ok(script.indexOf('preflight "before containers and migrations"') < script.indexOf('prisma migrate deploy'));
  assert.match(script, /start_server\(\) \{\n {2}preflight "server start/);
  const config = fs.readFileSync(path.join(here, '../../packages/app-tests/playwright.config.ts'), 'utf8');
  assert.match(config, /if \(process\.env\.CHIEF_E2E_ISOLATED\) \{[\s\S]*assertIsolated[\s\S]*\} else \{[\s\S]*dotenv\.config/);
});
