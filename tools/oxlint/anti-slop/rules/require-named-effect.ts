import { defineRule, type ESTree, type SourceCode } from "@oxlint/plugins";
import { resolveVariable } from "../shared/scope.ts";

function reactImport(source: SourceCode, identifier: ESTree.IdentifierReference) {
  const binding = resolveVariable(source, identifier)?.defs.find(
    (def) => def.type === "ImportBinding",
  );
  if (binding?.parent?.type === "ImportDeclaration" && binding.parent.source.value === "react")
    return binding.node;
}

function isReactEffect(source: SourceCode, callee: ESTree.CallExpression["callee"]) {
  if (callee.type === "Identifier") {
    const specifier = reactImport(source, callee);
    if (specifier?.type !== "ImportSpecifier") return false;
    const name = specifier.imported;
    return (name.type === "Identifier" ? name.name : name.value) === "useEffect";
  }

  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return false;
  const property = callee.property;
  const isEffect = callee.computed
    ? property.type === "Literal" && property.value === "useEffect"
    : property.type === "Identifier" && property.name === "useEffect";
  if (!isEffect) return false;
  const specifier = reactImport(source, callee.object);
  return (
    specifier?.type === "ImportDefaultSpecifier" || specifier?.type === "ImportNamespaceSpecifier"
  );
}

function delegatesToFunction(expression: ESTree.Node | null | undefined): boolean {
  if (expression?.type === "ChainExpression") return delegatesToFunction(expression.expression);
  if (expression?.type === "UnaryExpression" && expression.operator === "void")
    return delegatesToFunction(expression.argument);
  return (
    expression?.type === "CallExpression" &&
    (expression.callee.type === "Identifier" || expression.callee.type === "MemberExpression")
  );
}

function isNamedOrDelegating(callback: ESTree.Node | undefined): boolean {
  if (!callback) return false;
  if (callback.type === "Identifier" || callback.type === "MemberExpression") return true;
  if (callback.type !== "FunctionExpression" && callback.type !== "ArrowFunctionExpression")
    return false;
  if (callback.type === "FunctionExpression" && callback.id) return true;

  if (callback.body?.type !== "BlockStatement") return delegatesToFunction(callback.body);
  const [statement, ...rest] = callback.body.body;
  if (rest.length || !statement) return false;
  if (statement.type === "ReturnStatement") return delegatesToFunction(statement.argument);
  return statement.type === "ExpressionStatement" && delegatesToFunction(statement.expression);
}

export const requireNamedEffectRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Require React effects to name their work or delegate to one function." },
    messages: {
      nameEffect:
        "Name the effect callback for its purpose, pass a named function, or delegate to one function call.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (
          isReactEffect(context.sourceCode, node.callee) &&
          !isNamedOrDelegating(node.arguments[0])
        )
          context.report({ node: node.arguments[0] ?? node, messageId: "nameEffect" });
      },
    };
  },
});
