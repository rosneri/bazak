import type { DiscoveryCriteria, IntentDecision } from "@bazak/product-discovery/domain/discovery";
import type {
  AssistantMessage,
  AttemptMetrics,
  Conversation,
  ConversationHistory,
  SendTurnInput,
  Turn,
} from "@bazak/conversation/domain/turn";

export type RepositoryCode =
  | "invalid_input"
  | "not_found"
  | "thread_busy"
  | "turn_conflict"
  | "attempt_conflict"
  | "corrupt_thread"
  | "storage_unavailable";

export class RepositoryError extends Error {
  readonly code: RepositoryCode;
  constructor(code: RepositoryCode) {
    super(code);
    this.code = code;
  }
}

export interface HistoryEvidence {
  criteria: DiscoveryCriteria[];
  text: string;
}

export interface Acquisition {
  accepted: boolean;
  turn: Turn;
}

export type Clock = () => Date;

export interface ConversationRepository {
  create(id: string, now: string): Promise<{ created: boolean; conversation: Conversation }>;
  list(): Promise<Conversation[]>;
  load(id: string, now: string): Promise<ConversationHistory>;
  relevantHistory(conversationId: string, category: string): Promise<HistoryEvidence[]>;
  beginTurn(
    conversationId: string,
    input: SendTurnInput,
    now: string,
    cutoff: string,
  ): Promise<Acquisition>;
  beginRetry(
    conversationId: string,
    turnId: string,
    expectedAttempt: number,
    now: string,
    cutoff: string,
  ): Promise<Acquisition>;
  finish(
    conversationId: string,
    turnId: string,
    attempt: number,
    now: string,
    assistant: AssistantMessage,
    metrics: AttemptMetrics,
    decision: IntentDecision,
  ): Promise<void>;
  fail(
    conversationId: string,
    turnId: string,
    attempt: number,
    now: string,
    state: "failed" | "interrupted",
    metrics: AttemptMetrics,
    decision: IntentDecision | null,
  ): Promise<void>;
}
