import { z } from "zod";

export const DEFAULT_CHAT_PROVIDER = "openai";

export const chatMessageSchema = z
  .strictObject({
    role: z
      .enum(["user", "assistant"])
      .describe("Who spoke this entry in the conversation.")
      .meta({ title: "Chat message role" }),
    text: z
      .string()
      .regex(/\S/)
      .describe("The non-blank message text as it appeared in the conversation.")
      .meta({ title: "Chat message text" }),
  })
  .describe("A text entry in a shopping conversation.")
  .meta({ title: "Chat message" });

export type ChatMessage = z.infer<typeof chatMessageSchema>;
