import { NextResponse, type NextRequest } from "next/server";
import { catalogThumbnailOrigin } from "@bazak/dummyjson/thumbnail";
import {
  documentPolicy,
  documentRequestHeaders,
  secureDocument,
} from "@bazak/shared/browser-security";
import { getLoopbackOrigin } from "@bazak/shared/loopback-origin";

export function proxy(request: NextRequest) {
  const origin = getLoopbackOrigin(request.headers, process.env.PORT ?? "3000");

  if (!origin) return new Response("Forbidden", { status: 403 });

  const policy = documentPolicy(
    origin,
    process.env.NODE_ENV === "development",
    catalogThumbnailOrigin,
  );

  const headers = documentRequestHeaders(request, policy);

  return secureDocument(NextResponse.next({ request: { headers } }), policy);
}

// Route handlers check the Host. Skipping Proxy there lets them enforce their own streaming body limit.
export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static/|favicon\\.ico$).*)"],
};
