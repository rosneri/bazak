import { randomUUID } from "node:crypto";
import type { ConversationRepository } from "@bazak/conversation/application/repository";
import type { Turn } from "@bazak/conversation/domain/turn";

export function testRepository() {
  const now = "2026-11-23T12:00:00.000Z";
  const conversation = { id: randomUUID(), title: "New chat", createdAt: now, updatedAt: now };
  const turns: Turn[] = [];

  const get = (id: string) => {
    const turn = turns.find((t) => t.turnId === id);

    if (!turn) throw new Error("Missing fixture turn.");

    return turn;
  };

  const repository: ConversationRepository = {
    async create() {
      return { created: true, conversation };
    },
    async list() {
      return [conversation];
    },
    async load() {
      return { conversation, turns };
    },
    async relevantHistory() {
      return [];
    },
    async beginTurn(_id, input) {
      const previous = turns.find((t) => t.turnId === input.turnId);

      if (previous) return { accepted: false, turn: previous };

      const turn: Turn = {
        ...input,
        state: "running",
        attempt: 1,
        assistant: null,
        metrics: null,
        decision: null,
      };

      turns.push(turn);

      return { accepted: true, turn };
    },
    async beginRetry(_id, turnId, expected) {
      const turn = get(turnId);

      if (turn.attempt !== expected || (turn.state !== "failed" && turn.state !== "interrupted"))
        return { accepted: false, turn };
      turn.attempt++;
      turn.state = "running";

      return { accepted: true, turn };
    },
    async finish(_id, turnId, _attempt, _time, assistant, metrics, decision) {
      Object.assign(get(turnId), { state: "completed", assistant, metrics, decision });
    },
    async fail(_id, turnId, _attempt, _time, state, metrics, decision) {
      Object.assign(get(turnId), { state, metrics, decision });
    },
  };

  return { repository, conversation, turns, clock: () => new Date(now) };
}
