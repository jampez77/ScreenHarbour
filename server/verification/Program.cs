using System.Net;
using System.Reflection;
using System.Reflection.Emit;
using Jellyfin.Plugin.TvItemLayout;
using Jellyfin.Plugin.TvItemLayout.Api;
using Jellyfin.Plugin.TvItemLayout.Integration;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Newtonsoft.Json.Linq;

static void Assert(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    Console.WriteLine("PASS " + message);
}

await PlaybackChecks.Run(Assert);
await PlaybackQueueChecks.Run(Assert);
await TrailerActionsChecks.Run(Assert);
await WatchlistChecks.Run(Assert);
await ProfileSwitchChecks.Run(Assert);
await HomeCollectionsChecks.Run(Assert);
await HomeLibraryExclusionsChecks.Run(Assert);
await LoadingScreenChecks.Run(Assert);
await ProviderHomesChecks.Run(Assert);
await ProviderHomesRestartChecks.Run(Assert);
await ProviderChecks.Run(Assert);

string source = "<!doctype html><HTML><BODY><div>Hello</div><script src='/unrelated.js'></script></BODY></HTML>";
string transformed = IndexHtmlInjector.Inject(source, "/jellyfin/");
Assert(transformed.Contains("src=\"/jellyfin/TvItemLayout/ClientScript?v="), "Configured server base URL is used");
Assert(transformed.Contains("src='/unrelated.js'"), "Existing unrelated script is preserved");
Assert(transformed.EndsWith("</BODY></HTML>"), "Case-insensitive closing body is preserved");
Assert(transformed == IndexHtmlInjector.Inject(transformed, "/jellyfin/"), "Repeated transformation does not duplicate the client");
Assert(IndexHtmlInjector.Inject("<div>fragment</div>", "") == "<div>fragment</div>", "Non-document response remains untouched");
Assert(IndexHtmlInjector.Inject(source, "").Contains("src=\"/TvItemLayout/ClientScript?v="), "Root server URL is used without a configured base URL");

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Services.AddControllers().AddApplicationPart(typeof(ClientScriptController).Assembly);
var app = builder.Build();
app.MapControllers();
await app.StartAsync();
string address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
using HttpClient client = new() { BaseAddress = new Uri(address) };
using var initial = await client.GetAsync("/TvItemLayout/ClientScript");
Assert(initial.StatusCode == HttpStatusCode.OK, "Client asset is anonymously accessible");
Assert(initial.Content.Headers.ContentType?.MediaType == "application/javascript", "Correct JavaScript media type");
Assert(initial.Headers.CacheControl?.NoCache == true, "Unversioned requests always revalidate");
Assert(initial.Headers.ETag?.ToString() == ClientScriptAsset.ETag, "Response ETag matches content digest");
Assert((await initial.Content.ReadAsByteArrayAsync()).SequenceEqual(ClientScriptAsset.Bytes), "Response exactly matches the embedded client bundle");
using var versioned = await client.GetAsync("/TvItemLayout/ClientScript?v=" + ClientScriptAsset.CacheVersion);
Assert(versioned.Headers.CacheControl?.MaxAge?.TotalDays == 365, "Matching content version is cached for a year");
using var stale = await client.GetAsync("/TvItemLayout/ClientScript?v=older-version");
Assert(stale.Headers.CacheControl?.NoCache == true, "Stale version query does not receive immutable caching");
using HttpRequestMessage conditional = new(HttpMethod.Get, "/TvItemLayout/ClientScript");
conditional.Headers.IfNoneMatch.ParseAdd(ClientScriptAsset.ETag);
using var cached = await client.SendAsync(conditional);
Assert(cached.StatusCode == HttpStatusCode.NotModified, "Conditional request returns 304");
Assert((await cached.Content.ReadAsByteArrayAsync()).Length == 0, "304 response has no body");
await SeasonalAssetChecks.Run(Assert, client);
await SeasonalFontChecks.Run(Assert, client);
await new StartupService(app.Services.GetRequiredService<ILogger<StartupService>>())
    .ExecuteAsync(new Progress<double>(), CancellationToken.None);
Assert(true, "Missing FileTransformation is handled without failing startup");

// Exercise the real reflection registration without loading File Transformation or
// a Jellyfin server. Its path lookup chooses an exact pipeline before regex matches.
var transformationAssembly = AssemblyBuilder.DefineDynamicAssembly(
    new AssemblyName("Jellyfin.Plugin.FileTransformation"), AssemblyBuilderAccess.Run);
var interfaceBuilder = transformationAssembly.DefineDynamicModule("RegistrationStub")
    .DefineType("Jellyfin.Plugin.FileTransformation.PluginInterface", TypeAttributes.Public | TypeAttributes.Abstract | TypeAttributes.Sealed);
var registrationField = interfaceBuilder.DefineField("Registration", typeof(JObject), FieldAttributes.Public | FieldAttributes.Static);
var registerMethod = interfaceBuilder.DefineMethod("RegisterTransformation", MethodAttributes.Public | MethodAttributes.Static,
    typeof(void), [typeof(JObject)]);
var registrationCode = registerMethod.GetILGenerator();
registrationCode.Emit(OpCodes.Ldarg_0);
registrationCode.Emit(OpCodes.Stsfld, registrationField);
registrationCode.Emit(OpCodes.Ret);
var interfaceType = interfaceBuilder.CreateType()!;

await new StartupService(app.Services.GetRequiredService<ILogger<StartupService>>())
    .ExecuteAsync(new Progress<double>(), CancellationToken.None);
var registration = (JObject?)interfaceType.GetField("Registration")!.GetValue(null);
Assert(registration is not null, "Startup registers with the File Transformation reflection interface");
Assert(registration!["fileNamePattern"]?.Value<string>() == "index.html",
    "Registration shares the exact index.html pipeline with other web plugins");
Assert(registration["id"]?.Value<string>() == Plugin.PluginId,
    "Registration uses the independent TV Item Layout plugin ID");
await app.StopAsync();
