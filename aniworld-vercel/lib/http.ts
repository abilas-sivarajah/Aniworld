// HTTP helper — port of SerienStreamAPI/Internal/RequestHelper.cs.
// Uses the runtime's fetch (undici under the hood). When certificate validation
// should be ignored, requests are dispatched through an insecure undici Agent.
import { Agent } from "undici";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let insecureAgent: Agent | null = null;
function getInsecureAgent(): Agent {
  if (!insecureAgent) {
    insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
  }
  return insecureAgent;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  ignoreCertificateValidation?: boolean;
}

function buildInit(
  init: RequestInit,
  options: RequestOptions | undefined,
): RequestInit {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    ...(options?.headers ?? {}),
  };
  const finalInit: RequestInit & { dispatcher?: Agent } = {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string>) },
  };
  if (options?.ignoreCertificateValidation) {
    finalInit.dispatcher = getInsecureAgent();
  }
  return finalInit as RequestInit;
}

/**
 * Sends a GET request and returns the response body as text, validating the
 * status code (mirrors RequestHelper.GetAndValidateAsync).
 */
export async function getAndValidate(
  url: string,
  options?: RequestOptions,
): Promise<string> {
  const res = await fetch(url, buildInit({ method: "GET" }, options));
  const text = await res.text();
  if (!res.ok) {
    throw new HttpRequestError(
      `HTTP request failed. StatusCode: ${res.status}.`,
      res.status,
    );
  }
  return text;
}

/** Sends a POST request with url-encoded form data (mirrors RequestHelper.PostFormAsync). */
export async function postForm(
  url: string,
  formData: Record<string, string>,
  options?: RequestOptions,
): Promise<Response> {
  const body = new URLSearchParams(formData).toString();
  return fetch(
    url,
    buildInit(
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
      options,
    ),
  );
}

export class HttpRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
  }
}
