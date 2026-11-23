import { routes } from "@/src/server/routes";

export async function POST(
  request: Request,
  context: RouteContext<"/api/conversations/[id]/turns">,
) {
  return routes.send((await context.params).id, request);
}
