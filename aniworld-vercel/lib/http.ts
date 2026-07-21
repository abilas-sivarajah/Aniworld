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

/**
 * Follows redirects and returns the final URL (e.g. resolving an s.to/aniworld
 * "/redirect/xxx" link to the actual hoster embed page). Only the final URL is
 * used — the response body is discarded — so this does not bind any stream token
 * to the server's IP; the browser re-loads the embed itself.
 */
export async function resolveFinalUrl(
  url: string,
  options?: RequestOptions,
): Promise<string> {
  const res = await fetch(url, buildInit({ method: "GET", redirect: "follow" }, options));
  // Drain the body so the connection can be reused/closed cleanly.
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
  }
  return res.url || url;
}

export class HttpRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
  }
}
