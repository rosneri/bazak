import { routes } from "@/src/server/routes";

export async function POST(
  request: Request,
  context: RouteContext<"/api/conversations/[id]/turns/[turnId]/retry">,
) {
  const { id, turnId } = await context.params;

  return routes.retry(id, turnId, request);
}
