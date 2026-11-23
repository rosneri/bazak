import assert from "node:assert/strict";
import { test } from "node:test";
import { RepositoryError } from "@bazak/conversation/application/repository";
import { leaseExpired, shouldRetry } from "./attempts.ts";

test("a retry can reacquire precisely the failed or interrupted generation the shopper saw", () => {
  assert.equal(shouldRetry({ state: "failed", attempt: 1 }, 1), true);
  assert.equal(shouldRetry({ state: "interrupted", attempt: 2 }, 2), true);
  assert.equal(shouldRetry({ state: "completed", attempt: 2 }, 2), false);
  assert.equal(shouldRetry({ state: "running", attempt: 2 }, 2), false);
  assert.equal(shouldRetry({ state: "failed", attempt: 2 }, 1), false);
  assert.throws(
    () => shouldRetry({ state: "failed", attempt: 2 }, 3),
    (error) => error instanceof RepositoryError && error.code === "attempt_conflict",
  );
});

test("an attempt held to the exact lease boundary has expired", () => {
  const cutoff = new Date(90_000);
  assert.equal(leaseExpired(cutoff, new Date(89_999)), false);
  assert.equal(leaseExpired(cutoff, cutoff), true);
  assert.equal(leaseExpired(cutoff, new Date(90_001)), true);
});
