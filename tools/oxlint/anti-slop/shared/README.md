# Anti-slop rule helpers

## Overview

These internal helpers give the [rule definitions](../rules/README.md) a common way to interpret
Oxlint's AST, source text, and scope information.

## Interface

| Module | Exports used by the rules and helpers |
| --- | --- |
| [`array-method.ts`](./array-method.ts) | `arrayMethodTarget`, `isKnownArrayExpression`, `resolveArrayBinding`, and `unwrapArrayExpression` |
| [`dictionary-types.ts`](./dictionary-types.ts) | `createTypeEnvironment`, `classifyUnsafeDictionary`, `classifyUnsafeDictionaryValue`, `classifyWideningTarget`, and `isKnownEvidenceExpression` |
| [`function-parameters.ts`](./function-parameters.ts) | `containsUnknownType`, `functionParameterBindingName`, and `functionParameterTypeAnnotation` |
| [`lexical-type-parameters.ts`](./lexical-type-parameters.ts) | `lexicalTypeParameterNames` collects binders that can shadow aliases. |
| [`reflect-method.ts`](./reflect-method.ts) | `isGlobalReflectMethodCall` matches a named method on global `Reflect`. |
| [`scope.ts`](./scope.ts) | `resolveVariable` walks enclosing scopes to find an identifier's binding. |
| [`type-alias-resolution.ts`](./type-alias-resolution.ts) | `createTypeAliasEnvironment`, `visibleTypeAlias`, `hasVisibleTypeBinding`, and `resolvedTypeMatches` |

## Invariants

- Array detection requires local syntactic evidence such as an array literal, a recognized
  annotation, or an unchanged binding with a matching initializer.
- Alias lookup respects lexical shadowing and resolves generic arguments or defaults when
  available. Recursive alias resolution tracks declarations already visited.

## Side Effects

- `createTypeAliasEnvironment` caches environments in a `WeakMap` keyed by the AST program.
- `isKnownArrayExpression` records visited bindings in the supplied or default set.

## Verification

- Run `pnpm lint` from the workspace root to exercise the helpers through their rules.
