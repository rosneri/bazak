import type { RepositoryCode } from "@bazak/conversation/application/repository";

export type ConversationTransportOperation = "list" | "create" | "load" | "send" | "retry";

export interface ConversationTransportError {
  readonly operation: ConversationTransportOperation;
  readonly phase: "http" | "stream" | "cleanup";
  readonly code:
    | RepositoryCode
    | "provider_configuration"
    | "attempt_failed"
    | "stream_interrupted";
  readonly status?: number;
}

export interface ConversationTransportLogger {
  error(event: ConversationTransportError): void;
}

export const consoleConversationTransportLogger: ConversationTransportLogger = {
  error({ operation, phase, code, status }) {
    console.error("Shopper conversation transport failed", { operation, phase, code, status });
  },
};
