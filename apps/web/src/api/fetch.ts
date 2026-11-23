import type { ZodType } from "zod";
import { ApiErrorResponse } from "./generated/models";

export type ErrorType<_T> = Error;

export class RequestProblem extends Error {
  constructor(
    readonly code: ApiErrorResponse["error"]["code"],
    message: string,
  ) {
    super(message);
  }
}

async function request(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...options, cache: "no-store" });

  if (!response.ok) {
    const problem = ApiErrorResponse.safeParse(await response.json().catch(() => null));

    if (problem.success) {
      const { code, message } = problem.data.error;
      throw new RequestProblem(code, message);
    }

    options.signal?.throwIfAborted();
    throw new Error("The server could not be reached.");
  }

  return response;
}

export function streamFetch<_T>(url: string, options: RequestInit): Promise<Response> {
  return request(url, options);
}

export async function jsonFetch<T>(
  url: string,
  { schema, ...options }: RequestInit & { schema?: ZodType<T> },
): Promise<T> {
  if (!schema) throw new Error("The request is missing its response validator.");
  const response = await request(url, options);

  return schema.parse(await response.json());
}
