# Anti-slop Oxlint plugin

## Overview

The workspace loads a snapshot of the generic anti-slop rules through Oxlint's ESLint compatibility
interface. See the [upstream record](./UPSTREAM.md) and [MIT license](./LICENSE).

## Interface

- [`index.ts`](./index.ts) default-exports `antiSlopPlugin`, built with `eslintCompatPlugin` from
  `@oxlint/plugins`.
- [Rules](./rules/README.md) lists the 19 rule IDs and their enforcement boundaries.
- [Shared helpers](./shared/README.md) interpret AST, source, and scope data for the rules.
- [Vendored lint code](./vendor/README.md) implements the statement-padding engine.

## Invariants

- The [workspace Oxlint configuration](../../../.oxlintrc.json) registers the entry point as
  `anti-slop` and enables all 19 registered rules at error severity.
- The workspace's Oxlint and [Oxfmt](../../../.oxfmtrc.json) configurations exclude the plugin
  source tree from their respective scans.

## Side Effects

- The plugin emits lint diagnostics and offers whitespace fixes through `require-readable-spacing`.

## Verification

- Run `pnpm lint` from the workspace root to load the plugin and lint the workspace.
