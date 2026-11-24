import type { TurnErrorCode } from "@bazak/conversation/application/chat";
import { RepositoryError, type RepositoryCode } from "@bazak/conversation/application/repository";
import type { ApiErrorCode } from "../api/generated/models.ts";

const repositoryFailures = {
  invalid_input: [400, "Check the request and try again."],
  not_found: [404, "This chat or turn could not be found."],
  thread_busy: [409, "Another reply is in progress. Your draft is ready to send once it finishes."],
  turn_conflict: [409, "This message ID already belongs to another message."],
  attempt_conflict: [409, "This attempt changed. Reload the chat to see its status."],
  corrupt_thread: [500, "This chat could not be read. You can still open other chats."],
  storage_unavailable: [503, "Chat storage is unavailable. Reconnect and try again."],
} satisfies Record<RepositoryCode, [number, string]>;

export const httpFailures = {
  ...repositoryFailures,
  forbidden_origin: [403, "Open the shopper from its local address and try again."],
  request_timeout: [408, "The request took too long to send. Try again."],
  payload_too_large: [413, "The request is too large. Shorten the message and try again."],
  unsupported_media_type: [415, "Send the request as uncompressed UTF-8 JSON."],
} satisfies Record<ApiErrorCode, [number, string]>;

export type StreamFailureCode = TurnErrorCode | "stream_interrupted";

const repositoryFailureMessage =
  "This reply could not be saved. Reload the conversation to check its status.";

export const streamFailures = {
  invalid_input: repositoryFailureMessage,
  not_found: repositoryFailureMessage,
  thread_busy: repositoryFailureMessage,
  turn_conflict: repositoryFailureMessage,
  attempt_conflict: repositoryFailureMessage,
  corrupt_thread: repositoryFailureMessage,
  storage_unavailable: repositoryFailureMessage,
  provider_configuration: "Set OPENAI_API_KEY in the server environment, then retry this turn.",
  attempt_failed: "The reply was interrupted. Check the conversation and retry this turn.",
  stream_interrupted: "This reply was interrupted. Reload to check its saved status.",
} satisfies Record<StreamFailureCode, string>;

export function repositoryCode(cause: unknown): RepositoryCode | undefined {
  if (cause instanceof RepositoryError && Object.hasOwn(repositoryFailures, cause.code))
    return cause.code;

  return undefined;
}
