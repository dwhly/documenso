#!/usr/bin/env node
// Per-run identity check for chief/inventory/e2e/run.sh (review r5 [14]). The isolation preflight proves the URLs
// have the right SHAPE (loopback, harness port and database). This check proves the services behind those URLs are the
// containers THIS run started. That matters because an unrelated Postgres or Mailpit can already listen on
// 127.0.0.1:55499 / :55025 / :55026.
//
// run.sh writes a random marker into the per-run containers through `docker exec`:
//   - Postgres: `ALTER DATABASE <db> SET chief_e2e.run_id = '<marker>'`, on documenso_test and later documenso_replica.
//   - Mailpit: started with `--label chief-e2e-<marker>`.
// This script then reads the marker back through the application's own settings:
//   - every database URL (NEXT_PRIVATE_DATABASE_URL, NEXT_PRIVATE_DIRECT_DATABASE_URL, and the replica URLs when the
//     replica phase is on): `current_setting('chief_e2e.run_id')` must equal the marker;
//   - the Mailpit API (CHIEF_E2E_MAILPIT_URL): /api/v1/webui must report the per-run label;
//   - the SMTP endpoint the server sends to (NEXT_PRIVATE_SMTP_HOST:PORT): a probe message sent there must arrive in
//     that same Mailpit. The probe is then deleted.
// If anything else answers, the check REFUSES (exit 1), so run.sh never migrates, seeds or mails it.
//
// Usage: CHIEF_E2E_RUN_ID=<marker> node chief/inventory/e2e/identity.cjs <stage> [--database-only|--replica]
'use strict';

const net = require('node:net');
const path = require('node:path');

const { Client } = require(require.resolve('pg', { paths: [path.join(__dirname, '../../..')] }));

const redact = (url) => url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@');

/** The run marker the database behind `url` reports ('' = none / not reachable). */
const databaseMarker = async (url) => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_setting('chief_e2e.run_id', true) AS marker");

    return rows[0]?.marker ?? '';
  } finally {
    await client.end().catch(() => undefined);
  }
};

const mailpitLabel = async (base) => {
  const res = await fetch(`${base}/api/v1/webui`, { signal: AbortSignal.timeout(5000) });

  if (!res.ok) {
    throw new Error(`GET /api/v1/webui: HTTP ${res.status}`);
  }

  return (await res.json()).Label ?? '';
};

/** Minimal SMTP client (no auth, no TLS: exactly what the harness server uses) that sends one probe message. */
const sendProbe = (host, port, subject) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: Number(port) });
    const steps = [
      'EHLO chief-e2e-identity',
      'MAIL FROM:<identity@example.test>',
      'RCPT TO:<identity@example.test>',
      'DATA',
      `From: identity@example.test\r\nTo: identity@example.test\r\nSubject: ${subject}\r\n\r\nchief e2e identity probe\r\n.`,
      'QUIT',
    ];
    let buffer = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('SMTP timeout')));
    socket.on('error', reject);
    socket.on('close', () =>
      steps.length === 0 ? resolve() : reject(new Error(`SMTP closed early: ${buffer.trim()}`)),
    );
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      // Wait for a complete final reply line ("250 ..." rather than "250-...").
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] ?? '';

      if (!/^\d{3} /.test(last) || !buffer.endsWith('\r\n')) {
        return;
      }

      buffer = '';

      if (!/^[23]/.test(last)) {
        socket.destroy(new Error(`SMTP refused: ${last}`));

        return;
      }

      const next = steps.shift();

      if (next === undefined) {
        socket.end();
      } else {
        socket.write(`${next}\r\n`);
      }
    });
  });

const verifyMail = async (env, marker, bad) => {
  const base = env.CHIEF_E2E_MAILPIT_URL ?? '';
  const label = `chief-e2e-${marker}`;

  try {
    const got = await mailpitLabel(base);

    if (got !== label) {
      bad.push(`the Mailpit API at ${base} is not this run's container (label "${got}", expected "${label}")`);

      return;
    }
  } catch (error) {
    bad.push(`the Mailpit API at ${base} did not answer as this run's container (${error.message})`);

    return;
  }

  // The API is ours. Now prove the SMTP endpoint the server is configured with delivers into it.
  const subject = `chief-e2e-identity-${marker}`;

  try {
    await sendProbe(env.NEXT_PRIVATE_SMTP_HOST, env.NEXT_PRIVATE_SMTP_PORT, subject);
  } catch (error) {
    bad.push(`SMTP ${env.NEXT_PRIVATE_SMTP_HOST}:${env.NEXT_PRIVATE_SMTP_PORT} probe failed (${error.message})`);

    return;
  }

  for (let i = 0; i < 25; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
    const { messages = [] } = await res.json();

    if (messages.length > 0) {
      await fetch(`${base}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: messages.map((m) => m.ID) }),
      });

      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  bad.push(
    `SMTP ${env.NEXT_PRIVATE_SMTP_HOST}:${env.NEXT_PRIVATE_SMTP_PORT} accepted the probe but it never reached this run's Mailpit`,
  );
};

/** Every identity violation (empty = these are this run's containers). */
const identityViolations = async (env, { databaseOnly = false, replica = false } = {}) => {
  const marker = env.CHIEF_E2E_RUN_ID ?? '';
  const bad = [];

  if (!/^[a-f0-9]{16,}$/.test(marker)) {
    return ['CHIEF_E2E_RUN_ID is not a per-run marker (run through chief/inventory/e2e/run.sh)'];
  }

  const urls = [
    ['NEXT_PRIVATE_DATABASE_URL', env.NEXT_PRIVATE_DATABASE_URL],
    ['NEXT_PRIVATE_DIRECT_DATABASE_URL', env.NEXT_PRIVATE_DIRECT_DATABASE_URL],
  ];

  if (replica) {
    for (const url of (env.NEXT_PRIVATE_DATABASE_REPLICA_URLS ?? '').split(',').map((u) => u.trim())) {
      urls.push(['NEXT_PRIVATE_DATABASE_REPLICA_URLS', url]);
    }
  }

  for (const [key, url] of urls) {
    if (!url) {
      bad.push(`${key} is unset`);
      continue;
    }

    try {
      const got = await databaseMarker(url);

      if (got !== marker) {
        bad.push(`${key} (${redact(url)}) is not this run's Postgres (run marker "${got}", expected "${marker}")`);
      }
    } catch (error) {
      bad.push(`${key} (${redact(url)}) did not answer as this run's Postgres (${error.message})`);
    }
  }

  if (!databaseOnly) {
    await verifyMail(env, marker, bad);
  }

  return bad;
};

module.exports = { identityViolations };

if (require.main === module) {
  const stage = process.argv[2] ?? 'cli';
  const options = {
    databaseOnly: process.argv.includes('--database-only'),
    replica: process.argv.includes('--replica'),
  };

  void identityViolations(process.env, options).then((bad) => {
    if (bad.length > 0) {
      console.error(
        `chief e2e identity (${stage}) REFUSED, these are not this run's containers:\n  - ${bad.join('\n  - ')}`,
      );
      process.exit(1);
    }

    console.log(
      `chief e2e identity (${stage}): Postgres${options.databaseOnly ? '' : ' and Mailpit'} are this run's containers`,
    );
  });
}
