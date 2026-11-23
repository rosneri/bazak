BEGIN;

-- Rebuild this derived index from saved outcomes. Older rows kept only one group per category
-- and included requests that asked for clarification without looking up a product.
DELETE FROM "SearchEvidence";

INSERT INTO "SearchEvidence" ("threadId", "turnId", category, criteria, "endedAt")
SELECT t."threadId", t."turnId", part.value #>> '{group,criteria,category}',
       jsonb_agg(part.value #> '{group,criteria}' ORDER BY part.position), a."endedAt"
FROM "ShoppingTurn" AS t
JOIN "TurnAttempt" AS a
  ON a."threadId" = t."threadId" AND a."turnId" = t."turnId" AND a.number = t.attempt
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(t.assistant -> 'parts') = 'array' THEN t.assistant -> 'parts' ELSE '[]'::jsonb END
) WITH ORDINALITY AS part(value, position)
WHERE t.state = 'completed' AND a.state = 'completed'
  AND jsonb_typeof(a.metrics -> 'queries') = 'array' AND a.metrics -> 'queries' <> '[]'::jsonb
  AND part.value ->> 'type' = 'products'
  AND part.value #>> '{group,kind}' IN ('matched', 'empty')
  AND part.value #>> '{group,criteria,category}' IS NOT NULL
GROUP BY t."threadId", t."turnId", part.value #>> '{group,criteria,category}', a."endedAt";

COMMIT;
