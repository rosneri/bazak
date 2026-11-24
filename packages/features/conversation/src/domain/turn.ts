import { callUsageSchema } from "@bazak/conversation/domain/usage";
import { z } from "zod";
import {
  discoveryCriteriaSchema,
  intentDecisionSchema,
} from "@bazak/product-discovery/domain/discovery";
import { productSnapshotSchema } from "@bazak/product-discovery/domain/product";
import { catalogQuerySchema } from "@bazak/product-discovery/application/catalog";
import { chatMessageSchema } from "@bazak/conversation/domain/chat";

export const idSchema = z.uuid().describe("Stable client-generated UUID.");

const timestamp = z.iso.datetime().describe("UTC timestamp.");

export const conversationSchema = z
  .strictObject({
    id: idSchema,
    title: z.string().min(1).describe("Title shown in conversation history."),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .describe("A shopper conversation.");

export const groupSchema = z
  .strictObject({
    kind: z
      .enum(["matched", "empty", "lookup-error", "clarify", "off-catalog"])
      .describe("Observed outcome of this group."),
    label: z.string().min(1).describe("Short name of the requested group."),
    criteria: discoveryCriteriaSchema
      .nullable()
      .describe("Explicit search constraints, if applicable."),
    products: z
      .array(productSnapshotSchema)
      .max(10)
      .describe("Verified visible snapshots in display order."),
    coverage: z
      .enum(["partial", "exhaustive"])
      .nullable()
      .describe("Whether all available pages were stably observed, if applicable."),
    message: z.string().min(1).describe("Shopper-facing explanation of this result."),
  })
  .refine(
    (group) => (group.kind === "matched") === group.products.length > 0,
    "Only matched groups contain product cards.",
  )
  .refine(
    (group) => (group.kind === "matched" || group.kind === "empty") === (group.coverage !== null),
    "Successful lookups must report their observed coverage.",
  )
  .describe("An ordered, labeled catalog result or guidance.");

const textPartSchema = z
  .strictObject({
    type: z.literal("text").describe("Plain assistant text."),
    text: chatMessageSchema.shape.text,
  })
  .describe("A saved text passage.");

export const productPartSchema = z
  .strictObject({
    type: z.literal("products").describe("Registered catalog presentation."),
    version: z.literal(1).describe("Catalog presentation version."),
    group: groupSchema,
  })
  .describe("A versioned product group.");

export const assistantMessageSchema = z
  .strictObject({
    parts: z
      .array(
        z
          .discriminatedUnion("type", [textPartSchema, productPartSchema])
          .describe("A supported presentation part."),
      )
      .min(1)
      .describe("Committed assistant parts in emission order."),
  })
  .describe("A durable assistant reply.");

export const stateSchema = z
  .enum(["running", "completed", "failed", "interrupted"])
  .describe("State of the latest turn attempt.");

const count = z.int().nonnegative().describe("Measured nonnegative count.");

export const attemptMetricsSchema = z
  .strictObject({
    usage: z
      .array(callUsageSchema)
      .optional()
      .describe("Usage reported for this attempt by model operation."),
    stepInputs: z
      .array(
        z
          .strictObject({
            stage: z
              .enum(["intent", "decision", "planner", "catalog"])
              .describe("Operation that received the input."),
            name: z.string().describe("Name of the input at the operation boundary."),
            value: z.string().describe("JSON snapshot captured when the operation was invoked."),
          })
          .describe("One observed operation input."),
      )
      .optional()
      .describe("Ordered inputs captured during this attempt, when instrumented."),
    providerUrls: z
      .array(z.httpUrl().describe("Exact URL passed to the catalog GET request."))
      .max(18)
      .optional()
      .describe("Catalog HTTP GET attempts in dispatch order, when recorded."),
    modelProposal: z
      .string()
      .max(8192)
      .optional()
      .describe("Serialized validated intent proposal before application routing, when recorded."),
    intentCalls: count.max(1).describe("Number of intent calls started."),
    plannerCalls: count.max(1).describe("Number of batched planner calls started."),
    catalogCalls: count
      .max(9)
      .describe("Number of catalog requests started, including failed requests."),
    queries: z.array(catalogQuerySchema).describe("Actual page queries attempted in order."),
    planner: z
      .array(
        z
          .enum(["skipped", "used", "clarification", "fallback"])
          .describe("Planning disposition for one group."),
      )
      .describe("Disposition in group order."),
    firstVisibleMs: count
      .nullable()
      .describe("Elapsed milliseconds until the first shopper content, or null."),
    durationMs: count.describe("Total elapsed milliseconds."),
  })
  .refine(
    (metrics) => metrics.queries.length <= metrics.catalogCalls,
    "A page query must count as a catalog call.",
  )
  .refine(
    (metrics) => metrics.firstVisibleMs === null || metrics.firstVisibleMs <= metrics.durationMs,
    "Content cannot first appear after the attempt ends.",
  )
  .describe("Actual operations and timings for this attempt.");

// Older persisted observations include a retired model stage. Normalize on read
// so saved transcripts and evaluation imports remain usable without rewriting them.
const retiredStage = z
  .object({
    stage: z.literal("reply").describe("Historical operation identifier."),
  })
  .describe("An observation for a retired operation.");

const legacyMetricsSchema = z
  .looseObject({
    replyCalls: count.max(1).describe("Historical operation count."),
    usage: z
      .array(z.union([callUsageSchema, retiredStage]).describe("Historical call observation."))
      .optional()
      .describe("Model usage recorded by an earlier version."),
    stepInputs: z
      .array(
        z
          .union([attemptMetricsSchema.shape.stepInputs.unwrap().element, retiredStage])
          .describe("Historical operation input."),
      )
      .optional()
      .describe("Inputs recorded by an earlier version."),
  })
  .transform(({ replyCalls: _retired, usage, stepInputs, ...current }) => ({
    ...current,
    ...(usage && { usage: usage.filter((entry) => entry.stage !== "reply") }),
    ...(stepInputs && { stepInputs: stepInputs.filter((entry) => entry.stage !== "reply") }),
  }))
  .pipe(attemptMetricsSchema)
  .describe("Older observations projected onto current operations.");

export const storedMetricsSchema = z
  .union([attemptMetricsSchema, legacyMetricsSchema])
  .describe("Persisted attempt observations expressed in the current metrics format.");

const attempt = z.int().positive().describe("One-based attempt generation.");

export const sendTurnInputSchema = z
  .strictObject({
    turnId: idSchema,
    text: chatMessageSchema.shape.text
      .max(4000)
      .describe("Original shopper text, up to 4000 characters."),
  })
  .describe("A new or repeated turn submission.");

export const retryTurnInputSchema = z
  .strictObject({ expectedAttempt: attempt })
  .describe("Retry the generation the shopper saw.");

export const turnSchema = z
  .strictObject({
    turnId: idSchema,
    text: sendTurnInputSchema.shape.text,
    state: stateSchema,
    attempt,
    assistant: assistantMessageSchema.nullable().describe("Committed answer when complete."),
    decision: intentDecisionSchema.nullable().describe("Validated decision if available."),
    metrics: storedMetricsSchema.nullable().describe("Latest recorded observations."),
  })
  .refine(
    (t) => (t.state === "completed") === (t.assistant !== null),
    "Only completed turns have a committed reply.",
  )
  .describe("Saved shopper turn and current attempt.");

export const conversationHistorySchema = z
  .strictObject({
    conversation: conversationSchema,
    turns: z.array(turnSchema).describe("Turns in ascending ordinal order."),
  })
  .describe("One conversation and its ordered history.");

export const turnEventSchema = z
  .discriminatedUnion("type", [
    z
      .strictObject({
        type: z.literal("status").describe("Current attempt status."),
        turnId: idSchema,
        state: stateSchema,
        attempt,
      })
      .describe("Turn status event."),
    z
      .strictObject({
        type: z.literal("text-delta").describe("A visible text fragment."),
        turnId: idSchema,
        text: chatMessageSchema.shape.text,
      })
      .describe("A shopper-facing text fragment."),
    z
      .strictObject({
        type: z.literal("lookup").describe("A product lookup has started."),
        turnId: idSchema,
        label: groupSchema.shape.label,
      })
      .describe("A transient placeholder for the next result group."),
    z
      .strictObject({
        type: z.literal("products").describe("A verified group is available."),
        turnId: idSchema,
        part: productPartSchema,
      })
      .describe("A preview of the catalog part."),
    z
      .strictObject({
        type: z.literal("done").describe("The reply was committed."),
        turnId: idSchema,
        assistant: assistantMessageSchema,
      })
      .describe("The saved reply or its replay."),
    z
      .strictObject({
        type: z.literal("error").describe("This attempt did not finish."),
        turnId: idSchema,
        code: z.string().min(1).describe("Machine-readable error category."),
        message: z.string().min(1).describe("Safe actionable explanation."),
      })
      .describe("Recoverable attempt failure."),
  ])
  .describe("A shopping conversation stream event.");

export type TurnEvent = z.infer<typeof turnEventSchema>;

export type Turn = z.infer<typeof turnSchema>;

export type Conversation = z.infer<typeof conversationSchema>;

export type ConversationHistory = z.infer<typeof conversationHistorySchema>;

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export type MessagePart = AssistantMessage["parts"][number];

export type ResultGroup = z.infer<typeof groupSchema>;

export type AttemptMetrics = z.infer<typeof attemptMetricsSchema>;

export type SendTurnInput = z.infer<typeof sendTurnInputSchema>;
