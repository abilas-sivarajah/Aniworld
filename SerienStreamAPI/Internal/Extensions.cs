using HtmlAgilityPack;
using SerienStreamAPI.Enums;
using SerienStreamAPI.Models;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SerienStreamAPI.Internal;

internal static class Extensions
{
    public static string AddRelativePath(
        this string baseUrl,
        string relativePath) =>
        $"{baseUrl.Trim('/')}/{relativePath.Trim('/')}";


    static readonly HashSet<char> replacements =
    [
        ':', ',' , '(', ')', '~', '.', '&', '\'', '+', '!', 'ü', 'ä', 'ö',
    ];

    public static string ToRelativePath(
        this string text)
    {
        StringBuilder builder = new();
        bool lastWasDash = false;

        foreach (char c in text.ToLower())
        {
            if (replacements.Contains(c))
                continue;
            else if (c == ' ')
            {
                if (!lastWasDash)
                {
                    builder.Append('-');
                    lastWasDash = true;
                }
                continue;
            }
            else if (c == 'ß')
            {
                builder.Append("ss");
                lastWasDash = false;
                continue;
            }

            builder.Append(c);
            lastWasDash = false;
        }

        return builder.ToString();
    }


    public static int ToInt32(
        this bool boolean) =>
        boolean ? 1 : 0;

    public static int ToInt32(
        this string? text,
        int defaultValue = 0) =>
        int.TryParse(text, NumberStyles.Integer | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out int result) ? result : defaultValue;
    
    public static double ToDouble(
        this string text) =>
        double.Parse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture);

    public static TimeSpan ToTimeSpan(
        this string text) =>
        TimeSpan.ParseExact(text, @"hh\:mm\:ss\.ff", null);

    public static Hoster ToHoster(
        this string text) =>
        text.ToLowerInvariant() switch
        {
            "voe" => Hoster.VOE,
            "doodstream" => Hoster.Doodstream,
            "vidoza" => Hoster.Vidoza,
            "streamtape" => Hoster.Streamtape,
            _ => Hoster.Unknown
        };
    
    public static Language ToLanguage(
        this string text) =>
        text.ToLowerInvariant() switch
        {
            "german" => Language.German,
            "english" => Language.English,
            "japanese" => Language.Japanese,
            _ => Language.Unknown
        };

    public static MediaLanguage ToMediaLanguage(
        this string text)
    {
        text = text.Trim();
        
        string language;
        if (text.StartsWith("#icon-flag-")) // new-style: href: "#icon-flag-german"
            language = text["#icon-flag-".Length..];
        else if (text.Contains("/flags/"))
        {
            int idx = text.LastIndexOf("/flags/");
            language = text[(idx + "/flags/".Length)..];
            if (language.EndsWith(".svg")) language = language[..^".svg".Length];
        }
        else if (text.EndsWith(".svg"))
        {
            int idx = text.LastIndexOf('/');
            language = idx >= 0 ? text[(idx + 1)..^".svg".Length] : text[..^".svg".Length];
        }
        else
            return new(Language.Unknown, null);
        
        string[] languageData = language.Split('-', StringSplitOptions.RemoveEmptyEntries);
        return languageData.Length switch
        {
            1 => new(languageData[0].ToLanguage(), null),
            2 => new(languageData[0].ToLanguage(), languageData[1].ToLanguage()),
            _ => new(Language.Unknown, null)
        };
    }


    public static string Match(
        this string text,
        string pattern,
        int group)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "";

        Match match = Regex.Match(text, pattern);
        return match.Success ? match.Groups[group].Value.Trim() : "";
    }

    
    public static string GetInnerText(
        this HtmlNode? node) =>
        node?.InnerText.Trim('/').Trim() ?? string.Empty;

    public static string GetAttributeValue(
        this HtmlNode? node,
        string attributeName) =>
        node?.GetAttributeValue(attributeName, null).Trim('/') ?? string.Empty;


    public static string? SelectSingleNodeTextOrDefault(
        this HtmlNode node,
        string xpath)
    {
        HtmlNode? result = node.SelectSingleNode(xpath);
        return result.GetInnerText();
    }
    
    public static string? SelectSingleNodeAttributeOrDefault(
        this HtmlNode node,
        string xpath,
        string attributeName)
    {
        HtmlNode? result = node.SelectSingleNode(xpath);
        return result.GetAttributeValue(attributeName);
    }


    public static string SelectSingleNodeText(
        this HtmlNode node,
        string xpath) =>
        node.SelectSingleNodeTextOrDefault(xpath) ?? throw new NodeNotFoundException($"Could not find node: \"{xpath}\".");

    public static string SelectSingleNodeAttribute(
        this HtmlNode node,
        string xpath,
        string attributeName) =>
        node.SelectSingleNodeAttributeOrDefault(xpath, attributeName) ?? throw new NodeAttributeNotFoundException($"Could not find node or attribute: \"{xpath}\" - \"{attributeName}\".");


    public static bool Any(
        this HtmlNode node,
        string xpath) =>
        node.SelectSingleNode(xpath) is not null;

    public static T[] Select<T>(
        this HtmlNode node,
        string xpath,
        Func<HtmlNode, T> selector)
    {
        HtmlNodeCollection? nodes = node.SelectNodes(xpath);
        if (nodes is null)
            return [];

        T[] result = new T[nodes.Count];
        for (int i = 0; i < nodes.Count; i++)
            result[i] = selector(nodes[i]);

        return result;
    }
    
    public static Dictionary<TKey, TValue> Map<TKey, TValue>(
        this HtmlNode node,
        string xpath,
        Func<HtmlNode, (TKey, TValue)> selector) where TKey : notnull
    {
        HtmlNodeCollection? nodes = node.SelectNodes(xpath);
        if (nodes is null)
            return [];

        Dictionary<TKey, TValue> result = [];
        foreach (HtmlNode childNode in nodes)
        {
            var (key, value) = selector(childNode);
            result[key] = value;
        }

        return result;
    }


    public static string ShiftLetters(
        this string input)
    {
        StringBuilder sb = new(input.Length);

        foreach (char c in input)
        {
            if (c >= 'A' && c <= 'Z')
                sb.Append((char)((c - 'A' + 13) % 26 + 'A'));
            else if (c >= 'a' && c <= 'z')
                sb.Append((char)((c - 'a' + 13) % 26 + 'a'));
            else
                sb.Append(c);
        }

        return sb.ToString();
    }

    static readonly string[] junkParts = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];

    public static string ReplaceJunk(
        this string input)
    {
        foreach (string junk in junkParts)
            input = input.Replace(junk, "_");

        return input;
    }

    public static string ShiftBack(
        this string input,
        int shift)
    {
        StringBuilder sb = new(input.Length);

        foreach (char c in input)
            sb.Append((char)(c - shift));

        return sb.ToString();
    }

    public static string ReverseString(
        this string s)
    {
        char[] arr = s.ToCharArray();

        Array.Reverse(arr);
        return new(arr);
    }
}