import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";

const rawQueryNames = new Set(["$queryRaw", "$executeRaw"]);

const taggedSql = defineRule({
  meta: {
    type: "problem",
    messages: {
      taggedSql: "Use a Prisma model operation or invoke this SQL method as a tagged template.",
    },
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        const method = node.computed ? node.property.value : node.property.name;

        if (!rawQueryNames.has(method)) return;

        if (node.parent?.type === "TaggedTemplateExpression" && node.parent.tag === node) return;

        context.report({ node, messageId: "taggedSql" });
      },
      Property(node) {
        if (node.parent?.type !== "ObjectPattern") return;
        const key = node.key.type === "Literal" ? node.key.value : node.key.name;

        if (rawQueryNames.has(key)) context.report({ node, messageId: "taggedSql" });
      },
    };
  },
});

export default eslintCompatPlugin({
  meta: { name: "security" },
  rules: { "tagged-sql": taggedSql },
});
