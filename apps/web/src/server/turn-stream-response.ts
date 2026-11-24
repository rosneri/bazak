import type { ConversationEvent } from "@bazak/conversation/application/chat";
import type { ConversationTransportLogger } from "./logger.ts";
import { TurnEventSource, type StreamOperation } from "./turn-event-source.ts";

export async function streamTurn(
  logger: ConversationTransportLogger,
  operation: StreamOperation,
  turnId: string,
  request: Request,
  acquire: (signal: AbortSignal) => Promise<AsyncIterable<ConversationEvent>>,
) {
  const readerCancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, readerCancellation.signal]);
  const events = await acquire(signal);

  const source = new TurnEventSource(
    events[Symbol.asyncIterator](),
    operation,
    turnId,
    signal,
    readerCancellation,
    logger,
  );

  const body = new ReadableStream<Uint8Array>(source);

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
