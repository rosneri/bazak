-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TurnState" AS ENUM ('running', 'completed', 'failed', 'interrupted');

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "profile" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "caseName" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "intentMatch" BOOLEAN,
    "constraintsSatisfied" BOOLEAN,
    "correctAbstention" BOOLEAN,
    "firstOutputMs" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "detail" TEXT,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingThread" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShoppingThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingTurn" (
    "threadId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "state" "TurnState" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "assistant" JSONB,
    "decision" JSONB,

    CONSTRAINT "ShoppingTurn_pkey" PRIMARY KEY ("threadId","turnId")
);

-- CreateTable
CREATE TABLE "TurnAttempt" (
    "threadId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "cutoff" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "state" "TurnState" NOT NULL,
    "metrics" JSONB,

    CONSTRAINT "TurnAttempt_pkey" PRIMARY KEY ("threadId","turnId","number")
);

-- CreateTable
CREATE TABLE "SearchEvidence" (
    "threadId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchEvidence_pkey" PRIMARY KEY ("threadId","turnId","category")
);

-- CreateIndex
CREATE INDEX "EvaluationResult_recordedAt_id_idx" ON "EvaluationResult"("recordedAt", "id");

-- CreateIndex
CREATE INDEX "EvaluationResult_runId_recordedAt_idx" ON "EvaluationResult"("runId", "recordedAt");

-- CreateIndex
CREATE INDEX "ShoppingThread_scope_updatedAt_id_idx" ON "ShoppingThread"("scope", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingTurn_threadId_ordinal_key" ON "ShoppingTurn"("threadId", "ordinal");

-- CreateIndex
CREATE INDEX "SearchEvidence_category_endedAt_idx" ON "SearchEvidence"("category", "endedAt");

-- AddForeignKey
ALTER TABLE "ShoppingTurn" ADD CONSTRAINT "ShoppingTurn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ShoppingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnAttempt" ADD CONSTRAINT "TurnAttempt_threadId_turnId_fkey" FOREIGN KEY ("threadId", "turnId") REFERENCES "ShoppingTurn"("threadId", "turnId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvidence" ADD CONSTRAINT "SearchEvidence_threadId_turnId_fkey" FOREIGN KEY ("threadId", "turnId") REFERENCES "ShoppingTurn"("threadId", "turnId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-level guard if another process attempts to bypass the repository lock.
CREATE UNIQUE INDEX "ShoppingTurn_one_active_per_thread" ON "ShoppingTurn"("threadId") WHERE state = 'running';
ALTER TABLE "ShoppingTurn" ADD CHECK (ordinal > 0 AND attempt > 0);
ALTER TABLE "TurnAttempt" ADD CHECK (number > 0 AND cutoff > "startedAt");
ALTER TABLE "TurnAttempt" ADD CHECK ((state = 'running') = ("endedAt" IS NULL));
ALTER TABLE "ShoppingTurn" ADD CHECK ((state = 'completed') = (assistant IS NOT NULL));
ALTER TABLE "EvaluationResult" ADD CHECK ("durationMs" >= 0 AND ("firstOutputMs" IS NULL OR "firstOutputMs" BETWEEN 0 AND "durationMs"));
