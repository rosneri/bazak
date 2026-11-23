import { routes } from "@/src/server/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/conversations/[id]">) {
  return routes.load(request, context.params);
}
