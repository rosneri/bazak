import { routes } from "@/src/server/routes";

export async function POST(
  request: Request,
  context: RouteContext<"/api/conversations/[id]/turns">,
) {
  return routes.send(request, context.params);
}
