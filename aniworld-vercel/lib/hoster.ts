// Port of the stream-url extraction methods from
// SerienStreamAPI/Client/DownloadClient.cs. The FFmpeg download path is
// intentionally omitted — the web app only ever extracts the direct stream url
// and plays it in the browser, so no server-side binary is required.
import * as cheerio from "cheerio";
import { getAndValidate } from "./http";
import {
  base64ToUtf8,
  matchGroup,
  replaceJunk,
  reverseString,
  shiftBack,
  shiftLetters,
} from "./parse";

export class UrlExtractionError extends Error {
  constructor(videoUrl: string) {
    super(`Failed to extract stream url from: ${videoUrl}`);
    this.name = "UrlExtractionError";
  }
}

const VOE_REDIRECT_RE = /window\.location\.href\s*=\s*'([^']*)'/;
const VOE_B64_RE = /var a168c='([^']+)'/;
const VOE_HLS_RE = /'hls': '([^']+)'/;
const STREAMTAPE_NOROBOT_RE =
  /document\.getElementById\('norobotlink'\)\.innerHTML = (.+);/;
const STREAMTAPE_TOKEN_RE = /token=([^&']+)/;
const DOODSTREAM_PASS_MD5_RE = /\/pass_md5\/([^/]+\/[^']+)/;

const RANDOM_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length = 10): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return result;
}

export async function getVoeStreamUrl(
  videoUrl: string,
  ignoreCert: boolean,
): Promise<string> {
  let webContent = await getAndValidate(videoUrl, {
    ignoreCertificateValidation: ignoreCert,
  });

  // Follow the JS redirect if present.
  const redirectMatch = webContent.match(VOE_REDIRECT_RE);
  if (redirectMatch) {
    videoUrl = redirectMatch[1];
    webContent = await getAndValidate(videoUrl, {
      ignoreCertificateValidation: ignoreCert,
    });
  }

  const $ = cheerio.load(webContent);
  const scriptNode = $('script[type="application/json"]').first();
  if (scriptNode.length > 0) {
    let encoded = scriptNode.text().trim();
    if (encoded.length > 4) encoded = encoded.slice(2, encoded.length - 2);

    let decoded = shiftLetters(encoded);
    decoded = replaceJunk(decoded).split("_").join("");
    decoded = base64ToUtf8(decoded);
    decoded = shiftBack(decoded, 3);
    decoded = base64ToUtf8(reverseString(decoded));

    try {
      const source = JSON.parse(decoded)?.source;
      if (typeof source === "string" && source) return source;
    } catch {
      /* fall through to fallbacks */
    }
  }

  // Fallback 1: a168c base64 blob (reversed JSON).
  const b64Match = webContent.match(VOE_B64_RE);
  if (b64Match) {
    try {
      const reversed = reverseString(base64ToUtf8(b64Match[1]));
      const fileUrl = JSON.parse(reversed)?.source;
      if (typeof fileUrl === "string" && fileUrl) return fileUrl;
    } catch {
      /* fall through */
    }
  }

  // Fallback 2: inline 'hls' base64 url.
  const hlsMatch = webContent.match(VOE_HLS_RE);
  if (hlsMatch) {
    return base64ToUtf8(hlsMatch[1]);
  }

  throw new UrlExtractionError(videoUrl);
}

export async function getStreamtapeStreamUrl(
  videoUrl: string,
  ignoreCert: boolean,
): Promise<string> {
  if (!videoUrl.includes("/e/")) {
    const html = await getAndValidate(videoUrl, {
      ignoreCertificateValidation: ignoreCert,
    });
    const $ = cheerio.load(html);
    const ogUrl = $('meta[name="og:url"]').first().attr("content");
    if (!ogUrl) throw new UrlExtractionError(videoUrl);
    videoUrl = ogUrl;
  }

  const html = await getAndValidate(videoUrl.replace("/e/", "/v/"), {
    ignoreCertificateValidation: ignoreCert,
  });
  const $ = cheerio.load(html);

  const norobot = matchGroup($.html(), STREAMTAPE_NOROBOT_RE, 1);
  if (!norobot) throw new UrlExtractionError(videoUrl);

  const token = matchGroup(norobot, STREAMTAPE_TOKEN_RE, 1);
  if (!token) throw new UrlExtractionError(videoUrl);

  const host = $('div#ideoooolink[style="display:none;"]').first().text().trim();
  return `https://${host}&token=${token}&dl=1s`;
}

export async function getDoodstreamStreamUrl(
  videoUrl: string,
  ignoreCert: boolean,
): Promise<string> {
  const html = await getAndValidate(videoUrl, {
    ignoreCertificateValidation: ignoreCert,
  });
  const $ = cheerio.load(html);

  const js = $('script:contains("/pass_md5/")').first().text();
  const passMd5 = matchGroup(js, DOODSTREAM_PASS_MD5_RE, 1);
  if (!passMd5) throw new UrlExtractionError(videoUrl);

  const streamUrl = await getAndValidate(
    `https://dood.li/pass_md5/${passMd5}`,
    { ignoreCertificateValidation: ignoreCert, headers: { Referer: videoUrl } },
  );
  const expiry = Date.now();
  return `${streamUrl}${randomString(10)}?token=${passMd5}&expiry=${expiry}`;
}

export async function getVidozaStreamUrl(
  videoUrl: string,
  ignoreCert: boolean,
): Promise<string> {
  const html = await getAndValidate(videoUrl, {
    ignoreCertificateValidation: ignoreCert,
  });
  const $ = cheerio.load(html);
  const src = $("video#player source").first().attr("src");
  if (!src) throw new UrlExtractionError(videoUrl);
  return src;
}

export async function extractStreamUrl(
  hoster: string,
  videoUrl: string,
  ignoreCert: boolean,
): Promise<string> {
  switch (hoster.toLowerCase()) {
    case "voe":
      return getVoeStreamUrl(videoUrl, ignoreCert);
    case "streamtape":
      return getStreamtapeStreamUrl(videoUrl, ignoreCert);
    case "doodstream":
      return getDoodstreamStreamUrl(videoUrl, ignoreCert);
    case "vidoza":
      return getVidozaStreamUrl(videoUrl, ignoreCert);
    default:
      throw new Error(
        `Hoster '${hoster}' stream url extraction is not directly supported.`,
      );
  }
}
