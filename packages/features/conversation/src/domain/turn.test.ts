import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantMessageSchema } from "@bazak/conversation/domain/turn";

test("a saved assistant reply accepts only registered presentation parts", () => {
  assert.ok(
    assistantMessageSchema.safeParse({ parts: [{ type: "text", text: "What is your budget?" }] })
      .success,
  );
  assert.equal(
    assistantMessageSchema.safeParse({ parts: [{ type: "html", html: "A new card type" }] })
      .success,
    false,
  );
});
