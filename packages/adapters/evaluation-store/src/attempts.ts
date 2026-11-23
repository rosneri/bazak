import { RepositoryError } from "@bazak/conversation/application/repository";
import type { Turn } from "@bazak/conversation/domain/turn";

export function shouldRetry(turn: Pick<Turn, "state" | "attempt">, expected: number) {
  if (expected > turn.attempt) throw new RepositoryError("attempt_conflict");

  return expected === turn.attempt && (turn.state === "failed" || turn.state === "interrupted");
}

export function leaseExpired(cutoff: Date, checkedAt: Date) {
  return cutoff.getTime() <= checkedAt.getTime();
}
