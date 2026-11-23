# ESLint Stylistic padding rule

## Overview

This adapted snapshot supplies the statement-padding engine used by
[`requireReadableSpacingRule`](../../rules/require-readable-spacing.ts). See the
[upstream record](./UPSTREAM.md) for the pinned revision and adaptations, and keep the
[MIT license](./LICENSE) with the source.

## Interface

- [`createPaddingLineRule(options)`](./padding-line-between-statements.ts) builds an Oxlint
  `CreateRule` from caller-supplied [`RuleOptions`](./padding-line-options.d.ts).
- [`padding-line-ast.ts`](./padding-line-ast.ts) provides internal helpers for matching Oxlint
  AST nodes and source tokens.

## Invariants

- The last matching previous/next statement pair determines whether padding is required, prohibited,
  or unrestricted. An unmatched pair leaves padding unrestricted.
- The rule tracks adjacent statements within their scope and accounts for comments when locating
  the whitespace to change.

## Side Effects

- The rule reports padding violations through Oxlint and supplies whitespace-only fixes where
  applicable. Oxlint applies those fixes when run with `--fix`.

## Verification

- Run `pnpm lint` from the workspace root to load the padding engine through the plugin.
