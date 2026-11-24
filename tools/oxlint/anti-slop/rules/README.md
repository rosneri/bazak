# Anti-slop lint rules

## Overview

The rule modules analyze JavaScript and TypeScript syntax through Oxlint. The
[plugin entry point](../index.ts) maps their internal exports to the rule IDs below.

## Interface

| Rule ID after `anti-slop/` | Reports |
| --- | --- |
| [`no-array-filter-map`](./no-array-filter-map.ts) | Adjacent filter and map calls on a receiver with local array evidence. |
| [`no-chained-type-assertions`](./no-chained-type-assertions.ts) | Chains of two or more assertions that contain a non-const assertion. |
| [`no-conditional-empty-object-spread`](./no-conditional-empty-object-spread.ts) | An object spread with a ternary branch containing an empty object literal. |
| [`no-known-value-widening`](./no-known-value-widening.ts) | Explicit destinations that discard syntactically established type evidence. |
| [`no-module-mocking`](./no-module-mocking.ts) | Module-mocking calls on the Vitest or Jest object. |
| [`no-object-parameters`](./no-object-parameters.ts) | Parameters typed as the broad `object` type, including through local aliases. |
| [`no-reduce-accumulator-copy`](./no-reduce-accumulator-copy.ts) | Recognized copy operations on an accumulator within a reducer callback. |
| [`no-reflect-apply`](./no-reflect-apply.ts) | Calls to global `Reflect.apply`. |
| [`no-reflect-get`](./no-reflect-get.ts) | Calls to global `Reflect.get`. |
| [`no-runtime-typeof`](./no-runtime-typeof.ts) | Runtime `typeof` checks outside the rule's configured exceptions. |
| [`no-shape-in-symbol-names`](./no-shape-in-symbol-names.ts) | Identifiers containing the case-insensitive substring `shape`, with an exception for borrowed dot-property names. |
| [`no-unknown-parameters`](./no-unknown-parameters.ts) | Parameters annotated with `unknown` or a union containing it, except `cause` and type-predicate subjects. |
| [`no-unknown-returns`](./no-unknown-returns.ts) | Explicit return types that resolve to `unknown`, including through supported aliases, unions, and promise wrappers. |
| [`no-unknown-type-aliases`](./no-unknown-type-aliases.ts) | Type aliases whose resolved type is or contains `unknown` at the top level. |
| [`no-unsafe-dictionary-type`](./no-unsafe-dictionary-type.ts) | Dictionaries whose direct value type is broad, such as `unknown`, `any`, `object`, or an empty object type. |
| [`no-widen-then-assert`](./no-widen-then-assert.ts) | A known value widened in a local `const` binding and later asserted to a narrower type in the same function boundary. |
| [`require-named-effect`](./require-named-effect.ts) | A React useEffect callback with anonymous inline logic. Use a named callback or delegate to one function call. |
| [`require-readable-spacing`](./require-readable-spacing.ts) | Missing structural blank lines. |
| [`require-safety-comment-for-type-assertion`](./require-safety-comment-for-type-assertion.ts) | Non-const assertions without a nearby comment carrying the configured justification marker. |

## Invariants

- Detection uses AST and scope information available to an Oxlint rule. The
  [shared helpers](../shared/README.md) resolve local bindings and aliases.
- `no-runtime-typeof` allows existence probes that compare with `"undefined"`. Its
  `allowInTypeGuards` option defaults to `false`.
- `require-safety-comment-for-type-assertion` defaults to the `SAFETY` marker and requires text
  after the marker and colon.
- `require-readable-spacing` preserves consecutive imports, adjacent overloads, and existing blank
  lines.

## Side Effects

- Rules report diagnostics through Oxlint. `require-readable-spacing` also offers whitespace fixes
  that Oxlint can apply with `--fix`.

## Verification

- Run `pnpm lint` from the workspace root with the configured `anti-slop` rule IDs.
