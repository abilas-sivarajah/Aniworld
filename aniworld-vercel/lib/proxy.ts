import { ProxyAgent } from "undici";
export * from "./proxy-types";

const proxyAgentCache = new Map<string, ProxyAgent>();

/**
 * Returns an undici ProxyAgent dispatcher if a valid proxyUrl is specified.
 * Server-only helper.
 */
export function getProxyDispatcher(proxyUrl?: string | null, ignoreCert: boolean = false): ProxyAgent | undefined {
  if (!proxyUrl || !proxyUrl.trim()) return undefined;

  const cleanUrl = proxyUrl.trim();
  const cacheKey = `${cleanUrl}_${ignoreCert}`;

  if (proxyAgentCache.has(cacheKey)) {
    return proxyAgentCache.get(cacheKey)!;
  }

  try {
    const agent = new ProxyAgent({
      uri: cleanUrl,
      requestTls: ignoreCert ? { rejectUnauthorized: false } : undefined,
    });
    proxyAgentCache.set(cacheKey, agent);
    return agent;
  } catch (err) {
    console.error(`[Proxy] Failed to initialize ProxyAgent for "${cleanUrl}":`, err);
    return undefined;
  }
}
