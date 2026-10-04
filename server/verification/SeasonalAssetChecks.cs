using System.Net;
using System.Security.Cryptography;
using Jellyfin.Plugin.TvItemLayout;

public static class SeasonalAssetChecks
{
    public static async Task Run(Action<bool,string> assert, HttpClient client)
    {
        foreach (var name in new[] {"halloween-photoreal", "halloween-nightmare", "christmas-photoreal", "halloween-nightmare-door", "halloween-nightmare-frame", "christmas-photoreal-door", "christmas-photoreal-frame"})
        foreach (var variant in new[] { "", "-tv" })
        {
            var assetName = name + variant;
            var path = "/TvItemLayout/SeasonalAsset/" + assetName + ".webp";
            using var response = await client.GetAsync(path + "?v=" + ClientScriptAsset.CacheVersion);
            assert(response.StatusCode == HttpStatusCode.OK && response.Content.Headers.ContentType?.MediaType == "image/webp", "Bundled seasonal art is public WebP: " + assetName);
            assert(response.Headers.CacheControl?.Public == true && response.Headers.CacheControl?.MaxAge?.TotalDays == 365
                && response.Headers.CacheControl.Extensions.Any(value => value.Name == "immutable") && response.Headers.ETag != null,
                "Seasonal artwork has public versioned immutable cache and ETag: " + assetName);
            using var expected = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.TvItemLayout.SeasonalAssets." + assetName + ".webp")!;
            using var buffer = new MemoryStream(); await expected.CopyToAsync(buffer);
            var bytes = buffer.ToArray();
            assert((await response.Content.ReadAsByteArrayAsync()).SequenceEqual(bytes), "Artwork HTTP bytes exactly match embedded resource: " + assetName);
            assert(response.Headers.ETag?.ToString() == $"\"{Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()}\""
                && response.Headers.TryGetValues("X-Content-Type-Options", out var nosniff) && nosniff.Single() == "nosniff",
                "Artwork ETag identifies its own exact bytes and responses disable content sniffing: " + assetName);
            using var request = new HttpRequestMessage(HttpMethod.Get,path); request.Headers.IfNoneMatch.Add(response.Headers.ETag!);
            using var cached = await client.SendAsync(request);
            assert(cached.StatusCode == HttpStatusCode.NotModified && (await cached.Content.ReadAsByteArrayAsync()).Length == 0
                && cached.Headers.CacheControl?.NoCache == true, "Cached seasonal art revalidates without a body: " + assetName);
        }
        using var stale = await client.GetAsync("/TvItemLayout/SeasonalAsset/christmas-photoreal.webp?v=old");
        assert(stale.Headers.CacheControl?.NoCache == true, "Older artwork URLs revalidate rather than caching changed content permanently");
        using var missingVersion = await client.GetAsync("/TvItemLayout/SeasonalAsset/christmas-photoreal.webp");
        assert(missingVersion.Headers.CacheControl?.NoCache == true && missingVersion.Headers.CacheControl?.Public == true,
            "Unversioned artwork URLs revalidate without requiring authentication");
        foreach (var invalid in new[] { "server-settings.json", "ClientScript.js", "christmas-photoreal.WEBP", "missing.webp",
            "originals%2Fchristmas-photoreal.png", "..%2F..%2Fserver-settings.json", "%2Fetc%2Fpasswd" })
        {
            using var response = await client.GetAsync("/TvItemLayout/SeasonalAsset/" + invalid);
            assert(response.StatusCode == HttpStatusCode.NotFound, "Static artwork only serves exact embedded WebP names: " + invalid);
        }
    }
}
