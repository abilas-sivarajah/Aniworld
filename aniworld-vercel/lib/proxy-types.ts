export interface ProxyRegion {
  id: string;
  name: string;
  flag: string;
  proxyUrl?: string;
}

export const PRESET_PROXY_REGIONS: ProxyRegion[] = [
  { id: "none", name: "Kein Proxy (Direktverbindung)", flag: "🌐" },
  { id: "us", name: "USA (Nordamerika)", flag: "🇺🇸" },
  { id: "nl", name: "Niederlande (Europa)", flag: "🇳🇱" },
  { id: "jp", name: "Japan (Asien)", flag: "🇯🇵" },
  { id: "de", name: "Deutschland", flag: "🇩🇪" },
  { id: "custom", name: "Benutzerdefinierter Proxy / VPN", flag: "⚙️" },
];

/**
 * Resolves a proxy URL string for a given proxy region or custom input.
 */
export function resolveProxyUrl(proxyRegion?: string, customProxyUrl?: string): string | null {
  const region = proxyRegion || (typeof process !== "undefined" ? process.env.PROXY_REGION : undefined) || "none";
  if (region === "none") return null;

  if (region === "custom" || customProxyUrl) {
    const url = customProxyUrl || (typeof process !== "undefined" ? process.env.PROXY_URL : undefined) || "";
    return url.trim() || null;
  }

  if (typeof process !== "undefined") {
    const envVarName = `PROXY_URL_${region.toUpperCase()}`;
    if (process.env[envVarName]) {
      return process.env[envVarName]!;
    }

    if (process.env.PROXY_URL) {
      return process.env.PROXY_URL;
    }
  }

  return null;
}
