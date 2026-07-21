using HtmlAgilityPack;
using Microsoft.Extensions.Logging;
using SerienStreamAPI.Enums;
using SerienStreamAPI.Exceptions;
using SerienStreamAPI.Internal;
using SerienStreamAPI.Models;

namespace SerienStreamAPI.Client;

public class SerienStreamClient
{
    readonly string hostUrl;
    readonly string site;
    readonly ILogger<SerienStreamClient>? logger;

    readonly RequestHelper requestHelper;

    public SerienStreamClient(
        string hostUrl,
        string site,
        bool ignoreCertificiateValidation = false,
        ILogger<SerienStreamClient>? logger = null)
    {
        this.hostUrl = hostUrl;
        this.site = site;
        this.logger = logger;

        this.requestHelper = new(ignoreCertificiateValidation, logger);

        logger?.LogInformation("[SerienStreamClient-.ctor] SerienStreamClient has been inizialized.");
    }


    async Task<HtmlNode> GetHtmlRootAsync(
        string path,
        CancellationToken cancellationToken = default)
    {
        logger?.LogInformation("[SerienStreamClient-GetHtmlRootAsync] Getting HTML document: {path}...", path);
        string webContent = await requestHelper.GetAndValidateAsync(hostUrl, path, null, cancellationToken);

        HtmlDocument document = new();
        document.LoadHtml(webContent);

        return document.DocumentNode;
    }


    public async Task<Series> GetSeriesAsync(
        string title,
        CancellationToken cancellationToken = default)
    {
        // Get HTML document
        HtmlNode root = await GetHtmlRootAsync($"{site}/{title.ToRelativePath()}", cancellationToken);

        if (root.Any("//div[contains(@class, 'messageAlert danger')]"))
            throw new SeriesNotFoundException(title);

        // Parse HTML document into series info
        logger?.LogInformation("[SerienStreamClient-GetSeriesAsync] Parsing HTML document into series info: {title}...", title);

        string titleName = root.SelectSingleNodeTextOrDefault("//div[contains(@class,'series-title')]//h1//span")
            ?? root.SelectSingleNodeTextOrDefault("//div[contains(@class,'series-title')]//h1")
            ?? root.SelectSingleNodeTextOrDefault("//div[contains(@class,'row')]//h1")
            ?? title;

        string description = root.SelectSingleNodeAttributeOrDefault("//p[contains(@class,'seri_des')]", "data-full-description")
            ?? root.SelectSingleNodeTextOrDefault("//p[contains(@class,'seri_des')]")
            ?? root.SelectSingleNodeTextOrDefault("//div[contains(@class,'series-description')]//span[@class='description-text']")
            ?? "";

        string bannerUrl = root.SelectSingleNodeAttributeOrDefault("//div[contains(@class,'backdrop')]", "style")?.Match(@"url\((.*?)\)", 1)
            ?? root.SelectSingleNodeAttributeOrDefault("//div[contains(@class,'seriesCoverBox')]//img", "data-src")
            ?? root.SelectSingleNodeAttributeOrDefault("//div[contains(@class,'col-12') and contains(@class,'col-md-9')]//picture//img", "data-src")
            ?? "";

        if (!string.IsNullOrEmpty(bannerUrl)) bannerUrl = hostUrl.AddRelativePath(bannerUrl);

        int yearStart = root.SelectSingleNodeTextOrDefault("//span[@itemprop='startDate']//a")?.ToInt32()
            ?? root.SelectSingleNodeTextOrDefault("//p[contains(@class,'text-muted')]/a[1]")?.ToInt32()
            ?? 0;

        string endYearStr = root.SelectSingleNodeTextOrDefault("//span[@itemprop='endDate']//a")
            ?? root.SelectSingleNodeTextOrDefault("//p[contains(@class,'text-muted')]/span[1]")
            ?? "";
        int? yearEnd = (string.IsNullOrWhiteSpace(endYearStr) || endYearStr == "NA" || endYearStr == "Heute") ? null : (int.TryParse(endYearStr, out int y) ? y : null);

        int ageRating = root.SelectSingleNodeAttributeOrDefault("//div[@data-fsk]", "data-fsk")?.ToInt32()
            ?? root.SelectSingleNodeTextOrDefault("//p[contains(.,'FSK')]")?.Match(@"FSK (\d+)", 1).ToInt32()
            ?? 0;

        int ratingsCount = root.SelectSingleNodeTextOrDefault("//span[@itemprop='ratingCount']")?.ToInt32()
            ?? root.SelectSingleNodeTextOrDefault("//span[contains(text(),'Bewertungen')]")?.Match(@"([\d|\.|\,]+) Bewertungen", 1).ToInt32()
            ?? 0;

        string? imdbUrl = root.SelectSingleNodeAttributeOrDefault("//a[contains(@href,'imdb.com')]", "href");
        string? trailerUrl = root.SelectSingleNodeAttributeOrDefault("//a[contains(@class,'trailerButton')]", "href");

        bool hasMovies = root.Any("//div[contains(@class,'hosterSiteDirectNav')]//ul/li/a[normalize-space(text())='Filme']")
            || root.Any("//nav[@id='season-nav']//ul/li/a[normalize-space(text())='Filme']");

        int seasonsCount = root.Select("//div[contains(@class,'hosterSiteDirectNav')]//ul[1]/li/a[normalize-space(text()) != 'Filme']", n => n).Length;
        if (seasonsCount == 0)
        {
            seasonsCount = root.Select("//nav[@id='season-nav']//ul/li/a[normalize-space(text()) != 'Filme']", n => n).Length;
        }

        string[] directors = root.Select("//li[contains(@class,'seriesDirector')]//a", Extensions.GetInnerText);
        if (directors.Length == 0) directors = root.Select("//li[strong[contains(text(),'Regisseur')]]//a", Extensions.GetInnerText);

        string[] actors = root.Select("//li[strong[contains(text(),'Schauspieler') or contains(text(),'Besetzung')]]//a", Extensions.GetInnerText);
        string[] creators = root.Select("//li[strong[contains(text(),'Produzent')]]//a", Extensions.GetInnerText);
        string[] countriesOfOrigin = root.Select("//li[strong[contains(text(),'Land')]]//a", Extensions.GetInnerText);
        string[] genres = root.Select("//div[contains(@class,'genres')]//a", Extensions.GetInnerText);

        return new Series(
            title: titleName,
            description: description,
            bannerUrl: bannerUrl,
            yearStart: yearStart,
            yearEnd: yearEnd,
            directors: directors,
            actors: actors,
            creators: creators,
            countriesOfOrigin: countriesOfOrigin,
            genres: genres,
            ageRating: ageRating,
            ratingsCount: ratingsCount,
            imdbUrl: imdbUrl,
            trailerUrl: trailerUrl,
            hasMovies: hasMovies,
            seasonsCount: seasonsCount);
    }


    public async Task<Media[]> GetEpisodesAsync(
        string title,
        int season,
        CancellationToken cancellationToken = default)
    {
        // Get HTML doucment
        string path = season == 0
            ? $"{site}/{title.ToRelativePath()}/filme"
            : $"{site}/{title.ToRelativePath()}/staffel-{season}";

        HtmlNode root = await GetHtmlRootAsync(path, cancellationToken);

        if (root.ChildNodes.Count == 0)
            return season == 0 ? [] : throw new SeasonNotFoundException(title, season);
        if (root.Any("//div[contains(@class, 'messageAlert danger')]"))
            throw new SeriesNotFoundException(title);

        logger?.LogInformation("[SerienStreamClient-GetEpisodesAsync] Parsing HTML document into media info list: {title}, {season}...", title, season);

        // Try modern table format (seasonEpisodesList)
        var modernRows = root.Select("//table[contains(@class,'seasonEpisodesList')]//tbody//tr", node =>
        {
            int number = node.SelectSingleNodeAttributeOrDefault(".//meta[@itemprop='episodeNumber']", "content")?.ToInt32()
                ?? node.SelectSingleNodeTextOrDefault(".//td[contains(@class,'EpisodeID')]")?.Match(@"\d+", 0).ToInt32()
                ?? 1;

            string epTitle = node.SelectSingleNodeTextOrDefault(".//td[contains(@class,'seasonEpisodeTitle')]//strong")
                ?? node.SelectSingleNodeTextOrDefault(".//td[contains(@class,'seasonEpisodeTitle')]//a")
                ?? $"Episode {number}";

            string origTitle = node.SelectSingleNodeTextOrDefault(".//td[contains(@class,'seasonEpisodeTitle')]//span") ?? "";

            Hoster[] hosters = node.Select(".//i[contains(@class,'icon')]", child => child.GetAttributeValue("title").ToHoster());
            if (hosters.Length == 0)
                hosters = node.Select(".//i[contains(@class,'icon')]", child => child.GetAttributeValue("class").ToHoster());

            MediaLanguage[] languages = node.Select(".//td[contains(@class,'editFunctions')]//img", child => child.GetAttributeValue("src").ToMediaLanguage());

            return new Media(number: number, title: epTitle, originalTitle: origTitle, hosters: hosters, languages: languages);
        });

        if (modernRows.Length > 0)
            return modernRows;

        // Fallback to legacy format
        return root.Select("//section[contains(@class,'episode-section')]//tbody//tr[contains(@class,'episode-row')]", node => new Media(
            number: node.SelectSingleNodeText(".//th[contains(@class,'episode-number-cell')]").ToInt32(),
            title: node.SelectSingleNodeText(".//td[contains(@class,'episode-title-cell')]//strong"),
            originalTitle: node.SelectSingleNodeText(".//td[contains(@class,'episode-title-cell')]//span"),
            hosters: node.Select(".//td[contains(@class,'episode-watch-cell')]//img", childNode => childNode.GetAttributeValue("alt").ToHoster()),
            languages: node.Select(".//td[contains(@class,'episode-language-cell')]//svg//use", childNode => childNode.GetAttributeValue("href").ToMediaLanguage())));
    }

    public Task<Media[]> GetMoviesAsync(
        string title,
        CancellationToken cancellationToken = default) =>
        GetEpisodesAsync(title, 0, cancellationToken);


    public async Task<VideoDetails> GetEpisodeVideoInfoAsync(
        string title,
        int number,
        int season,
        CancellationToken cancellationToken = default)
    {
        string path = season == 0
            ? $"{site}/{title.ToRelativePath()}/filme/film-{number}"
            : $"{site}/{title.ToRelativePath()}/staffel-{season}/episode-{number}";

        HtmlNode root = await GetHtmlRootAsync(path, cancellationToken);

        logger?.LogInformation("[SerienStreamClient-GetEpisodeVideoInfoAsync] Parsing HTML document into video info: {title}, {number}, {season}...", title, number, season);

        string epTitleName = root.SelectSingleNodeTextOrDefault("//div[contains(@class,'hosterSiteTitle')]//h2//span[contains(@class,'episodeGermanTitle')]")
            ?? root.SelectSingleNodeTextOrDefault("//div[contains(@class,'hosterSiteTitle')]//h2")
            ?? root.SelectSingleNodeTextOrDefault("//article/h2[@class='h4 mb-1']")
            ?? root.SelectSingleNodeTextOrDefault("//h2")
            ?? $"Episode {number}";

        string origTitle = root.SelectSingleNodeTextOrDefault("//div[contains(@class,'hosterSiteTitle')]//h2//small[contains(@class,'episodeEnglishTitle')]") ?? "";

        string description = root.SelectSingleNodeTextOrDefault("//p[contains(@class,'descriptionSpoiler')]")
            ?? root.SelectSingleNodeTextOrDefault("//div[starts-with(@id,'desc-')]/div")
            ?? root.SelectSingleNodeTextOrDefault("//p[@class='vdoDesc']")
            ?? "";

        var streamNodes = root.SelectNodes("//ul//li[contains(@data-link-target,'/redirect/')]")
            ?? root.SelectNodes("//li[contains(@data-link-target,'/redirect/')]")
            ?? root.SelectNodes("//div[@id='episode-links']//button[contains(@class,'link-box')]");

        List<VideoStream> streamList = new();
        if (streamNodes != null)
        {
            foreach (var node in streamNodes)
            {
                string link = node.GetAttributeValue("data-link-target", null)
                    ?? node.GetAttributeValue("data-play-url", null)
                    ?? node.SelectSingleNodeAttributeOrDefault(".//a", "href")
                    ?? "";

                if (string.IsNullOrWhiteSpace(link)) continue;

                string hosterStr = node.GetAttributeValue("data-provider-name", null)
                    ?? node.SelectSingleNodeTextOrDefault(".//h4")
                    ?? node.SelectSingleNodeAttributeOrDefault(".//i[contains(@class,'icon')]", "title")
                    ?? "";

                if (hosterStr.StartsWith("Hoster ")) hosterStr = hosterStr["Hoster ".Length..];

                string langKey = node.GetAttributeValue("data-lang-key", "");
                MediaLanguage lang = langKey switch
                {
                    "1" => new(Language.German, null),
                    "2" => new(Language.English, null),
                    "3" => new(Language.Japanese, Language.German),
                    _ => node.SelectSingleNodeAttributeOrDefault(".//use", "href")?.ToMediaLanguage()
                        ?? node.SelectSingleNodeAttributeOrDefault(".//img", "src")?.ToMediaLanguage()
                        ?? new(Language.Unknown, null)
                };

                streamList.Add(new VideoStream(
                    videoUrl: hostUrl.AddRelativePath(link),
                    hoster: hosterStr.ToHoster(),
                    language: lang
                ));
            }
        }

        return new VideoDetails(
            number: number,
            season: season == 0 ? null : season,
            title: epTitleName,
            originalTitle: origTitle,
            description: description,
            streams: streamList.ToArray());
    }

    public Task<VideoDetails> GetMovieVideoInfoAsync(
        string title,
        int number,
        CancellationToken cancellationToken = default) =>
        GetEpisodeVideoInfoAsync(title, number, 0, cancellationToken);

    public async Task<SearchResultItem[]> SearchAsync(
        string keyword,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(keyword)) return [];

        try
        {
            var formData = new[] { new KeyValuePair<string, string>("keyword", keyword) };
            var response = await requestHelper.PostFormAsync(hostUrl, "ajax/search", formData, null, cancellationToken);
            if (!response.IsSuccessStatusCode) return [];

            var jsonStr = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(jsonStr)) return [];

            using var doc = System.Text.Json.JsonDocument.Parse(jsonStr);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array) return [];

            List<SearchResultItem> results = new();
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                string titleRaw = el.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                string descRaw = el.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                string link = el.TryGetProperty("link", out var l) ? l.GetString() ?? "" : "";

                if (string.IsNullOrWhiteSpace(link)) continue;

                // Ignore support questions and individual episode links
                if (link.Contains("/support/") || link.Contains("/episode-") || link.Contains("/film-"))
                    continue;

                // Strip HTML tags like <em>...</em> and unescape HTML entities
                string title = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(titleRaw, "<[^>]*>", "")).Trim();
                string desc = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(descRaw, "<[^>]*>", "")).Trim();

                if (desc == "Keine Beschreibung verfügbar.") desc = "";

                if (!string.IsNullOrWhiteSpace(title))
                {
                    results.Add(new SearchResultItem(title, desc, link));
                }
            }

            return results.ToArray();
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "SearchAsync failed for keyword {keyword}", keyword);
            return [];
        }
    }
}

public record SearchResultItem(string Title, string Description, string Link);