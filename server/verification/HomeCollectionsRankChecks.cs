using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.TvItemLayout.Api;
using Microsoft.AspNetCore.Mvc;

public static class HomeCollectionsRankChecks
{
    public static JsonElement Settings(string rankStyle = "nightmare")
    {
        var settings = JsonNode.Parse(HomeCollectionsAppearanceChecks.Settings().GetRawText())!.AsObject();
        Appearance(settings)["rankStyle"] = rankStyle;
        settings["rows"]![1]!["children"]![1]!["appearance"]!["rankStyle"] = "standard";
        return JsonSerializer.SerializeToElement(settings);
    }

    private static JsonObject Appearance(JsonObject settings) => settings["rows"]![1]!["children"]![0]!["appearance"]!.AsObject();

    public static async Task Run(Action<bool, string> assert, HomeCollectionsController controller,
        HomeCollectionsController second, string revision)
    {
        HomeCollectionsResponse Value(IActionResult result) => (HomeCollectionsResponse)((OkObjectResult)result).Value!;
        var settings = Settings();
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
        var saved = Value(await controller.PutHomeCollections(new(revision, settings)));
        assert(saved.Settings!.Value.GetRawText() == settings.GetRawText()
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Capability 4 persists independent themed and standard seasonal rank artwork across controller instances");
        var original = HomeCollectionsAppearanceChecks.Settings();
        var empty = JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() });
        foreach (var capability in new[] { "", "2", "3", "3,4", "7" })
        {
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = capability;
            assert(Value(await controller.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
                "Clients can still read seasonal rank settings with capability " + capability);
            assert(await controller.PutHomeCollections(new(saved.Revision, original)) is ConflictObjectResult
                && await controller.PutHomeCollections(new(saved.Revision, empty)) is ConflictObjectResult,
                "Clients without rank capability cannot strip rank overrides or delete configured rows with capability " + capability);
        }
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
        async Task Reject(string reason, Action<JsonObject> mutate)
        {
            var invalid = JsonNode.Parse(settings.GetRawText())!.AsObject(); mutate(invalid);
            assert(await controller.PutHomeCollections(new(saved.Revision, JsonSerializer.SerializeToElement(invalid))) is BadRequestObjectResult,
                "Seasonal rank validation rejects " + reason);
        }
        await Reject("null", value => Appearance(value)["rankStyle"] = null);
        await Reject("numbers", value => Appearance(value)["rankStyle"] = 1);
        await Reject("booleans", value => Appearance(value)["rankStyle"] = true);
        await Reject("objects", value => Appearance(value)["rankStyle"] = new JsonObject());
        await Reject("arrays", value => Appearance(value)["rankStyle"] = new JsonArray());
        await Reject("unknown styles", value => Appearance(value)["rankStyle"] = "automatic");
        await Reject("arbitrary image URLs", value => Appearance(value)["rankStyle"] = "https://example.test/image");
        await Reject("nightmare Christmas ranks", value => value["rows"]![1]!["children"]![1]!["appearance"]!["rankStyle"] = "nightmare");
        var duplicate = settings.GetRawText().Replace("\"rankStyle\":\"nightmare\"", "\"rankStyle\":\"nightmare\",\"rankStyle\":\"standard\"");
        assert(await controller.PutHomeCollections(new(saved.Revision, JsonDocument.Parse(duplicate).RootElement)) is BadRequestObjectResult,
            "Seasonal rank validation rejects duplicate JSON fields");
        assert(Value(await second.GetHomeCollections()).Revision == saved.Revision
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Rejected rank edits preserve every saved setting and the revision");
        foreach (var style in new[] { "classic", "storybook", "photoreal", "nightmare", "standard" })
        {
            var styled = Settings(style);
            saved = Value(await controller.PutHomeCollections(new(saved.Revision, styled)));
            assert(saved.Settings!.Value.GetRawText() == styled.GetRawText(), "Seasonal ranks persist the " + style + " choice");
        }
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "3";
        assert(await controller.PutHomeCollections(new(saved.Revision, original)) is ConflictObjectResult,
            "An explicit standard rank choice is protected from legacy appearance clients");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
        var followFrames = Value(await controller.PutHomeCollections(new(saved.Revision, original)));
        assert(followFrames.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 4 can deliberately clear rank overrides to follow the frames without altering existing appearance");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "3";
        var legacyCompatible = Value(await controller.PutHomeCollections(new(followFrames.Revision, original)));
        assert(legacyCompatible.Settings!.Value.GetRawText() == original.GetRawText(),
            "Capability 3 can keep editing original appearance once rank overrides have been intentionally removed");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "4";
        var cleared = Value(await controller.PutHomeCollections(new(legacyCompatible.Revision, empty)));
        assert(cleared.Settings!.Value.GetProperty("rows").GetArrayLength() == 0,
            "Capability 4 also satisfies original seasonal and appearance guards when intentionally deleting rows");
        await HomeCollectionsAdventChecks.Run(assert, controller, second, cleared.Revision!);
    }
}
