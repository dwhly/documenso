#!/usr/bin/env node
// Isolation preflight for chief/inventory/e2e/run.sh (review r4 [14]). FAILS unless every database URL points at the
// harness's throwaway Postgres and mail can only reach its loopback Mailpit (smtp-auth, no service, no credentials).
//
// run.sh calls it before it starts containers, migrates or starts a server; playwright.config.ts calls it again in
// the test process. The expected endpoints come from test.env itself, not from the environment being checked.
//
// Usage: node chief/inventory/e2e/preflight.cjs <stage>       (exit 1 with every violation listed)
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEST_ENV = path.join(__dirname, 'test.env');
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
const DATABASES = new Set(['documenso_test', 'documenso_replica']);

/** KEY=VALUE lines of test.env (optional surrounding quotes; # comments). */
const readTestEnv = () => {
  const out = {};

  for (const line of fs.readFileSync(TEST_ENV, 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());

    if (m) {
      out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }

  return out;
};

const portOf = (url) => new URL(url.replace(/^postgres(ql)?:/, 'http:')).port;

const SMTP_ALLOWED = new Set([
  'NEXT_PRIVATE_SMTP_TRANSPORT',
  'NEXT_PRIVATE_SMTP_HOST',
  'NEXT_PRIVATE_SMTP_PORT',
  'NEXT_PRIVATE_SMTP_SECURE',
  'NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS',
  'NEXT_PRIVATE_SMTP_FROM_NAME',
  'NEXT_PRIVATE_SMTP_FROM_ADDRESS',
]);

/** Every isolation violation in `env` (empty = isolated). */
const violations = (env) => {
  const expected = readTestEnv();
  const pgPort = portOf(expected.NEXT_PRIVATE_DATABASE_URL);
  const smtpPort = expected.NEXT_PRIVATE_SMTP_PORT;
  const bad = [];

  if (!env.CHIEF_E2E_ISOLATED) {
    bad.push('CHIEF_E2E_ISOLATED is unset: run through chief/inventory/e2e/run.sh (scrubbed environment)');
  }

  // Databases: the primary/direct URLs must be set; every database-ish variable that is set (replicas, the
  // DATABASE_URL/POSTGRES_* aliases packages/prisma/helper.ts honours, PG* libpq vars) must be the throwaway Postgres.
  for (const key of ['NEXT_PRIVATE_DATABASE_URL', 'NEXT_PRIVATE_DIRECT_DATABASE_URL']) {
    if (!env[key]) {
      bad.push(`${key} is unset`);
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value || !/DATABASE|POSTGRES|REPLICA|^PG[A-Z]+$/.test(key)) {
      continue;
    }

    for (const raw of value.split(',').map((v) => v.trim())) {
      let url;

      try {
        url = new URL(raw.replace(/^postgres(ql)?:/, 'http:'));
      } catch {
        bad.push(`${key} is not a throwaway Postgres URL`);
        continue;
      }

      const db = url.pathname.replace(/^\//, '');

      if (!/^postgres(ql)?:\/\//.test(raw) || !LOOPBACK.has(url.hostname) || url.port !== pgPort || !DATABASES.has(db)) {
        bad.push(`${key} points at ${url.hostname}:${url.port || '(default)'}/${db}, not the throwaway Postgres 127.0.0.1:${pgPort}`);
      }
    }
  }

  // Mail: smtp-auth to the loopback Mailpit only. A Nodemailer `service` overrides host/port, and credentials or
  // another transport (resend, mailchannels, smtp-api) would reach a real provider.
  if ((env.NEXT_PRIVATE_SMTP_TRANSPORT ?? '') !== 'smtp-auth') {
    bad.push(`NEXT_PRIVATE_SMTP_TRANSPORT is "${env.NEXT_PRIVATE_SMTP_TRANSPORT ?? ''}", not smtp-auth`);
  }

  if (!LOOPBACK.has(env.NEXT_PRIVATE_SMTP_HOST ?? '') || env.NEXT_PRIVATE_SMTP_PORT !== smtpPort) {
    bad.push(`SMTP is ${env.NEXT_PRIVATE_SMTP_HOST ?? ''}:${env.NEXT_PRIVATE_SMTP_PORT ?? ''}, not the Mailpit sink 127.0.0.1:${smtpPort}`);
  }

  if (env.NEXT_PRIVATE_SMTP_SECURE === 'true') {
    bad.push('NEXT_PRIVATE_SMTP_SECURE=true (the Mailpit sink is plain SMTP)');
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      continue;
    }

    if (/^NEXT_PRIVATE_SMTP_/.test(key) && !SMTP_ALLOWED.has(key)) {
      bad.push(`${key} is set (SMTP service/credentials must be empty in the harness)`);
    }

    if (/^NEXT_PRIVATE_(RESEND|MAILCHANNELS|SENDGRID|POSTMARK|SES)_/.test(key)) {
      bad.push(`${key} is set (no mail provider other than the Mailpit sink)`);
    }

    if (/^NEXT_PRIVATE_UPLOAD_/.test(key)) {
      bad.push(`${key} is set (uploads stay in the throwaway database)`);
    }
  }

  if (env.NEXT_PUBLIC_UPLOAD_TRANSPORT !== 'database') {
    bad.push(`NEXT_PUBLIC_UPLOAD_TRANSPORT is "${env.NEXT_PUBLIC_UPLOAD_TRANSPORT ?? ''}", not database`);
  }

  return bad;
};

const assertIsolated = (stage, env = process.env) => {
  const bad = violations(env);

  if (bad.length > 0) {
    throw new Error(`chief e2e preflight (${stage}) REFUSED, the harness is not isolated:\n  - ${bad.join('\n  - ')}`);
  }
};

module.exports = { assertIsolated, violations };

if (require.main === module) {
  const stage = process.argv[2] ?? 'cli';

  try {
    assertIsolated(stage);
    console.log(`chief e2e preflight (${stage}): isolated (throwaway Postgres + loopback Mailpit only)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
