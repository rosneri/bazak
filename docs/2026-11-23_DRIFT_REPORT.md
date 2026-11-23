# Bazak documentation drift · 23 November 2026

Comparison against the local implementation after correcting the affected contracts. Historical drafts retain the original design. The report covers first-party code-bearing directories and their parents, the assignment, design, reviews and handoff. Test-only, generated, hidden and dependency directories have no separate contract.

## docs/architecture.html

- The archived drawings use the proposed A2UI surface and Vitest and depict a single app. The implementation uses its local v1 product part, Node tests and a separate evaluation app. The current diagram appears above the archived drawings.

## docs/architecture.md

No drift detected.

## docs/concepts_brief.md

- The design-stage analysis describes the starter. The current implementation includes both apps, live and fixture model adapters, bounded discovery, PostgreSQL recovery and persisted evaluations. The analysis is labeled as historical.

## docs/delivery-plan.md

- The plan places SDK integration in the conversation feature. The feature instead owns typed model/planner ports and orchestration. The app owns the SDK so service-free tests and the evaluation runner use the same feature code. [Application service](../packages/features/conversation/src/application/chat.ts) · [SDK adapter](../apps/web/src/server/sdk.ts)
- The planned per-attempt metrics can be unknown after a worker disappears. PostgreSQL preserves the attempt, start and cutoff and records expiry. Only a worker that reaches the terminal write records its call counts and measured first-content time. [Repository](../packages/adapters/evaluation-store/src/conversations.ts)
- The first live production smoke used intent, catalog and reply. A separate live production turn reached the planner with seeded history and saved its clarification with an empty catalog query list. History-informed live retrieval remains unverified. The two labeled live-suite prompts exercise a concrete fragrance request and an off-catalog request. [Measured results](../PROJECT_STATUS.md#verified) · [Suite labels](../packages/features/evaluation/src/domain/cases.ts)
- The schema guarantees at most three groups and ten cards per group. In live use, a friendly clarification for an oversized request depends on the intent model following its instructions. A malformed model decision fails the attempt. The fixture has an explicit clarification branch. [SDK prompt](../apps/web/src/server/sdk.ts) · [Fixture](../apps/web/src/server/fixtures.ts)

- The three-page budget was exercised on synthetic pagination cases. One live turn exercised catalog retrieval. How often the cap misses a better match across real categories remains unmeasured. [Retrieval tests](../packages/features/product-discovery/src/application/discovery.test.ts)

## docs/comprehension_report.md

- The review records the original architecture draft. Its A2UI wording describes the intended component mapping. The running browser uses a local versioned product part. [Rendering](../apps/web/src/components/product-card.tsx)

## docs/delivery-review.md

- The review’s six findings address the earlier plan, and its starter-state description is historical. The remaining gap in history-informed live retrieval is listed under the delivery plan.

## PROJECT_STATUS.md

No drift detected.

## assignment/instructions.md

- The locally verified deliverable is source, a runnable checkout and README. Sending a repository link, inviting collaborators and the author’s final personal review are external submission steps outside this handoff.

## README.md

No drift detected.

## apps/README.md

No drift detected.

## apps/management/README.md

No drift detected.

## apps/management/app/README.md

No drift detected.

## apps/web/README.md

No drift detected.

## apps/web/app/README.md

No drift detected.

## apps/web/app/api/README.md

No drift detected.

## apps/web/app/api/conversations/README.md

No drift detected.

## apps/web/app/api/conversations/[id]/README.md

No drift detected.

## apps/web/app/api/conversations/[id]/turns/README.md

No drift detected.

## apps/web/app/api/conversations/[id]/turns/[turnId]/README.md

No drift detected.

## apps/web/app/api/conversations/[id]/turns/[turnId]/retry/README.md

No drift detected.

## apps/web/app/conversations/README.md

No drift detected.

## apps/web/app/conversations/[id]/README.md

No drift detected.

## apps/web/src/README.md

No drift detected.

## apps/web/src/client/README.md

No drift detected.

## apps/web/src/components/README.md

No drift detected.

## apps/web/src/server/README.md

No drift detected.

## packages/README.md

No drift detected.

## packages/adapters/README.md

No drift detected.

## packages/adapters/dummyjson/README.md

No drift detected.

## packages/adapters/dummyjson/src/README.md

No drift detected.

## packages/adapters/evaluation-store/README.md

No drift detected.

## packages/adapters/evaluation-store/prisma/README.md

No drift detected.

## packages/adapters/evaluation-store/prisma/migrations/20261123000000_shopping/README.md

No drift detected.

## packages/adapters/evaluation-store/prisma/migrations/README.md

No drift detected.

## packages/adapters/evaluation-store/prisma/migrations/20261123010000_search_evidence/README.md

No drift detected.

## packages/adapters/evaluation-store/src/README.md

No drift detected.

## packages/features/README.md

No drift detected.

## packages/features/conversation/README.md

No drift detected.

## packages/features/conversation/src/README.md

No drift detected.

## packages/features/conversation/src/application/README.md

No drift detected.

## packages/features/conversation/src/domain/README.md

No drift detected.

## packages/features/evaluation/README.md

No drift detected.

## packages/features/evaluation/src/README.md

No drift detected.

## packages/features/evaluation/src/application/README.md

No drift detected.

## packages/features/evaluation/src/domain/README.md

No drift detected.

## packages/features/product-discovery/README.md

No drift detected.

## packages/features/product-discovery/src/README.md

No drift detected.

## packages/features/product-discovery/src/application/README.md

No drift detected.

## packages/features/product-discovery/src/domain/README.md

No drift detected.

## packages/libraries/README.md

No drift detected.

## packages/libraries/ui/README.md

No drift detected.

## packages/libraries/ui/src/README.md

No drift detected.

## packages/libraries/ui/src/components/README.md

No drift detected.

## packages/libraries/ui/src/lib/README.md

No drift detected.

## scripts/README.md

No drift detected.

## tools/README.md

No drift detected.

## tools/oxlint/README.md

No drift detected.

## tools/oxlint/anti-slop/README.md

No drift detected.

## tools/oxlint/anti-slop/rules/README.md

No drift detected.

## tools/oxlint/anti-slop/shared/README.md

No drift detected.

## tools/oxlint/anti-slop/vendor/README.md

No drift detected.

## tools/oxlint/anti-slop/vendor/eslint-stylistic/README.md

No drift detected.
