using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.TvItemLayout.Api;
using Microsoft.AspNetCore.Mvc;

public static class HomeCollectionsAppearanceChecks
{
    public static JsonElement Settings()
    {
        var settings = JsonNode.Parse(HomeCollectionsSeasonalChecks.Settings().GetRawText())!;
        settings["rows"]![1]!["children"]![0]!["appearance"] = JsonSerializer.SerializeToNode(new
            { theme = "halloween", background = "parallax", expansion = "large", frame = true, reveal = "shutters", backgroundStyle = "nightmare", frameStyle = "photoreal", coverStyle = "storybook" });
        settings["rows"]![1]!["children"]![1]!["appearance"] = JsonSerializer.SerializeToNode(new
            { theme = "christmas", background = "static", expansion = "medium", frame = false, reveal = "doors" });
        return JsonSerializer.SerializeToElement(settings);
    }

    public static async Task Run(Action<bool, string> assert, HomeCollectionsController controller,
        HomeCollectionsController second, string revision)
    {
        HomeCollectionsResponse Value(IActionResult result) => (HomeCollectionsResponse)((OkObjectResult)result).Value!;
        var settings = Settings();
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "3";
        var saved = Value(await controller.PutHomeCollections(new(revision, settings)));
        assert(saved.Settings!.Value.GetRawText() == settings.GetRawText()
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Seasonal appearance persists both themes and all decoration fields across controller instances");

        var undecorated = HomeCollectionsSeasonalChecks.Settings();
        var empty = JsonSerializer.SerializeToElement(new { version = 1, rows = Array.Empty<object>() });
        foreach (var capability in new[] { "", "2", "3,2", "7" })
        {
            controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = capability;
            assert(Value(await controller.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
                "Previous clients can still read seasonal rows containing appearance with capability " + capability);
            assert(await controller.PutHomeCollections(new(saved.Revision, undecorated)) is ConflictObjectResult
                && await controller.PutHomeCollections(new(saved.Revision, empty)) is ConflictObjectResult,
                "Clients without appearance capability cannot strip decorations or delete decorated rows with capability " + capability);
        }
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "3";

        static JsonObject Appearance(JsonObject value) => value["rows"]![1]!["children"]![0]!["appearance"]!.AsObject();
        async Task Reject(string reason, Action<JsonObject> mutate)
        {
            var value = JsonNode.Parse(settings.GetRawText())!.AsObject(); mutate(value);
            assert(await controller.PutHomeCollections(new(saved.Revision, JsonSerializer.SerializeToElement(value))) is BadRequestObjectResult,
                "Seasonal appearance validation rejects " + reason);
        }
        foreach (var field in new[] { "theme", "background", "expansion", "frame", "reveal" })
        {
            await Reject("missing " + field, value => Appearance(value).Remove(field));
            await Reject("null " + field, value => Appearance(value)[field] = null);
        }
        await Reject("unknown properties", value => Appearance(value)["css"] = "position:fixed");
        await Reject("unknown themes", value => Appearance(value)["theme"] = "custom");
        await Reject("arbitrary background URLs", value => Appearance(value)["background"] = "https://example.test/image");
        await Reject("numeric expansion", value => Appearance(value)["expansion"] = 2);
        await Reject("non-boolean frame", value => Appearance(value)["frame"] = "true");
        foreach (var style in new[] { "backgroundStyle", "frameStyle", "coverStyle" }) {
            await Reject("unknown " + style, value => Appearance(value)[style] = "https://example.test/image");
            await Reject("null " + style, value => Appearance(value)[style] = null);
            await Reject("non-string " + style, value => Appearance(value)[style] = 1);
            await Reject("nightmare Christmas " + style, value => value["rows"]![1]!["children"]![1]!["appearance"]![style] = "nightmare");
        }
        await Reject("nightmare art on Christmas", value => Appearance(value)["theme"] = "christmas");
        await Reject("unknown reveal", value => Appearance(value)["reveal"] = "open");
        await Reject("appearance on root rows", value => value["rows"]![0]!["appearance"] = Appearance(value).DeepClone());
        await Reject("appearance on the seasonal group", value => value["rows"]![1]!["appearance"] = Appearance(value).DeepClone());
        await Reject("null appearance", value => value["rows"]![1]!["children"]![0]!["appearance"] = null);
        await Reject("non-object appearance", value => value["rows"]![1]!["children"]![0]!["appearance"] = new JsonArray());
        var duplicate = settings.GetRawText().Replace("\"theme\":\"halloween\"", "\"theme\":\"halloween\",\"theme\":\"christmas\"");
        assert(await controller.PutHomeCollections(new(saved.Revision, JsonDocument.Parse(duplicate).RootElement)) is BadRequestObjectResult,
            "Seasonal appearance rejects duplicate JSON fields instead of choosing a theme");
        assert(Value(await second.GetHomeCollections()).Revision == saved.Revision
            && Value(await second.GetHomeCollections()).Settings!.Value.GetRawText() == settings.GetRawText(),
            "Rejected appearance edits preserve the complete saved settings and revision");

        var disabled = JsonNode.Parse(settings.GetRawText())!.AsObject();
        Appearance(disabled)["background"] = "none"; Appearance(disabled)["expansion"] = "none";
        Appearance(disabled)["frame"] = false; Appearance(disabled)["reveal"] = "none";
        disabled["rows"]![1]!["children"]![2]!["appearance"] = Appearance(disabled).DeepClone();
        var disabledSaved = Value(await controller.PutHomeCollections(new(saved.Revision, JsonSerializer.SerializeToElement(disabled))));
        assert(disabledSaved.Settings!.Value.GetProperty("rows")[1].GetProperty("children")[2].GetProperty("appearance").GetProperty("frame").ValueKind == JsonValueKind.False,
            "Individual effects can all be disabled and watchlist children support the same appearance settings");
        var styles = JsonNode.Parse(disabledSaved.Settings.Value.GetRawText())!.AsObject();
        Appearance(styles)["backgroundStyle"] = "classic"; Appearance(styles)["frameStyle"] = "storybook";
        Appearance(styles)["coverStyle"] = "photoreal";
        styles["rows"]![1]!["children"]![1]!["appearance"]!["backgroundStyle"] = "photoreal";
        styles["rows"]![1]!["children"]![1]!["appearance"]!["frameStyle"] = "classic";
        styles["rows"]![1]!["children"]![1]!["appearance"]!["coverStyle"] = "storybook";
        var styled = Value(await controller.PutHomeCollections(new(disabledSaved.Revision, JsonSerializer.SerializeToElement(styles))));
        assert(styled.Settings!.Value.GetRawText() == JsonSerializer.SerializeToElement(styles).GetRawText(),
            "Halloween and Christmas persist independently chosen background, frame and cover packs");
        foreach (var child in styles["rows"]![1]!["children"]!.AsArray())
            if (child!["appearance"] is JsonObject appearance)
                foreach (var field in new[] { "backgroundStyle", "frameStyle", "coverStyle" }) appearance.Remove(field);
        var originalShape = Value(await controller.PutHomeCollections(new(styled.Revision, JsonSerializer.SerializeToElement(styles))));
        assert(originalShape.Settings!.Value.GetProperty("rows")[1].GetProperty("children")[0].GetProperty("appearance").EnumerateObject().Count() == 5,
            "Capability 3 still accepts original five-field appearance settings without requiring optional art styles");
        var removed = Value(await controller.PutHomeCollections(new(originalShape.Revision, undecorated)));
        assert(removed.Settings!.Value.GetRawText() == undecorated.GetRawText(),
            "Capability 3 can intentionally remove every decoration while preserving seasonal content");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "2";
        var oldSaved = Value(await controller.PutHomeCollections(new(removed.Revision, undecorated)));
        assert(oldSaved.Settings!.Value.GetRawText() == undecorated.GetRawText(),
            "Capability 2 remains compatible once all appearance settings are intentionally removed");
        controller.Request.Headers["X-ScreenHarbour-Home-Rows"] = "3";
        var cleared = Value(await controller.PutHomeCollections(new(oldSaved.Revision, empty)));
        assert(cleared.Settings!.Value.GetProperty("rows").GetArrayLength() == 0,
            "Capability 3 also satisfies the original seasonal and shuffle overwrite guard");
        await HomeCollectionsRankChecks.Run(assert, controller, second, cleared.Revision!);
    }
}
