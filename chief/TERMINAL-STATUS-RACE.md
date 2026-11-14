# fleet/terminal-status-race: conditional terminal status transitions (parked)

**Status:** parked work in progress. It is a candidate for an **upstream (Documenso) contribution**. It is NOT merged into
the design branch (`fleet/fds-proto`). The owner decided on 2026-11-15 to revert it there and track the races here as a
separate fix.

## What is on this branch
- Harness (copied from `fleet/fds-proto`): `chief/inventory/e2e/run.sh`, `test.env`, `preflight.cjs`,
  `packages/app-tests/e2e/api/chief/mailpit.ts`, and the Playwright isolation in `packages/app-tests/playwright.config.ts`.
  Together these give a throwaway Postgres, a Mailpit sink, and the built server. The replica phase is skipped because
  its spec is not on this branch.
- The change itself (`fleet/fds-proto` 805a0c9f1, review r4 [12]):
  - `cancel-document.ts`: CANCELLED is written only `WHERE status = PENDING`.
  - `seal-document.handler.ts`: the seal moves only a PENDING envelope, or reseals one already in its final status. A
    superseded seal stores no artifact and sends no webhook or completion email.
  - `reject-document-with-token.ts`: locks the Envelope row `FOR UPDATE` and re-checks PENDING / NOT_SIGNED.
  - `packages/app-tests/e2e/api/chief/terminal-status-race.spec.ts` forces each interleaving against the real database.

Run it with `chief/inventory/e2e/run.sh --phase main e2e/api/chief/terminal-status-race.spec.ts`. You need a built
`apps/remix`, or `CHIEF_E2E_BUILD`.

## Open reviewer items (design review v09 sign r5). Do not merge until all are resolved
1. **r5 [15] MAJOR: distribution can overwrite a terminal status.** `packages/lib/server-only/document/send-document.ts:321`
   (`tx.envelope.update({ status: PENDING })`, unconditional). `/envelope/distribute` reads PENDING with an unsigned
   recipient, then that recipient signs and the seal commits COMPLETED. Distribution resumes and writes PENDING again, so
   a later cancel satisfies the new PENDING predicate. Fix: make the update conditional on the permitted source statuses
   (DRAFT/PENDING) and roll back when no row matches. Add a real-DB interleaving test for distribution against both
   seal and cancel.
2. **r5 [16] MAJOR: CC-only drafts never complete under the seal predicate.** `send-document.ts:202-224` queues the
   seal immediately when every recipient is CC, and returns before its PENDING update. The seal predicate in
   `packages/lib/jobs/definitions/internal/seal-document.handler.ts:300` (`status in [PENDING, final]`) rejects DRAFT
   and returns `superseded`, and no completion email is sent. The sweep only selects PENDING, so it cannot recover the
   envelope. Upstream already covers this scenario in
   `packages/app-tests/e2e/api/v1/document-sending.spec.ts:446` ("should complete document immediately when all
   recipients are CC"). Chief Sign does not serve `/api/v1`, so `fleet/fds-proto` ports that test to the harness as
   `packages/app-tests/e2e/api/chief/cc-only-send.spec.ts`, which sends through `/api/v2/envelope/distribute`. Run
   against this branch (b40ef17f3), it FAILS: the envelope stays `DRAFT`, while the four race tests pass. Copy that spec
   here when you fix this item. Fix: atomically move the draft to PENDING before queueing the immediate seal, and keep
   the seal's terminal-status restrictions.
3. **r5 [17] MINOR: the rejection `FOR UPDATE` lock order can deadlock.**
   `packages/lib/server-only/document/reject-document-with-token.ts:71` locks the Envelope `FOR UPDATE`, then waits on
   the recipient. Meanwhile completion has already updated the recipient (`complete-document-with-token.ts:325`), and
   its audit-log insert (`:387`) needs a KEY SHARE lock on the Envelope through the foreign key. PostgreSQL aborts one of
   the two transactions, and nothing retries it. Fix: use `FOR NO KEY UPDATE`, which is compatible with KEY SHARE, or
   take the envelope lock before any recipient write on both paths. Prove the interleaving against PostgreSQL.
4. **EE: the TSP finalisation still writes COMPLETED unconditionally.**
   `packages/ee/server-only/signing/csc/finalize-tsp-completion.ts:100` (`tx.envelope.update({ status: COMPLETED })`).
   The image excludes EE, so this did not block the design branch. An upstream fix should apply the same predicate
   there.

## Upstream contribution notes
- These races are upstream behaviour, not fleet behaviour. Prepare the upstream PR against documenso/documenso `main`
  without the chief harness: port the forced-interleaving tests to upstream's e2e conventions.
- Keep each transition fix small and reviewable (cancel, seal, reject, distribute, TSP), and add a test for each.
