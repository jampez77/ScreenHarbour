# UK platform trending rows

ScreenHarbour can display six Home rows for Netflix, Prime Video, Disney+, Apple TV+, NOW and Paramount+, each with **Movies** and **Shows** tabs. Each tab reads a separate Jellyfin collection. The same tabs also work with ordinary collections and any labels you choose; SmartLists and MDBList are optional.

This recipe uses SmartLists to maintain twelve source collections from MDBList's official JustWatch UK charts. Only matching titles already in your Jellyfin library appear. ScreenHarbour does not request or download missing media.

## Prepare the sources

Use **SmartLists 12.0.3.0 or newer on Jellyfin 12**. Version 12.0.3.0 fixes official MDBList URLs and preserves their country, period and provider filters. Install the version matching your server and restart Jellyfin. [SmartLists release notes](https://github.com/jyourstone/jellyfin-smartlists-plugin/releases/tag/v12.0.3.0)

In **SmartLists → Settings → External Lists**, configure your own MDBList API key. The key belongs in SmartLists; ScreenHarbour only reads the resulting Jellyfin collections. See [SmartLists external-list setup](https://github.com/jyourstone/jellyfin-smartlists-plugin/blob/v12.0.3.0/docs/content/user-guide/external-lists.md).

Create two SmartLists collections per platform: one with the Movie media type and one with Series. Give them distinct names, such as **Netflix — Trending Movies (UK)** and **Netflix — Trending Shows (UK)**. Configure each with:

| Setting | Value |
| --- | --- |
| Rule | **External List / equals** / the corresponding URL below |
| Sort | **External List Order / Ascending** |
| Max Items | `20` |
| Min Items | `0`, to retain the collection identity when no library titles match |
| Automatic library-event refresh | **Never** |
| Scheduled refresh | **Daily**, staggered five minutes apart in server-local time as listed below |

Refresh the new lists once after saving so their Jellyfin collections are created immediately. Start each refresh only when SmartLists is idle and the previous list has finished. With SmartLists 12.0.3.0, overlapping or queued batch refreshes can reuse chart positions across lists, so avoid **Refresh All** for these sources until that issue is fixed.

Use the following daily schedule to keep the twelve refreshes apart. The times use Jellyfin’s server-local timezone; if a refresh takes longer than five minutes, increase the interval.

| Platform | Movies | Shows |
| --- | --- | --- |
| Netflix | 06:00 | 06:05 |
| Prime Video | 06:10 | 06:15 |
| Disney+ | 06:20 | 06:25 |
| Apple TV+ | 06:30 | 06:35 |
| NOW | 06:40 | 06:45 |
| Paramount+ | 06:50 | 06:55 |

Daily refresh is separate from the chart’s seven-day period: each refresh fetches the current weekly chart. If you use SmartLists’ backup import instead of creating lists manually, importing saves their configuration but does not force this first refresh.

Keep the source collections separate for Movies and Shows. Their rankings are independent, and combining them would not produce a supported overall rank. Existing SmartLists name-prefix and suffix settings may decorate the collection names.

## Source URLs

All links use the UK locale (`en_GB`) and weekly period (`rank=7`). The provider code limits the chart to that service.

| Platform | Movies code | Shows code | Weekly UK sources |
| --- | --- | --- | --- |
| Netflix | `nfx` | `nfx` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=nfx) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=nfx) |
| Prime Video | `amp` | `amp` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=amp) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=amp) |
| Disney+ | `dnp` | `dnp` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=dnp) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=dnp) |
| Apple TV+ | `atp` | `atp` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=atp) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=atp) |
| NOW | `ntc` | `ntv` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=ntc) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=ntv) |
| Paramount+ | `pmp` | `pmp` | [Movies](https://mdblist.com/lists/official/movies/justwatch-streaming-charts?locale=en_GB&rank=7&provider=pmp) · [Shows](https://mdblist.com/lists/official/shows/justwatch-streaming-charts?locale=en_GB&rank=7&provider=pmp) |

NOW uses **NOW Cinema** for Movies and **NOW** for Shows. Paramount+ uses the UK base service, `pmp`. Some provider codes are absent from MDBList's public dropdown; preserve the full URLs above when configuring these sources.

## Add the Home rows

1. In Jellyfin Web's desktop display mode, open **Settings → ScreenHarbour → Collection rows** and add a collection items row.
2. Name the row after the platform, for example **Trending on Netflix**.
3. Choose **Add collection tabs**. The initial labels are **Movies** and **Shows**; select each tab and choose its corresponding SmartLists collection. Change **Tab label** if you want different names.
4. In **Item order**, choose **Collection order** for each tab. This keeps the order supplied by SmartLists. Choosing a title/year sort or manual order instead changes only that tab's Home display.
5. Enable **Ranked artwork** if you want numbered posters. Review each tab in **Home preview** and place the row in **Home position**.
6. Choose **Save rows**. Repeat for the other five platforms.

Use **Add tab**, **Remove tab**, **Move tab left** and **Move tab right** to arrange up to six tabs. The first tab opens by default. Removing tabs until one remains returns the row to its single-collection form. Saved Home settings follow the current Jellyfin account across devices. Configure them in desktop display mode; TV displays the saved rows without an editing button. Source collections are maintained on the Jellyfin server. ScreenHarbour checks loaded collection contents every minute while Home is visible and when the client regains focus. A library scan alone does not refresh these SmartLists collections: wait for their scheduled refresh or refresh the relevant list individually while SmartLists is idle.

## What the numbers mean

JustWatch charts reflect audience activity such as opening streaming offers, adding titles to watchlists and marking them seen. They measure popularity on JustWatch, rather than a streaming service's viewing counts. [JustWatch methodology](https://www.justwatch.com/us/streaming-charts?c=global)

MDBList supplies up to twenty source titles per chart. SmartLists matches them against your library using metadata provider IDs, retaining the source-relative order for those that match. An empty or short row can mean that few chart titles are in your library. It can also result from an MDBList authentication or service error: HTTP 401, 403 and 5xx responses can appear as empty results. Check the server’s SmartLists logs and matching metadata IDs before changing the chart URL. A refresh reporting success does not by itself confirm that the authenticated chart request succeeded.

ScreenHarbour's rank artwork counts visible items as **1, 2, 3…**. If the library contains source positions 2, 5 and 8, the row shows them in that relative order with badges 1, 2 and 3. The badges do not preserve gaps from the external chart or claim to be its original ranking numbers.
