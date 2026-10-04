using System.Net;
using Jellyfin.Plugin.TvItemLayout;

public static class SeasonalFontChecks
{
    public static async Task Run(Action<bool, string> assert, HttpClient client)
    {
        foreach (var name in new[] { "halloween-classic", "halloween-storybook", "halloween-photoreal", "halloween-nightmare",
            "christmas-classic", "christmas-storybook", "christmas-photoreal" })
        {
            var path = "/TvItemLayout/SeasonalFont/" + name + ".woff2";
            using var response = await client.GetAsync(path + "?v=" + ClientScriptAsset.CacheVersion);
            assert(response.StatusCode == HttpStatusCode.OK && response.Content.Headers.ContentType?.MediaType == "font/woff2",
                "Bundled seasonal font is public WOFF2: " + name);
            assert(response.Headers.CacheControl?.Public == true && response.Headers.CacheControl?.MaxAge?.TotalDays == 365
                && response.Headers.CacheControl.Extensions.Any(value => value.Name == "immutable") && response.Headers.ETag != null,
                "Seasonal font has immutable versioned caching and ETag: " + name);
            using var expected = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.TvItemLayout.SeasonalFonts." + name + ".woff2")!;
            using var buffer = new MemoryStream(); await expected.CopyToAsync(buffer);
            assert((await response.Content.ReadAsByteArrayAsync()).SequenceEqual(buffer.ToArray()), "Font HTTP bytes match its embedded resource: " + name);
            using var license = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.TvItemLayout.SeasonalFonts." + name + "-OFL.txt");
            assert(license is not null && new StreamReader(license).ReadToEnd().Contains("SIL OPEN FONT LICENSE"),
                "Each font includes its license in the distributed assembly: " + name);
            using var request = new HttpRequestMessage(HttpMethod.Get, path); request.Headers.IfNoneMatch.Add(response.Headers.ETag!);
            using var cached = await client.SendAsync(request);
            assert(cached.StatusCode == HttpStatusCode.NotModified && (await cached.Content.ReadAsByteArrayAsync()).Length == 0
                && cached.Headers.CacheControl?.NoCache == true, "Font cache revalidates without another download: " + name);
        }
        foreach (var invalid in new[] { "missing.woff2", "halloween-classic.WOFF2", "halloween-classic-OFL.txt", "ClientScript.js",
            "..%2F..%2Fserver-settings.json", "%2Fetc%2Fpasswd" })
        {
            using var response = await client.GetAsync("/TvItemLayout/SeasonalFont/" + invalid);
            assert(response.StatusCode == HttpStatusCode.NotFound, "Font endpoint only exposes exact embedded WOFF2 names: " + invalid);
        }
        using var stale = await client.GetAsync("/TvItemLayout/SeasonalFont/halloween-classic.woff2?v=old");
        assert(stale.Headers.CacheControl?.NoCache == true, "Stale font URL revalidates");
    }
}
