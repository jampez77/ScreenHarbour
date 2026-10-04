using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.TvItemLayout.Api;
using Microsoft.AspNetCore.Mvc;

public static class HomeCollectionsFullscreenChecks
{
    public static JsonElement Settings()
    {
        var settings = JsonNode.Parse(HomeCollectionsAdventChecks.Settings().GetRawText())!;
        foreach (var child in settings["rows"]![1]!["children"]!.AsArray())
            if (child!["appearance"] is JsonObject appearance) appearance["expansion"] = "fullscreen";
        return JsonSerializer.SerializeToElement(settings);
    }

    public static async Task Run(Action<bool, string> assert, HomeCollectionsController controller,
        HomeCollectionsController second, string revision)
    {
        HomeCollectionsResponse Value(IActionResult result) => (HomeCollectionsResponse)((OkObjectResult)result).Value!;
        var original = HomeCollectionsAdventChecks.Settings();
        var empty = JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() });
        var settings = Settings();
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "6";
        var saved = Value(await controller.PutHomeCollections(new(revision, settings)));
        assert(saved.Settings!.Value.GetRawText() == settings.GetRawText()
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Capability 6 persists full-screen rows with both themes, existing collection IDs, order, dates and advent settings");
        foreach (var capability in new[] { "", "2", "3", "4", "5", "5,6", "7" })
        {
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = capability;
            assert(Value(await controller.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
                "Clients can read full-screen seasonal rows with capability " + capability);
            assert(await controller.PutHomeCollections(new(saved.Revision, original)) is ConflictObjectResult
                && await controller.PutHomeCollections(new(saved.Revision, empty)) is ConflictObjectResult,
                "Clients without full-screen capability cannot strip appearance or delete its rows with capability " + capability);
        }
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "6";
        var invalid = JsonNode.Parse(settings.GetRawText())!;
        invalid["rows"]![1]!["children"]![0]!["appearance"]!["expansion"] = "full-screen";
        assert(await controller.PutHomeCollections(new(saved.Revision, JsonSerializer.SerializeToElement(invalid))) is BadRequestObjectResult,
            "Full-screen expansion accepts only its defined enum value");
        assert(Value(await second.GetHomeCollections()).Revision == saved.Revision
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Rejected legacy or malformed full-screen edits preserve all saved settings and revision");
        var removed = Value(await controller.PutHomeCollections(new(saved.Revision, original)));
        assert(removed.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 6 can turn off full-screen expansion while retaining advent, rank and original seasonal fields");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "5";
        var compatible = Value(await controller.PutHomeCollections(new(removed.Revision, original)));
        assert(compatible.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 5 remains writable once full-screen expansion is intentionally removed");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "6";
        var restored = Value(await controller.PutHomeCollections(new(compatible.Revision, settings)));
        var cleared = Value(await controller.PutHomeCollections(new(restored.Revision, empty)));
        assert(cleared.Settings!.Value.GetProperty("rows").GetArrayLength() == 0,
            "Capability 6 may intentionally delete full-screen seasonal rows while satisfying all previous guards");
    }

    public static async Task RunHttp(Action<bool, string> assert, HttpClient client, string revision)
    {
        const string endpoint = "/TvItemLayout/HomeCollections";
        async Task<JsonElement> Json(HttpResponseMessage response) => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
        Task<HttpResponseMessage> Put(string? current, JsonElement next) => client.PutAsync(endpoint,
            new StringContent(JsonSerializer.Serialize(new HomeCollectionsRequest(current, next)), Encoding.UTF8, "application/json"));
        void Capability(string value) { client.DefaultRequestHeaders.Remove("X-ScreenHarbour-Home-Rows"); client.DefaultRequestHeaders.Add("X-ScreenHarbour-Home-Rows", value); }
        Capability("6");
        var settings = Settings();
        using var response = await Put(revision, settings);
        var saved = await Json(response); revision = saved.GetProperty("Revision").GetString()!;
        assert(response.StatusCode == HttpStatusCode.OK && saved.GetProperty("Settings").GetRawText() == settings.GetRawText(),
            "Actual HTTP capability 6 saves full-screen expansion without changing other seasonal options");
        Capability("5");
        using var erase = await Put(revision, HomeCollectionsAdventChecks.Settings());
        using var delete = await Put(revision, JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() }));
        using var after = await client.GetAsync(endpoint);
        assert(erase.StatusCode == HttpStatusCode.Conflict && delete.StatusCode == HttpStatusCode.Conflict
            && (await erase.Content.ReadAsStringAsync()).Contains("full-screen seasonal artwork", StringComparison.Ordinal)
            && (await Json(after)).GetRawText() == saved.GetRawText(),
            "Actual HTTP cached clients can read but cannot erase a newer full-screen seasonal appearance");
        Capability("6");
        using var removed = await Put(revision, HomeCollectionsAdventChecks.Settings());
        var removedSaved = await Json(removed);
        assert(removed.StatusCode == HttpStatusCode.OK, "Actual HTTP capability 6 may explicitly return to standard expansion");
        Capability("5");
        using var compatible = await Put(removedSaved.GetProperty("Revision").GetString(), HomeCollectionsAdventChecks.Settings());
        assert(compatible.StatusCode == HttpStatusCode.OK, "Actual HTTP capability 5 resumes editing after full-screen expansion is removed");
    }
}
