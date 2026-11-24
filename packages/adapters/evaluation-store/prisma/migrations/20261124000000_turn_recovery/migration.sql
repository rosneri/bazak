ALTER TABLE "ShoppingTurn" ADD COLUMN "recoveryPending" BOOLEAN NOT NULL DEFAULT false;

-- Earlier versions recorded lease expiry with endedAt exactly equal to cutoff.
UPDATE "ShoppingTurn" t SET "recoveryPending" = true
FROM "TurnAttempt" a
WHERE (a."threadId", a."turnId", a.number) = (t."threadId", t."turnId", t.attempt)
  AND t.state = 'interrupted' AND a.state = 'interrupted'
  AND a."endedAt" = a.cutoff AND t.attempt < 3;

CREATE INDEX "ShoppingTurn_recoveryPending_threadId_ordinal_idx"
ON "ShoppingTurn" ("recoveryPending", "threadId", ordinal);
CREATE INDEX "TurnAttempt_state_cutoff_idx" ON "TurnAttempt" (state, cutoff);
