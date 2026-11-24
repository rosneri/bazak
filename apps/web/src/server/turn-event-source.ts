import type { ConversationEvent } from "@bazak/conversation/application/chat";
import {
  turnEventSchema,
  type TurnEvent as DomainTurnEvent,
} from "@bazak/conversation/domain/turn";
import { TurnEvent } from "../api/generated/models.ts";
import type { ConversationTransportLogger } from "./logger.ts";
import { repositoryCode, streamFailures, type StreamFailureCode } from "./http-failures.ts";

export type StreamOperation = "send" | "retry";

type StreamController = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();

function encodeEvent(event: DomainTurnEvent) {
  const payload = TurnEvent.parse(turnEventSchema.parse(event));

  return encoder.encode("data: " + JSON.stringify(payload) + "\n\n");
}

export class TurnEventSource implements UnderlyingDefaultSource<Uint8Array> {
  private open = true;
  private first?: Promise<IteratorResult<ConversationEvent>>;
  private onAbort?: () => void;
  private cleanup?: Promise<void>;

  constructor(
    private readonly iterator: AsyncIterator<ConversationEvent>,
    private readonly operation: StreamOperation,
    private readonly turnId: string,
    private readonly signal: AbortSignal,
    private readonly readerCancellation: AbortController,
    private readonly logger: ConversationTransportLogger,
  ) {}

  start(controller: StreamController) {
    // Start the attempt before immediate cancellation can return its generator.
    this.first = this.readNextEvent();
    void this.first.catch(() => {});
    this.onAbort = () => {
      controller.close();
      void this.release(true);
    };

    this.signal.addEventListener("abort", this.onAbort, { once: true });

    if (this.signal.aborted) this.onAbort();
  }

  private async readNextEvent() {
    return this.iterator.next();
  }

  async pull(controller: StreamController) {
    try {
      const next = await (this.first ?? this.readNextEvent());
      this.first = undefined;

      if (!this.open) return;

      if (next.done) {
        this.stop();
        controller.close();
      } else if (next.value.type === "error") {
        const { code } = next.value;
        await this.endWithError(
          controller,
          Object.hasOwn(streamFailures, code) ? code : "stream_interrupted",
        );
      } else {
        controller.enqueue(encodeEvent(next.value));
      }
    } catch (cause) {
      if (this.open)
        await this.endWithError(controller, repositoryCode(cause) ?? "stream_interrupted");
    }
  }

  cancel() {
    return this.release(true);
  }

  private stop() {
    this.open = false;

    if (this.onAbort) this.signal.removeEventListener("abort", this.onAbort);
  }

  private endWithError(controller: StreamController, code: StreamFailureCode) {
    controller.enqueue(
      encodeEvent({ type: "error", turnId: this.turnId, code, message: streamFailures[code] }),
    );
    controller.close();
    const settled = this.release(false);
    this.logger.error({ operation: this.operation, phase: "stream", code });

    return settled;
  }

  private release(reportFailure: boolean) {
    if (!this.open) return this.cleanup;
    this.stop();

    this.cleanup = Promise.resolve().then(async () => {
      this.readerCancellation.abort();

      try {
        await this.iterator.return?.();
      } catch (cause) {
        if (reportFailure)
          this.logger.error({
            operation: this.operation,
            phase: "cleanup",
            code: repositoryCode(cause) ?? "stream_interrupted",
          });
      }
    });

    return this.cleanup;
  }
}
