using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.TvItemLayout.Api;
using Microsoft.AspNetCore.Mvc;

public static class HomeCollectionsAdventChecks
{
    public static JsonElement Settings(string? unlock = "daily")
    {
        var settings = JsonNode.Parse(HomeCollectionsRankChecks.Settings().GetRawText())!.AsObject();
        var child = Child(settings);
        child["kind"] = "items";
        child["collectionIds"] = new JsonArray("festive-films");
        child["appearance"]!["reveal"] = "advent";
        if (unlock is not null) child["appearance"]!["adventUnlock"] = unlock;
        return JsonSerializer.SerializeToElement(settings);
    }
    private static JsonObject Child(JsonObject settings) => settings["rows"]![1]!["children"]![1]!.AsObject();
    private static JsonObject Appearance(JsonObject settings) => Child(settings)["appearance"]!.AsObject();

    public static async Task Run(Action<bool, string> assert, HomeCollectionsController controller,
        HomeCollectionsController second, string revision)
    {
        HomeCollectionsResponse Value(IActionResult result) => (HomeCollectionsResponse)((OkObjectResult)result).Value!;
        var settings = Settings();
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "5";
        var saved = Value(await controller.PutHomeCollections(new(revision, settings)));
        assert(saved.Revision != revision && saved.Settings!.Value.GetRawText() == settings.GetRawText()
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Capability 5 persists advent mode alongside existing seasonal, rank, source and placement settings across controller instances");
        var original = HomeCollectionsRankChecks.Settings();
        var empty = JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() });
        foreach (var capability in new[] { "", "2", "3", "4", "4,5", "7" })
        {
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = capability;
            assert(Value(await controller.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
                "Clients can read advent settings with capability " + capability);
            assert(await controller.PutHomeCollections(new(saved.Revision, original)) is ConflictObjectResult
                && await controller.PutHomeCollections(new(saved.Revision, empty)) is ConflictObjectResult,
                "Clients without advent capability cannot strip mode, unlock choice or delete its rows with capability " + capability);
        }
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "5";
        async Task Reject(string reason, Action<JsonObject> mutate)
        {
            var invalid = JsonNode.Parse(settings.GetRawText())!.AsObject(); mutate(invalid);
            assert(await controller.PutHomeCollections(new(saved.Revision, JsonSerializer.SerializeToElement(invalid))) is BadRequestObjectResult,
                "Advent validation rejects " + reason);
        }
        foreach (var reveal in new[] { "none", "doors", "curtains", "shutters" })
            await Reject("unlock choice on " + reveal, value => Appearance(value)["reveal"] = reveal);
        await Reject("Halloween advent", value => Appearance(value)["theme"] = "halloween");
        await Reject("collection card advent", value => Child(value)["kind"] = "collections");
        await Reject("watchlist advent", value => { Child(value)["kind"] = "watchlist"; Child(value)["collectionIds"] = new JsonArray(); });
        foreach (var invalid in new JsonNode?[] { null, JsonValue.Create(1), JsonValue.Create(true), new JsonObject(), new JsonArray(), JsonValue.Create(""), JsonValue.Create("today") })
            await Reject("malformed unlock choice " + invalid, value => Appearance(value)["adventUnlock"] = invalid?.DeepClone());
        var duplicate = settings.GetRawText().Replace("\"adventUnlock\":\"daily\"", "\"adventUnlock\":\"daily\",\"adventUnlock\":\"focus\"");
        assert(await controller.PutHomeCollections(new(saved.Revision, JsonDocument.Parse(duplicate).RootElement)) is BadRequestObjectResult,
            "Advent validation rejects duplicate unlock fields");
        assert(Value(await second.GetHomeCollections()).Revision == saved.Revision
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Rejected advent edits leave every saved setting and revision intact");
        foreach (var unlock in new string?[] { "focus", null, "daily" })
        {
            var next = Settings(unlock);
            var oldRevision = saved.Revision;
            saved = Value(await controller.PutHomeCollections(new(saved.Revision, next)));
            assert(saved.Revision != oldRevision && saved.Settings!.Value.GetRawText() == next.GetRawText(),
                "Advent round trip preserves " + (unlock ?? "omitted") + " unlock semantics without adding fields");
            assert(await second.PutHomeCollections(new(oldRevision, original)) is ConflictObjectResult,
                "Stale revisions cannot overwrite advent settings");
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
            assert(await controller.PutHomeCollections(new(saved.Revision, original)) is ConflictObjectResult,
                "Even omitted unlock settings retain the advent capability guard");
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "5";
        }
        var removed = Value(await controller.PutHomeCollections(new(saved.Revision, original)));
        assert(removed.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 5 can intentionally remove advent settings while satisfying rank, appearance and seasonal guards");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
        var compatible = Value(await controller.PutHomeCollections(new(removed.Revision, original)));
        assert(compatible.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 4 remains writable once advent mode has intentionally been removed");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "5";
        var restored = Value(await controller.PutHomeCollections(new(compatible.Revision, settings)));
        var cleared = Value(await controller.PutHomeCollections(new(restored.Revision, empty)));
        assert(cleared.Settings!.Value.GetProperty("rows").GetArrayLength() == 0,
            "Capability 5 may intentionally remove all advent rows");
        await HomeCollectionsFullscreenChecks.Run(assert, controller, second, cleared.Revision!);
    }

    public static async Task RunHttp(Action<bool, string> assert, HttpClient client, string revision)
    {
        const string endpoint = "/TvItemLayout/HomeCollections";
        async Task<JsonElement> Json(HttpResponseMessage response) => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
        Task<HttpResponseMessage> Put(string? current, JsonElement next) => client.PutAsync(endpoint,
            new StringContent(JsonSerializer.Serialize(new HomeCollectionsRequest(current, next)), Encoding.UTF8, "application/json"));
        void Capability(string value) { client.DefaultRequestHeaders.Remove("X-ScreenHarbour-Home-Rows"); client.DefaultRequestHeaders.Add("X-ScreenHarbour-Home-Rows", value); }
        Capability("5");
        var settings = Settings();
        using var response = await Put(revision, settings);
        var saved = await Json(response); revision = saved.GetProperty("Revision").GetString()!;
        assert(response.StatusCode == HttpStatusCode.OK && saved.GetProperty("Settings").GetRawText() == settings.GetRawText(),
            "Actual HTTP capability 5 preserves numbered advent door mode and its daily unlock preference");
        foreach (var capability in new[] { "3", "4" })
        {
            Capability(capability);
            using var read = await client.GetAsync(endpoint);
            using var erase = await Put(revision, HomeCollectionsAppearanceChecks.Settings());
            using var delete = await Put(revision, JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() }));
            using var after = await client.GetAsync(endpoint);
            assert(read.StatusCode == HttpStatusCode.OK && (await Json(read)).GetRawText() == saved.GetRawText()
                && erase.StatusCode == HttpStatusCode.Conflict && delete.StatusCode == HttpStatusCode.Conflict
                && (await erase.Content.ReadAsStringAsync()).Contains("advent calendar doors", StringComparison.Ordinal)
                && (await Json(after)).GetRawText() == saved.GetRawText(),
                "Actual HTTP capability " + capability + " reads advent settings but cannot erase the feature or rows");
        }
        Capability("5");
        using var invalid = await Put(revision, Settings("unknown"));
        assert(invalid.StatusCode == HttpStatusCode.BadRequest, "Actual HTTP rejects malformed advent unlock preferences");
        using var omitted = await Put(revision, Settings(null));
        var omittedSaved = await Json(omitted);
        assert(omitted.StatusCode == HttpStatusCode.OK && omittedSaved.GetProperty("Settings").GetRawText() == Settings(null).GetRawText(),
            "Actual HTTP preserves omitted unlock preference without changing it into daily mode");
        using var removed = await Put(omittedSaved.GetProperty("Revision").GetString(), HomeCollectionsRankChecks.Settings());
        var removedSaved = await Json(removed);
        assert(removed.StatusCode == HttpStatusCode.OK, "Actual HTTP capability 5 may explicitly remove advent mode");
        Capability("4");
        using var compatible = await Put(removedSaved.GetProperty("Revision").GetString(), HomeCollectionsRankChecks.Settings());
        assert(compatible.StatusCode == HttpStatusCode.OK, "Actual HTTP capability 4 resumes editing after advent is removed");
        await HomeCollectionsFullscreenChecks.RunHttp(assert, client, (await Json(compatible)).GetProperty("Revision").GetString()!);
    }
}
