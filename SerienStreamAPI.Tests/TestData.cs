using System.Text.Encodings.Web;
using Microsoft.Extensions.Logging;
using SerienStreamAPI.Enums;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SerienStreamAPI.Tests;

public static class TestData
{
    static TestData()
    {
        loggerFactory = LoggerFactory.Create(builder =>
        {
            builder.AddConsole();
            builder.AddDebug();
        });

        serializerOptions = new()
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };
        serializerOptions.Converters.Add(new JsonStringEnumConverter());
    }


    static readonly ILoggerFactory loggerFactory;

    public static ILogger<T> CreateLogger<T>() =>
        loggerFactory.CreateLogger<T>();


    static readonly JsonSerializerOptions serializerOptions;

    public static void LogObject(
        this ILogger logger,
        object @object,
        string message = "Result",
        LogLevel level = LogLevel.Information) =>
        logger.Log(level, "\n{message}:\n\t{readableResults}", message, JsonSerializer.Serialize(@object, serializerOptions));


    public static readonly string HostUrl = "http://186.2.175.5/";

    public static readonly string Site = "serie";

    public static readonly bool IgnoreCerficiateValidation = true;

    public static readonly string FFmpegLocation = @"C:\Program Files\FFmpeg\FFmpeg.exe";


    public static readonly string Title = "The Rookie";

    public static readonly int Season = 1;

    public static readonly int Episode = 5;

    public static readonly int Movie = 1;


    public static readonly string RedirectId = "2531389";


    public static readonly string VoeVideoUrl = "https://lauradaydo.com/e/khd0rbysw7qr";

    public static readonly string StreamtapeVideoUrl = "https://streamtape.com/v/lARoV4B6vps7kbg/unknown_replay_2025.05.29-11.32.mp4";

    public static readonly string DoodstreamVideoUrl = "https://vide0.net/e/whjxr0pbrqj1";

    public static readonly string VidozaVideoUrl = "https://186.2.175.5/redirect/17839891";


    public static readonly string StreamUrl = "https://dk543xi.cloudatacdn.com/u5kj6fyftdblsdgge6v4oii6ijflfjhlbpogpdiws3dxy7ierpsotjjh7zvq/8z38fy1vou~6nVCoTP03T?token=210791274-37-201-1751629562-312c9a6b1a19d6495fc08e659de749f6/mwom8zu9w6doto0gldcj2jxq&expiry=1751629592907";

    public static readonly string FilePath = @$"{Environment.GetFolderPath(Environment.SpecialFolder.Desktop)}\test.mp4";

    public static readonly (string key, string value)[]? Headers = [("Referer", DoodstreamVideoUrl)]; //[("Referer", DoodstreamVideoUrl)]; // Header requirered when downloading stream from doodstream


    public static readonly string DownloadDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);

    public static readonly Language DesiredAudioLanguage = Language.German;

    public static readonly Language? DesiredSubtitleLanguage = null;

    public static readonly Hoster DesiredHoster = Hoster.VOE;
}