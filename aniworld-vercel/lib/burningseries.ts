import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { getAndValidate, postForm } from "./http";
import {
  addRelativePath,
  matchGroup,
  stripHtmlAndDecode,
  toHoster,
  toInt32,
  toMediaLanguage,
  toRelativePath,
} from "./parse";
import { SeasonNotFoundError, SeriesNotFoundError } from "./serienstream";
import type {
  Hoster,
  Media,
  MediaLanguage,
  SearchResultItem,
  Series,
  VideoDetails,
  VideoStream,
} from "./types";

function nodeText(node: Cheerio<AnyNode>): string {
  return node
    .first()
    .text()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

function nodeAttr(node: Cheerio<AnyNode>, name: string): string | null {
  const v = node.first().attr(name);
  if (v == null) return null;
  return v.replace(/^\/+/, "").replace(/\/+$/, "");
}

function textOrNull(node: Cheerio<AnyNode>): string | null {
  if (node.length === 0) return null;
  return nodeText(node);
}

function collectTexts($: CheerioAPI, selector: string): string[] {
  return $(selector)
    .map((_, el) => nodeText($(el)))
    .get()
    .filter((s) => s.length > 0);
}

export class BurningSeriesClient {
  constructor(
    private readonly hostUrl: string,
    private readonly site: string = "serie",
    private readonly ignoreCertificateValidation: boolean = false,
    private readonly useProxy: boolean = false,
    private readonly proxyRegion: string = "none",
    private readonly proxyUrl: string = "",
  ) {}

  private get requestOptions() {
    return {
      ignoreCertificateValidation: this.ignoreCertificateValidation,
      useProxy: this.useProxy,
      proxyRegion: this.proxyRegion,
      proxyUrl: this.proxyUrl,
    };
  }

  private async getRoot(path: string): Promise<{ $: CheerioAPI; html: string }> {
    const url = addRelativePath(this.hostUrl, path);
    const html = await getAndValidate(url, this.requestOptions);
    return { $: cheerio.load(html), html };
  }

  async getSeries(title: string): Promise<Series> {
    const cleanTitle = toRelativePath(title);
    const path = `serie/${cleanTitle}`;

    let $: CheerioAPI;
    try {
      const res = await this.getRoot(path);
      $ = res.$;
    } catch (err) {
      throw new SeriesNotFoundError(title);
    }

    if ($('title').text().includes("404") || $('#sp_left').length === 0 && $('.series-details').length === 0) {
      // Fallback check if title exists on main page
      if ($('body').text().includes("404 Not Found") || $('body').text().includes("nicht gefunden")) {
        throw new SeriesNotFoundError(title);
      }
    }

    const titleName =
      textOrNull($('#sp_left h2')) ??
      textOrNull($('.series-header h1')) ??
      textOrNull($('h1')) ??
      title;

    const description =
      textOrNull($('#sp_left p.description')) ??
      textOrNull($('#sp_left div.description')) ??
      textOrNull($('#sp_left p')) ??
      textOrNull($('.series-description')) ??
      "";

    let bannerUrl =
      nodeAttr($('#sp_right img'), "src") ??
      nodeAttr($('.series-cover img'), "src") ??
      nodeAttr($('.cover img'), "src") ??
      "";
    if (bannerUrl) bannerUrl = addRelativePath(this.hostUrl, bannerUrl);

    const yearStart =
      toInt32(matchGroup($('#sp_left').text(), /(\d{4})/, 1)) || 0;

    const genres = collectTexts($, '#sp_left .genre a, .series-genres a, a[href*="/genre/"]');
    const directors = collectTexts($, '#sp_left .director a');
    const actors = collectTexts($, '#sp_left .actors a');

    // Count seasons in nav
    let seasonsCount = 0;
    let hasMovies = false;

    $('#sp_left ul.pages li a, nav.season-nav a, ul.seasons li a').each((_, el) => {
      const txt = $(el).text().trim();
      if (/^\d+$/.test(txt)) {
        const num = parseInt(txt, 10);
        if (num > seasonsCount) seasonsCount = num;
      } else if (txt.toLowerCase().includes("film") || txt.toLowerCase().includes("movie")) {
        hasMovies = true;
      }
    });

    if (seasonsCount === 0) seasonsCount = 1;

    return {
      title: titleName,
      description,
      bannerUrl,
      yearStart,
      yearEnd: null,
      directors,
      actors,
      creators: [],
      countriesOfOrigin: [],
      genres,
      ageRating: 0,
      ratingsCount: 0,
      imdbUrl: null,
      trailerUrl: null,
      hasMovies,
      seasonsCount,
    };
  }

  async getEpisodes(title: string, season: number): Promise<Media[]> {
    const cleanTitle = toRelativePath(title);
    const path = `serie/${cleanTitle}/${season}`;

    let $: CheerioAPI;
    try {
      const res = await this.getRoot(path);
      $ = res.$;
    } catch {
      throw new SeasonNotFoundError(title, season);
    }

    const episodes: Media[] = [];

    $('table.episodes tbody tr, ul.episodes-list li, table.series-episodes tr').each((idx, el) => {
      const $tr = $(el);
      const link = nodeAttr($tr.find('a[href*="/serie/"]'), "href") || "";
      if (!link) return;

      const numText =
        nodeText($tr.find('td').first()) ||
        matchGroup(link, /\/(\d+)$/, 1) ||
        String(idx + 1);

      const number = toInt32(numText) || idx + 1;
      const germanTitle = nodeText($tr.find('a span, td strong, a').first()) || `Episode ${number}`;
      const origTitle = nodeText($tr.find('td small, span.english-title')) || "";

      // Parse available hoster icons or labels if listed in table
      const hosters: Hoster[] = [];
      $tr.find('i[class*="hoster"], span[class*="hoster"], img[alt]').each((_, hEl) => {
        const hName = $(hEl).attr('alt') || $(hEl).attr('title') || $(hEl).attr('class') || "";
        const parsedHoster = toHoster(hName);
        if (parsedHoster !== "Unknown" && !hosters.includes(parsedHoster)) {
          hosters.push(parsedHoster);
        }
      });
      if (hosters.length === 0) {
        hosters.push("VOE", "Vidoza");
      }

      episodes.push({
        number,
        title: germanTitle,
        originalTitle: origTitle,
        hosters,
        languages: [{ audio: "German", subtitle: null }],
      });
    });

    return episodes;
  }

  getMovieEpisodes(title: string): Promise<Media[]> {
    return this.getEpisodes(title, 0);
  }

  getMovies(title: string): Promise<Media[]> {
    return this.getEpisodes(title, 0);
  }

  async getEpisodeVideoInfo(
    title: string,
    number: number,
    season: number,
  ): Promise<VideoDetails> {
    const cleanTitle = toRelativePath(title);
    const path = `serie/${cleanTitle}/${season}/${number}`;

    let $: CheerioAPI;
    try {
      const res = await this.getRoot(path);
      $ = res.$;
    } catch {
      throw new SeasonNotFoundError(title, season);
    }

    const epTitleName =
      textOrNull($('#sp_left h2 small')) ??
      textOrNull($('h2')) ??
      `Episode ${number}`;

    const description =
      textOrNull($('#sp_left p.description')) ??
      textOrNull($('#sp_left p')) ??
      "";

    const streams: VideoStream[] = [];

    // Parse hosters tabs/links
    $('ul.hoster-tabs li a, ul.hosters li a, div.hosters a').each((_, el) => {
      const $a = $(el);
      const hosterNameRaw = $a.text().trim() || nodeAttr($a, "title") || "";
      const href = nodeAttr($a, "href");

      if (!href) return;

      const hoster = toHoster(hosterNameRaw);
      const fullUrl = addRelativePath(this.hostUrl, href);

      streams.push({
        videoUrl: fullUrl,
        hoster: hoster !== "Unknown" ? hoster : "VOE",
        language: { audio: "German", subtitle: null },
      });
    });

    return {
      number,
      season: season === 0 ? null : season,
      title: epTitleName,
      originalTitle: "",
      description,
      streams,
    };
  }

  getMovieVideoInfo(title: string, number: number): Promise<VideoDetails> {
    return this.getEpisodeVideoInfo(title, number, 0);
  }

  async search(keyword: string): Promise<SearchResultItem[]> {
    if (!keyword.trim()) return [];

    try {
      // Fetch series directory
      const { $ } = await this.getRoot("andere-serien");
      const results: SearchResultItem[] = [];
      const lower = keyword.toLowerCase().trim();

      $('#sp_left ul li a, table.series-list a, div.series-list a').each((_, el) => {
        const $a = $(el);
        const name = $a.text().trim();
        const href = nodeAttr($a, "href") || "";

        if (name.toLowerCase().includes(lower) && href.includes("/serie/")) {
          results.push({
            title: name,
            description: "Burning Series",
            link: href,
          });
        }
      });

      return results.slice(0, 15);
    } catch {
      return [];
    }
  }
}
