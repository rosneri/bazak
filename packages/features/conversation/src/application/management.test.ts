import assert from "node:assert/strict";
import { test } from "node:test";
import { createConversationManagement } from "@bazak/conversation/application/management";
import { testRepository } from "#testing/repository";

test("a malformed saved answer gives the shopper a thread-specific recovery error", async () => {
  const { repository, conversation, clock } = testRepository();

  const management = createConversationManagement(
    {
      ...repository,
      async load() {
        return {
          conversation,
          turns: [
            {
              turnId: conversation.id,
              text: "A lamp",
              state: "completed",
              attempt: 1,
              assistant: null,
              metrics: null,
              decision: null,
            },
          ],
        };
      },
    },
    clock,
  );

  assert.equal((await management.list())[0]?.id, conversation.id);
  await assert.rejects(management.load(conversation.id), { code: "corrupt_thread" });
});
