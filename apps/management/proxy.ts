import { NextResponse, type NextRequest } from "next/server";
import {
  documentPolicy,
  documentRequestHeaders,
  secureDocument,
} from "@bazak/shared/browser-security";
import { getLoopbackOrigin } from "@bazak/shared/loopback-origin";

export function proxy(request: NextRequest) {
  const origin = getLoopbackOrigin(request.headers, process.env.PORT ?? "3002");

  if (!origin) return new Response("Forbidden", { status: 403 });

  const policy = documentPolicy(origin, process.env.NODE_ENV === "development");
  const headers = documentRequestHeaders(request, policy);

  return secureDocument(NextResponse.next({ request: { headers } }), policy);
}

export const config = {
  matcher: ["/((?!_next/static/|favicon\\.ico$).*)"],
};
