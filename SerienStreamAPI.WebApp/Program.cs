using System.Text.Json;
using System.Text.Json.Serialization;
using SerienStreamAPI.Client;
using SerienStreamAPI.Exceptions;
using SerienStreamAPI.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// Register SerienStream App Service
builder.Services.AddSingleton<SerienStreamService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// API Endpoints
var api = app.MapGroup("/api");

api.MapGet("/config", (SerienStreamService service) => Results.Ok(service.Config));

api.MapPost("/config", (SerienStreamConfigModel newConfig, SerienStreamService service) =>
{
    service.UpdateConfig(newConfig);
    return Results.Ok(service.Config);
});

api.MapGet("/series", async (string title, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest(new { error = "Title parameter is required." });

    try
    {
        var series = await service.Client.GetSeriesAsync(title, ct);
        return Results.Ok(series);
    }
    catch (SeriesNotFoundException)
    {
        return Results.NotFound(new { error = $"'{title}' wurde auf {service.Config.HostUrl} nicht gefunden. Bitte überprüfe den genauen Namen." });
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(detail: $"Verbindungsfehler zur Ziel-URL ({service.Config.HostUrl}): {ex.Message}. Bitte aktiviere 'SSL Zertifikatsprüfung ignorieren' oder passe die Host-URL in den Einstellungen an.", statusCode: 502);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

api.MapGet("/search", async (string keyword, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(keyword))
        return Results.Ok(Array.Empty<SearchResultItem>());

    try
    {
        var raw = await service.SearchAsync(keyword, ct);
        var cleanList = new List<SearchResultItem>();
        foreach (var item in raw)
        {
            string link = item.Link ?? "";
            if (link.Contains("/support/") || link.Contains("/episode-") || link.Contains("/film-") || link.Contains("/frage/"))
                continue;

            string title = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(item.Title ?? "", "<[^>]*>", "")).Trim();
            string desc = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(item.Description ?? "", "<[^>]*>", "")).Trim();
            if (desc == "Keine Beschreibung verfügbar.") desc = "";

            cleanList.Add(new SearchResultItem(title, desc, link));
        }

        return Results.Ok(cleanList);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

api.MapGet("/episodes", async (string title, int season, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest(new { error = "Title parameter is required." });

    try
    {
        var episodes = await service.Client.GetEpisodesAsync(title, season, ct);
        return Results.Ok(episodes);
    }
    catch (SeasonNotFoundException)
    {
        return Results.NotFound(new { error = $"Season {season} for '{title}' not found." });
    }
    catch (SeriesNotFoundException)
    {
        return Results.NotFound(new { error = $"Series '{title}' not found." });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

api.MapGet("/movies", async (string title, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest(new { error = "Title parameter is required." });

    try
    {
        var movies = await service.Client.GetMoviesAsync(title, ct);
        return Results.Ok(movies);
    }
    catch (SeriesNotFoundException)
    {
        return Results.NotFound(new { error = $"Series '{title}' not found." });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

api.MapGet("/video-info", async (string title, int season, int episode, bool isMovie, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest(new { error = "Title parameter is required." });

    try
    {
        VideoDetails details;
        if (isMovie)
        {
            details = await service.Client.GetMovieVideoInfoAsync(title, episode, ct);
        }
        else
        {
            details = await service.Client.GetEpisodeVideoInfoAsync(title, episode, season, ct);
        }

        return Results.Ok(details);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

api.MapGet("/auth/status", (SerienStreamService service) =>
{
    bool isProtected = !string.IsNullOrWhiteSpace(service.Config.PasswordHashSHA256);
    return Results.Ok(new { isProtected });
});

api.MapPost("/auth/login", (LoginRequest req, SerienStreamService service) =>
{
    string targetHash = service.Config.PasswordHashSHA256?.Trim().ToLowerInvariant() ?? "";

    if (string.IsNullOrEmpty(targetHash))
    {
        return Results.Ok(new { success = true, isProtected = false });
    }

    string inputHash = req.Hash?.Trim().ToLowerInvariant() ?? "";
    if (string.IsNullOrEmpty(inputHash) && !string.IsNullOrEmpty(req.Password))
    {
        inputHash = SerienStreamService.ComputeSha256(req.Password).ToLowerInvariant();
    }

    if (string.Equals(inputHash, targetHash, StringComparison.OrdinalIgnoreCase))
    {
        return Results.Ok(new { success = true, isProtected = true });
    }

    return Results.BadRequest(new { success = false, error = "Falsches Passwort!" });
});

api.MapPost("/extract-stream", async (ExtractStreamRequest req, SerienStreamService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.VideoUrl))
        return Results.BadRequest(new { error = "VideoUrl is required." });

    try
    {
        string hosterName = req.Hoster?.ToLowerInvariant() ?? "";
        string streamUrl = hosterName switch
        {
            "voe" => await service.Downloader.GetVoeStreamUrlAsync(req.VideoUrl, ct),
            "streamtape" => await service.Downloader.GetStreamtapeStreamUrlAsync(req.VideoUrl, ct),
            "doodstream" => await service.Downloader.GetDoodstreamStreamUrlAsync(req.VideoUrl, ct),
            "vidoza" => await service.Downloader.GetVidozaStreamUrlAsync(req.VideoUrl, ct),
            _ => throw new Exception($"Hoster '{req.Hoster}' stream url extraction is not directly supported.")
        };

        return Results.Ok(new { streamUrl, hoster = req.Hoster, videoUrl = req.VideoUrl });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.Run();

// Configuration & Service Models
public class SerienStreamConfigModel
{
    public string HostUrl { get; set; } = "https://aniworld.to/";
    public string Site { get; set; } = "anime/stream";
    public bool IgnoreCertificateValidation { get; set; } = false;
    public string PasswordHashSHA256 { get; set; } = "";
}

public record ExtractStreamRequest(string VideoUrl, string Hoster);
public record LoginRequest(string? Password, string? Hash);

public class SerienStreamService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SerienStreamService> _logger;
    private readonly object _lock = new();

    public SerienStreamConfigModel Config { get; private set; } = new();
    public SerienStreamClient Client { get; private set; } = null!;
    public DownloadClient Downloader { get; private set; } = null!;

    public SerienStreamService(IConfiguration configuration, ILogger<SerienStreamService> logger)
    {
        _configuration = configuration;
        _logger = logger;

        var configSection = configuration.GetSection("SerienStreamConfig");
        Config = new SerienStreamConfigModel
        {
            HostUrl = configSection["HostUrl"] ?? "https://aniworld.to/",
            Site = configSection["Site"] ?? "anime/stream",
            IgnoreCertificateValidation = bool.TryParse(configSection["IgnoreCertificateValidation"], out bool ignore) && ignore,
            PasswordHashSHA256 = configSection["PasswordHashSHA256"] ?? ""
        };

        InitializeClients();
    }

    public void UpdateConfig(SerienStreamConfigModel newConfig)
    {
        lock (_lock)
        {
            Config.HostUrl = string.IsNullOrWhiteSpace(newConfig.HostUrl) ? "https://aniworld.to/" : newConfig.HostUrl.Trim();
            if (!Config.HostUrl.EndsWith("/")) Config.HostUrl += "/";

            Config.Site = string.IsNullOrWhiteSpace(newConfig.Site) ? "anime/stream" : newConfig.Site.Trim().ToLowerInvariant();
            Config.IgnoreCertificateValidation = newConfig.IgnoreCertificateValidation;
            Config.PasswordHashSHA256 = newConfig.PasswordHashSHA256?.Trim() ?? "";

            InitializeClients();
            _logger.LogInformation("SerienStreamService configuration updated: HostUrl={HostUrl}, Site={Site}", Config.HostUrl, Config.Site);
        }
    }

    public static string ComputeSha256(string rawData)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        byte[] bytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(rawData));
        var builder = new System.Text.StringBuilder();
        for (int i = 0; i < bytes.Length; i++)
        {
            builder.Append(bytes[i].ToString("x2"));
        }
        return builder.ToString();
    }

    private void InitializeClients()
    {
        string normalizedSite = Config.Site.Trim().ToLowerInvariant();
        if (!normalizedSite.Contains("stream"))
        {
            normalizedSite = $"{normalizedSite}/stream";
        }

        Client = new SerienStreamClient(Config.HostUrl, normalizedSite, Config.IgnoreCertificateValidation);
        Downloader = new DownloadClient("ffmpeg.exe", Config.IgnoreCertificateValidation);
    }

    public async Task<SearchResultItem[]> SearchAsync(string keyword, CancellationToken ct = default)
    {
        var rawResults = await Client.SearchAsync(keyword, ct);

        List<SearchResultItem> filtered = new();
        foreach (var r in rawResults)
        {
            string link = r.Link ?? "";
            if (link.Contains("/support/") || link.Contains("/episode-") || link.Contains("/film-") || link.Contains("/frage/"))
                continue;

            string titleClean = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(r.Title ?? "", "<.*?>", "")).Trim();
            string descClean = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(r.Description ?? "", "<.*?>", "")).Trim();

            if (descClean == "Keine Beschreibung verfügbar.") descClean = "";

            filtered.Add(new SearchResultItem(titleClean, descClean, link));
        }

        return filtered.ToArray();
    }
}
