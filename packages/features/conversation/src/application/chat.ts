import { z } from "zod";
import { chatMessageSchema } from "@bazak/conversation/domain/chat";

export const sendTurnInputSchema = z
  .strictObject({
    turnId: z
      .uuid()
      .describe("A stable client-generated ID reused when resubmitting the same message."),
    text: chatMessageSchema.shape.text,
  })
  .describe("The inputs for submitting a new user turn to a conversation.");
