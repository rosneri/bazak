# Oxlint tools

## Overview

The [workspace Oxlint configuration](../../.oxlintrc.json) loads an in-repository JavaScript plugin
when running `pnpm lint`.

## Subdirectories & Boundaries

- [Anti-slop plugin](./anti-slop/README.md) registers the workspace's 19 custom rules.
- [Security plugin](./security/index.mjs) requires Prisma raw SQL calls to use tagged templates. The workspace config also rejects Prisma's unsafe SQL methods, direct HTML sinks and dynamic code evaluation. The pre-push hook runs these checks through `pnpm check`.
