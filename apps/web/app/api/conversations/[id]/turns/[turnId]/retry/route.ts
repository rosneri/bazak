import { routes } from "@/src/server/routes";

export async function POST(
  request: Request,
  context: RouteContext<"/api/conversations/[id]/turns/[turnId]/retry">,
) {
  return routes.retry(request, context.params);
}
