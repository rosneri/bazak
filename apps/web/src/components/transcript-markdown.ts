import { formatUsage, attemptUsage } from "@bazak/conversation/domain/usage";
import type { ConversationHistory, MessagePart, Turn } from "@bazak/conversation/domain/turn";
import { debugStages } from "./debug-stages";

function evidenceBlock(value: string) {
  const runs = value.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(2, ...runs.map((run) => run.length)) + 1);

  return `${fence}\n${value}\n${fence}`;
}

function partMarkdown(part: MessagePart) {
  if (part.type === "text") return evidenceBlock(part.text);
  const { label, message, products } = part.group;

  const items = products.map((product) =>
    evidenceBlock(
      `${product.title} · $${product.price.toFixed(2)}\n${product.description}\nStock: ${product.stock} · Product ID: ${product.id}${product.imageUrl ? "\nImage: " + product.imageUrl : ""}`,
    ),
  );

  return [evidenceBlock(label + "\n" + message), ...items].join("\n\n");
}

function turnMarkdown(turn: Turn, index: number) {
  const diagnostics = debugStages(turn).map(([label, status, input, output]) =>
    [
      `#### ${label} · ${status}`,
      "**Input**",
      evidenceBlock(input.map(({ name, value }) => name + "\n" + value).join("\n\n")),
      "**Output**",
      evidenceBlock(output),
    ].join("\n\n"),
  );

  return [
    `## Turn ${index + 1}`,
    "### Shopper",
    evidenceBlock(turn.text),
    "### Assistant",
    ...(turn.assistant?.parts.map(partMarkdown) ?? [`Attempt ${turn.state}.`]),
    `### Debug steps · Attempt ${turn.attempt}`,
    formatUsage(attemptUsage(turn.metrics)),
    ...diagnostics,
  ].join("\n\n");
}

export function transcriptMarkdown(history: ConversationHistory) {
  return (
    [
      "# Shopping conversation",
      evidenceBlock(history.conversation.title),
      ...history.turns.map(turnMarkdown),
    ].join("\n\n") + "\n"
  );
}
