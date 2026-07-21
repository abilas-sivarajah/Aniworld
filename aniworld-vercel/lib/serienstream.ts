// Port of SerienStreamAPI/Client/SerienStreamClient.cs using cheerio instead of
// HtmlAgilityPack. XPath selectors were translated to cheerio/CSS equivalents.
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
import type {
  Hoster,
  Media,
  MediaLanguage,
  SearchResultItem,
  Series,
  VideoDetails,
  VideoStream,
} from "./types";

export class SeriesNotFoundError extends Error {
  constructor(title: string) {
    super(`Series '${title}' not found.`);
    this.name = "SeriesNotFoundError";
  }
}

export class SeasonNotFoundError extends Error {
  constructor(title: string, season: number) {
    super(`Season ${season} for '${title}' not found.`);
    this.name = "SeasonNotFoundError";
  }
}

/** Trimmed inner text (mirrors Extensions.GetInnerText: Trim('/') then whitespace). */
function nodeText(node: Cheerio<AnyNode>): string {
  return node
    .first()
    .text()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

/** Attribute value trimmed of surrounding slashes (mirrors Extensions.GetAttributeValue). */
function nodeAttr(node: Cheerio<AnyNode>, name: string): string | null {
  const v = node.first().attr(name);
  if (v == null) return null;
  return v.replace(/^\/+/, "").replace(/\/+$/, "");
}

function textOrNull(node: Cheerio<AnyNode>): string | null {
  if (node.length === 0) return null;
  return nodeText(node);
}

/** Collects trimmed inner texts of every match. */
function collectTexts($: CheerioAPI, selector: string): string[] {
  return $(selector)
    .map((_, el) => nodeText($(el)))
    .get()
    .filter((s) => s.length > 0);
}

export class SerienStreamClient {
  constructor(
    private readonly hostUrl: string,
    private readonly site: string,
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
    const { $ } = await this.getRoot(`${this.site}/${toRelativePath(title)}`);

    if ($('[class*="messageAlert danger"]').length > 0) {
      throw new SeriesNotFoundError(title);
    }

    const titleName =
      textOrNull($('div[class*="series-title"] h1 span')) ??
      textOrNull($('div[class*="series-title"] h1')) ??
      textOrNull($('div[class*="row"] h1')) ??
      title;

    const description =
      nodeAttr($('p[class*="seri_des"]'), "data-full-description") ??
      textOrNull($('p[class*="seri_des"]')) ??
      textOrNull(
        $('div[class*="series-description"] span.description-text'),
      ) ??
      "";

    let bannerUrl =
      matchGroup(
        nodeAttr($('div[class*="backdrop"]'), "style") ?? "",
        /url\((.*?)\)/,
        1,
      ) ||
      nodeAttr($('div[class*="seriesCoverBox"] img'), "data-src") ||
      nodeAttr(
        $('div[class*="col-12"][class*="col-md-9"] picture img'),
        "data-src",
      ) ||
      "";
    if (bannerUrl) bannerUrl = addRelativePath(this.hostUrl, bannerUrl);

    const yearStart =
      toInt32(textOrNull($('span[itemprop="startDate"] a'))) ||
      toInt32(textOrNull($('p[class*="text-muted"] > a').first())) ||
      0;

    const endYearStr =
      textOrNull($('span[itemprop="endDate"] a')) ??
      textOrNull($('p[class*="text-muted"] > span').first()) ??
      "";
    const yearEnd =
      !endYearStr || endYearStr === "NA" || endYearStr === "Heute"
        ? null
        : Number.isNaN(parseInt(endYearStr, 10))
          ? null
          : parseInt(endYearStr, 10);

    const ageRating =
      toInt32(nodeAttr($("div[data-fsk]"), "data-fsk")) ||
      toInt32(
        matchGroup(
          $('p:contains("FSK")').first().text(),
          /FSK (\d+)/,
          1,
        ),
      ) ||
      0;

    const ratingsCount =
      toInt32(textOrNull($('span[itemprop="ratingCount"]'))) ||
      toInt32(
        matchGroup(
          $('span:contains("Bewertungen")').first().text(),
          /([\d.,]+) Bewertungen/,
          1,
        ),
      ) ||
      0;

    const imdbUrl = nodeAttr($('a[href*="imdb.com"]'), "href");
    const trailerUrl = nodeAttr($('a[class*="trailerButton"]'), "href");

    const hasMovies = this.anyNavLinkEquals($, "Filme");

    let seasonsCount = this.countFirstNavLinks($, (t) => t !== "Filme");
    if (seasonsCount === 0) {
      seasonsCount = $("nav#season-nav ul li a")
        .filter((_, a) => $(a).text().trim() !== "Filme")
        .length;
    }

    let directors = collectTexts($, 'li[class*="seriesDirector"] a');
    if (directors.length === 0) {
      directors = this.collectByStrongLabel($, ["Regisseur"]);
    }
    const actors = this.collectByStrongLabel($, ["Schauspieler", "Besetzung"]);
    const creators = this.collectByStrongLabel($, ["Produzent"]);
    const countriesOfOrigin = this.collectByStrongLabel($, ["Land"]);
    const genres = collectTexts($, 'div[class*="genres"] a');

    return {
      title: titleName,
      description,
      bannerUrl,
      yearStart,
      yearEnd,
      directors,
      actors,
      creators,
      countriesOfOrigin,
      genres,
      ageRating,
      ratingsCount,
      imdbUrl,
      trailerUrl,
      hasMovies,
      seasonsCount,
    };
  }

  private anyNavLinkEquals($: CheerioAPI, label: string): boolean {
    const inDirectNav =
      $('div[class*="hosterSiteDirectNav"] ul li a').filter(
        (_, a) => $(a).text().trim() === label,
      ).length > 0;
    const inSeasonNav =
      $("nav#season-nav ul li a").filter(
        (_, a) => $(a).text().trim() === label,
      ).length > 0;
    return inDirectNav || inSeasonNav;
  }

  private countFirstNavLinks(
    $: CheerioAPI,
    predicate: (text: string) => boolean,
  ): number {
    const firstUl = $('div[class*="hosterSiteDirectNav"] ul').first();
    return firstUl
      .children("li")
      .children("a")
      .filter((_, a) => predicate($(a).text().trim()))
      .length;
  }

  private collectByStrongLabel($: CheerioAPI, labels: string[]): string[] {
    const result: string[] = [];
    $("li").each((_, li) => {
      const $li = $(li);
      const strongText = $li.children("strong").first().text();
      if (labels.some((label) => strongText.includes(label))) {
        $li.find("a").each((__, a) => {
          const t = nodeText($(a));
          if (t) result.push(t);
        });
      }
    });
    return result;
  }

  async getEpisodes(title: string, season: number): Promise<Media[]> {
    const path =
      season === 0
        ? `${this.site}/${toRelativePath(title)}/filme`
        : `${this.site}/${toRelativePath(title)}/staffel-${season}`;

    const { $, html } = await this.getRoot(path);

    if (!html.trim()) {
      if (season === 0) return [];
      throw new SeasonNotFoundError(title, season);
    }
    if ($('[class*="messageAlert danger"]').length > 0) {
      throw new SeriesNotFoundError(title);
    }

    // Modern table format (seasonEpisodesList)
    const modernRows: Media[] = [];
    $('table[class*="seasonEpisodesList"] tbody tr').each((_, tr) => {
      const $tr = $(tr);

      const number =
        toInt32(
          $tr.find('meta[itemprop="episodeNumber"]').first().attr("content"),
        ) ||
        toInt32(
          matchGroup(
            $tr.find('td[class*="EpisodeID"]').first().text(),
            /\d+/,
            0,
          ),
        ) ||
        1;

      const epTitle =
        textOrNull($tr.find('td[class*="seasonEpisodeTitle"] strong')) ??
        textOrNull($tr.find('td[class*="seasonEpisodeTitle"] a')) ??
        `Episode ${number}`;

      const originalTitle =
        textOrNull($tr.find('td[class*="seasonEpisodeTitle"] span')) ?? "";

      let hosters: Hoster[] = $tr
        .find('i[class*="icon"]')
        .map((__, i) => toHoster($(i).attr("title") ?? ""))
        .get();
      if (hosters.length === 0) {
        hosters = $tr
          .find('i[class*="icon"]')
          .map((__, i) => toHoster($(i).attr("class") ?? ""))
          .get();
      }

      const languages: MediaLanguage[] = $tr
        .find('td[class*="editFunctions"] img')
        .map((__, img) => toMediaLanguage($(img).attr("src") ?? ""))
        .get();

      modernRows.push({ number, title: epTitle, originalTitle, hosters, languages });
    });

    if (modernRows.length > 0) return modernRows;

    // Legacy format fallback
    const legacyRows: Media[] = [];
    $(
      'section[class*="episode-section"] tbody tr[class*="episode-row"]',
    ).each((_, tr) => {
      const $tr = $(tr);
      legacyRows.push({
        number: toInt32(nodeText($tr.find('th[class*="episode-number-cell"]'))),
        title: nodeText($tr.find('td[class*="episode-title-cell"] strong')),
        originalTitle: nodeText(
          $tr.find('td[class*="episode-title-cell"] span'),
        ),
        hosters: $tr
          .find('td[class*="episode-watch-cell"] img')
          .map((__, img) => toHoster($(img).attr("alt") ?? ""))
          .get(),
        languages: $tr
          .find('td[class*="episode-language-cell"] svg use')
          .map((__, use) => toMediaLanguage($(use).attr("href") ?? ""))
          .get(),
      });
    });
    return legacyRows;
  }

  getMovies(title: string): Promise<Media[]> {
    return this.getEpisodes(title, 0);
  }

  async getEpisodeVideoInfo(
    title: string,
    number: number,
    season: number,
  ): Promise<VideoDetails> {
    const path =
      season === 0
        ? `${this.site}/${toRelativePath(title)}/filme/film-${number}`
        : `${this.site}/${toRelativePath(title)}/staffel-${season}/episode-${number}`;

    const { $ } = await this.getRoot(path);

    const epTitleName =
      textOrNull(
        $(
          'div[class*="hosterSiteTitle"] h2 span[class*="episodeGermanTitle"]',
        ),
      ) ??
      textOrNull($('div[class*="hosterSiteTitle"] h2')) ??
      textOrNull($("article > h2.h4.mb-1")) ??
      textOrNull($("h2")) ??
      `Episode ${number}`;

    const originalTitle =
      textOrNull(
        $(
          'div[class*="hosterSiteTitle"] h2 small[class*="episodeEnglishTitle"]',
        ),
      ) ?? "";

    const description =
      textOrNull($('p[class*="descriptionSpoiler"]')) ??
      textOrNull($('div[id^="desc-"] > div')) ??
      textOrNull($("p.vdoDesc")) ??
      "";

    let streamNodes = $('ul li[data-link-target*="/redirect/"]');
    if (streamNodes.length === 0) {
      streamNodes = $('li[data-link-target*="/redirect/"]');
    }
    if (streamNodes.length === 0) {
      streamNodes = $('div#episode-links button[class*="link-box"]');
    }

    const streams: VideoStream[] = [];
    streamNodes.each((_, node) => {
      const $node = $(node);

      const link =
        $node.attr("data-link-target") ??
        $node.attr("data-play-url") ??
        $node.find("a").first().attr("href") ??
        "";
      if (!link.trim()) return;

      let hosterStr =
        $node.attr("data-provider-name") ??
        textOrNull($node.find("h4")) ??
        $node.find('i[class*="icon"]').first().attr("title") ??
        "";
      if (hosterStr.startsWith("Hoster ")) {
        hosterStr = hosterStr.slice("Hoster ".length);
      }

      const langKey = $node.attr("data-lang-key") ?? "";
      let language: MediaLanguage;
      switch (langKey) {
        case "1":
          language = { audio: "German", subtitle: null };
          break;
        case "2":
          language = { audio: "English", subtitle: null };
          break;
        case "3":
          language = { audio: "Japanese", subtitle: "German" };
          break;
        default: {
          const useHref = $node.find("use").first().attr("href");
          const imgSrc = $node.find("img").first().attr("src");
          language = useHref
            ? toMediaLanguage(useHref)
            : imgSrc
              ? toMediaLanguage(imgSrc)
              : { audio: "Unknown", subtitle: null };
        }
      }

      streams.push({
        videoUrl: addRelativePath(this.hostUrl, link),
        hoster: toHoster(hosterStr),
        language,
      });
    });

    return {
      number,
      season: season === 0 ? null : season,
      title: epTitleName,
      originalTitle,
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
      const response = await postForm(
        addRelativePath(this.hostUrl, "ajax/search"),
        { keyword },
        this.requestOptions,
      );
      if (!response.ok) return [];

      const jsonStr = await response.text();
      if (!jsonStr.trim()) return [];

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) return [];

      const results: SearchResultItem[] = [];
      for (const el of parsed) {
        const item = el as Record<string, unknown>;
        const link = typeof item.link === "string" ? item.link : "";
        if (!link.trim()) continue;
        if (
          link.includes("/support/") ||
          link.includes("/episode-") ||
          link.includes("/film-")
        ) {
          continue;
        }

        const title = stripHtmlAndDecode(
          typeof item.title === "string" ? item.title : "",
        );
        let desc = stripHtmlAndDecode(
          typeof item.description === "string" ? item.description : "",
        );
        if (desc === "Keine Beschreibung verfügbar.") desc = "";

        if (title) results.push({ title, description: desc, link });
      }
      return results;
    } catch {
      return [];
    }
  }
}
