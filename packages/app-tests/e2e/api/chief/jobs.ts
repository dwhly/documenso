import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus } from '@documenso/prisma/client';
import { expect } from '@playwright/test';
import { nanoid } from 'nanoid';

// Shared helpers for the chief e2e specs (run through chief/inventory/e2e/run.sh).

export const testEmail = (prefix: string, who: string) => `${prefix}-${who}-${nanoid(8)}@example.test`.toLowerCase();

/** Wait until every background job created since `since` has finished (completed or failed after its retries). */
export const waitForJobsIdle = async (since: Date) => {
  let quiet = 0;

  for (let i = 0; i < 240 && quiet < 4; i++) {
    const busy = await prisma.backgroundJob.count({
      where: {
        submittedAt: { gte: since },
        status: { in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.PROCESSING] },
      },
    });

    quiet = busy === 0 ? quiet + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(quiet, 'background jobs settled').toBeGreaterThanOrEqual(4);
};

/** Poll `check` until it returns true (or fail after `ms`). */
export const until = async (what: string, check: () => Promise<boolean>, ms = 60_000) => {
  const deadline = Date.now() + ms;

  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`timed out waiting for: ${what}`);
};
