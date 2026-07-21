// String / parsing helpers — port of SerienStreamAPI/Internal/Extensions.cs.
import type { Hoster, Language, MediaLanguage } from "./types";

const RELATIVE_PATH_REPLACEMENTS = new Set<string>([
  ":", ",", "(", ")", "~", ".", "&", "'", "+", "!", "ü", "ä", "ö",
]);

/** Converts a title into the URL slug used by s.to / aniworld.to. */
export function toRelativePath(text: string): string {
  let result = "";
  let lastWasDash = false;

  for (const c of text.toLowerCase()) {
    if (RELATIVE_PATH_REPLACEMENTS.has(c)) {
      continue;
    } else if (c === " ") {
      if (!lastWasDash) {
        result += "-";
        lastWasDash = true;
      }
      continue;
    } else if (c === "ß") {
      result += "ss";
      lastWasDash = false;
      continue;
    }
    result += c;
    lastWasDash = false;
  }
  return result;
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Joins a base url and a relative path, trimming surrounding slashes. */
export function addRelativePath(baseUrl: string, relativePath: string): string {
  return `${trimSlashes(baseUrl)}/${trimSlashes(relativePath)}`;
}

/** Parses an integer, tolerating thousands separators; returns defaultValue on failure. */
export function toInt32(text: string | null | undefined, defaultValue = 0): number {
  if (text == null) return defaultValue;
  const cleaned = text.replace(/[.,\s]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return defaultValue;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

export function toHoster(text: string): Hoster {
  switch (text.trim().toLowerCase()) {
    case "voe":
      return "VOE";
    case "doodstream":
      return "Doodstream";
    case "vidoza":
      return "Vidoza";
    case "streamtape":
      return "Streamtape";
    default:
      return "Unknown";
  }
}

export function toLanguage(text: string): Language {
  switch (text.trim().toLowerCase()) {
    case "german":
      return "German";
    case "english":
      return "English";
    case "japanese":
      return "Japanese";
    default:
      return "Unknown";
  }
}

export function toMediaLanguage(raw: string): MediaLanguage {
  let text = raw.trim();
  let language: string;

  if (text.startsWith("#icon-flag-")) {
    language = text.slice("#icon-flag-".length);
  } else if (text.includes("/flags/")) {
    const idx = text.lastIndexOf("/flags/");
    language = text.slice(idx + "/flags/".length);
    if (language.endsWith(".svg")) language = language.slice(0, -".svg".length);
  } else if (text.endsWith(".svg")) {
    const idx = text.lastIndexOf("/");
    language =
      idx >= 0
        ? text.slice(idx + 1, text.length - ".svg".length)
        : text.slice(0, -".svg".length);
  } else {
    return { audio: "Unknown", subtitle: null };
  }

  const parts = language.split("-").filter((p) => p.length > 0);
  if (parts.length === 1) return { audio: toLanguage(parts[0]), subtitle: null };
  if (parts.length === 2)
    return { audio: toLanguage(parts[0]), subtitle: toLanguage(parts[1]) };
  return { audio: "Unknown", subtitle: null };
}

/** Returns the requested capture group of the first regex match, or "". */
export function matchGroup(text: string, pattern: RegExp, group: number): string {
  if (!text) return "";
  const m = text.match(pattern);
  return m && m[group] != null ? m[group].trim() : "";
}

// --- VOE deobfuscation helpers ---

/** ROT13 over ASCII letters. */
export function shiftLetters(input: string): string {
  let out = "";
  for (const c of input) {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += String.fromCharCode(((code - 65 + 13) % 26) + 65);
    } else if (code >= 97 && code <= 122) {
      out += String.fromCharCode(((code - 97 + 13) % 26) + 97);
    } else {
      out += c;
    }
  }
  return out;
}

const JUNK_PARTS = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];

export function replaceJunk(input: string): string {
  let result = input;
  for (const junk of JUNK_PARTS) {
    result = result.split(junk).join("_");
  }
  return result;
}

/** Shifts every char code down by `shift`. */
export function shiftBack(input: string, shift: number): string {
  let out = "";
  for (const c of input) {
    out += String.fromCharCode(c.charCodeAt(0) - shift);
  }
  return out;
}

export function reverseString(s: string): string {
  return s.split("").reverse().join("");
}

export function base64ToUtf8(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

// --- HTML text cleanup (search result sanitising) ---

export function stripHtmlAndDecode(input: string | null | undefined): string {
  if (!input) return "";
  const withoutTags = input.replace(/<[^>]*>/g, "");
  return decodeHtmlEntities(withoutTags).trim();
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}
