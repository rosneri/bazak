import { z } from "zod";
import {
  conversationSchema,
  conversationHistorySchema,
  idSchema,
} from "@bazak/conversation/domain/turn";
import {
  RepositoryError,
  type ConversationRepository,
  type Clock,
} from "@bazak/conversation/application/repository";

const conversationList = z
  .array(conversationSchema)
  .describe("Conversations in descending order of last activity.");

export function createConversationManagement(repository: ConversationRepository, clock: Clock) {
  return {
    async create(id: string) {
      const result = await repository.create(idSchema.parse(id), clock().toISOString());

      return {
        created: result.created,
        conversation: conversationSchema.parse(result.conversation),
      };
    },
    async list() {
      return conversationList.parse(await repository.list());
    },
    async load(id: string) {
      const saved = await repository.load(idSchema.parse(id), clock().toISOString());
      const parsed = conversationHistorySchema.safeParse(saved);

      if (!parsed.success) throw new RepositoryError("corrupt_thread");

      return parsed.data;
    },
  };
}
