import { routes } from "@/src/server/routes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/conversations/[id]">) {
  return routes.load((await context.params).id);
}
