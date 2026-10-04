# ScreenHarbour

**A cinematic interface for Jellyfin.**

> **Fully vibe coded — use at your own risk.**
>
> This project was built using Codex. I have not read or reviewed the code myself. My involvement has been choosing features, directing the design and testing the interface on my own setup.

![ScreenHarbour](assets/catalogue/screenharbour.png)

Cinematic browsing for Jellyfin’s **TV and desktop layouts**, inspired by Netflix and built using the integration and remote-control patterns from [InPlayerEpisodePreview-TV](https://github.com/jampez77/InPlayerEpisodePreview-TV). ScreenHarbour is an independent project, not affiliated with or endorsed by Jellyfin. The name follows [Jellyfin’s third-party branding guidance](https://jellyfin.org/docs/general/contributing/branding/). Formerly **Jellyfin Cinema** and **TV Item Layout**, with the same plugin identity and upgrade path.

[**Try the demo**](https://jampez77.github.io/ScreenHarbour/?layout=desktop&featured=0#/home) · [Screenshots](#screenshots) · [Install](#install) · [Release notes](docs/releases/v0.2.47.md)

This plugin brings one cinematic style to Home, Movies, TV Shows, Music, Recordings, Collections and the main Live TV guide. It also includes provider Home pages, browsing during video playback and a pause screen. Media artwork, metadata, collections, recommendations, favourites and playback positions come from your signed-in Jellyfin library. Provider pages match that library to UK streaming availability from JustWatch through TMDB, with Disney studio titles also included on Disney+.

**0.2.47 is available as a prerelease** ([release notes](docs/releases/v0.2.47.md)) for Jellyfin 10.10.7, 10.11.x and 12.x. TV mode now uses smaller, more compressed photographic seasonal artwork, and seasonal backgrounds load as their rows approach the viewport. Row positions and item browsing remain available immediately. Desktop retains the original artwork; all saved settings and seasonal effects are preserved. Update the plugin, restart Jellyfin and fully reopen clients.

## Try the demo

**[Open the interactive demo →](https://jampez77.github.io/ScreenHarbour/?layout=desktop&featured=0#/home)**

Explore Home, movie details, seasons and episodes, streaming-service pages, collections, Music and Live TV in your browser. Try the collection-row editor and its live preview, give seasonal rows Halloween or Christmas decorations, configure the streaming-service tiles and rows, or preview the six loading animations with your own text.

Choose [desktop mode](https://jampez77.github.io/ScreenHarbour/?layout=desktop&featured=0#/home) or [TV mode](https://jampez77.github.io/ScreenHarbour/?layout=tv&featured=0#/home). Both use the real ScreenHarbour layout with fictional library data. No installation, Jellyfin server or sign-in is needed. Playback is simulated, and demo preferences stay in your browser. Provider assignments and chart rankings are examples, not live streaming listings.

The demo follows the latest code on `main`, which may be ahead of an installed release. It does not reproduce Jellyfin's native video player or every native Settings page. See [demo scenarios](demo/README.md) for what you can explore, or [run it locally](#preview-locally).

## Screenshots

Captured from an installed Jellyfin library with real films and shows, including **Dune: Part Two**, **Bluey** and **No Time to Die**. These show desktop display mode; TV mode shares the visual design with remote focus and TV-specific controls. The Home views show streaming-service tiles, ranked trending collections and the optional Jellyfin Featured plugin. These historical captures predate the ScreenHarbour rebrand and may show the former Cinema name; they illustrate the same layouts. Select an image to view it at full size.

| Home: streaming services | Home: ranked trending films |
| --- | --- |
| [![Home before the ScreenHarbour rebrand, with media libraries and Netflix, Prime Video, Disney+, Apple TV+ and NOW service tiles](docs/screenshots/home-services.jpg)](docs/screenshots/home-services.jpg) | [![Home before the ScreenHarbour rebrand, with the Netflix Trending Today collection, numbered film posters and Movies and Shows tabs](docs/screenshots/home-trending.jpg)](docs/screenshots/home-trending.jpg) |
| Open your configured streaming services directly from Home. | Browse ranked trending films alongside your other Home rows. |

| Home: featured film | Movie details |
| --- | --- |
| [![Home before the ScreenHarbour rebrand, with The Return of the King featured banner and library rows](docs/screenshots/home.jpg)](docs/screenshots/home.jpg) | [![Dune: Part Two details with title artwork, playback controls and Ends at](docs/screenshots/movie-details.jpg)](docs/screenshots/movie-details.jpg) |
| A featured film and your media libraries. | Dune: Part Two with playback actions and a finish-time estimate. |

| Seasons and episodes | Streaming services |
| --- | --- |
| [![Bluey season browser with real episode artwork, descriptions and watched controls](docs/screenshots/episodes.jpg)](docs/screenshots/episodes.jpg) | [![Netflix service page with ranked film posters including Practical Magic and Dune: Part Two](docs/screenshots/streaming-service.jpg)](docs/screenshots/streaming-service.jpg) |
| Browse seasons, resume episodes and manage watched status. | Branded pages with configurable collection rows and numbered artwork. |

| Collection-row editor | Live TV guide |
| --- | --- |
| [![Collection-row editor with real film posters and a live Home preview](docs/screenshots/collection-editor.jpg)](docs/screenshots/collection-editor.jpg) | [![Live TV guide showing No Time to Die, channel rows and a horizontal schedule](docs/screenshots/live-tv.jpg)](docs/screenshots/live-tv.jpg) |
| Choose collections, arrange their items and preview your Home rows. | Programme artwork, broadcast times and a browsable channel schedule. |

## The layouts

- **Home:** cinematic cards with titles and subtitles on the charcoal page surface. Your native user/device section choices and ordering, hidden libraries, latest-media exclusions, Continue listening/reading, Next up options and library destinations stay controlled by Jellyfin. Native, streaming-service and collection rows coordinate their first reveal, with a bounded fallback if loading stalls. Background refreshes keep existing rows visible. Native and custom cards use thumbnail-only focus borders, and custom rows hide their horizontal scrollbars. In desktop display mode, configure custom collection rows from **Collections → Customize Home rows**, including their item order, optional numbered artwork and position among native Home sections. Optional tabs switch between collections within one row, with a live preview while you edit. [Jellyfin Featured](https://github.com/spkesDE/jellyfin-featured-plugin) matches the cinematic colours and typography while keeping its own carousel, settings, trailers and remote controls.
- **Streaming services:** branded Home tiles for Netflix, Prime Video, Disney+, Apple TV+, NOW, Paramount+, BBC iPlayer, ITVX and Channel 4 open distinct provider pages with featured artwork and configurable Films, TV shows, trending or collection rows. **View all** opens the complete matching row with pagination. Configure service order, visibility, Home placement and each provider's rows in **Settings → ScreenHarbour → Streaming services**; desktop provider pages also offer **Edit service**. Editing controls stay off TV provider pages and the main Home screen. Full catalogue rows use configured subscription, free or ad-supported UK availability for titles in your library. Trending rows use the separately maintained chart collections. [Provider Home guide](docs/provider-homes.md)
- **Music:** the Playlists entry in My Media and Jellyfin’s navigation opens ScreenHarbour’s playlist view. Browse albums, album artists, artists, songs, playlists, genres, suggestions and favourites, with search and A–Z/#. Playlist detail pages show ordered track rows with artwork and duration. Play the whole playlist or start at a selected entry, preserving repeated tracks and the complete queue. Album Play buttons have space for their focus outline. Jellyfin’s native music player and Now playing queue use larger album artwork, clear track details and matching queue rows while retaining their playback controls and actions.
- **Recordings:** completed and active recordings, search and pagination, with direct details/playback. Recording folders opened from the Home library tile also use this layout and keep browsing scoped to that folder. Schedule, Series recordings, recording details and DVR dialogs receive matching styling while keeping Jellyfin’s native permissions, scheduling and editing actions.

- **Profiles:** in TV or desktop mode, select your avatar to open **Who’s watching?**, a full-screen chooser with large square profile artwork, names and remote focus. Select your current profile to return, or an eligible passwordless profile to open its Home directly. Profiles marked **Sign in** and hidden accounts use native sign-in. **Settings**, **Use login screen**, **Back**, and **Dashboard** for the signed-in administrator sit below the profiles. The server checks current eligibility instead of relying on Jellyfin 12’s obsolete password flags. ScreenHarbour does not store extra credentials or change password requirements. Mobile retains Jellyfin’s current avatar and account menu.
- **Search and Settings:** the native search field, remote alphabet keyboard, suggestions/results and user preference forms share the ScreenHarbour layout. Settings includes personal Streaming services and Loading screen preferences, plus Dashboard for the signed-in administrator, with permission checked again on selection.
- **Loading screen:** choose a film projector, clapperboard, film reel, cinema countdown, spotlights or the Jellyfin logo in **Settings → ScreenHarbour → Loading screen**. Preview an editable title and message, or leave either blank to hide it. The saved title also replaces interface wordmarks, including the Settings section heading, profile chooser and login. Signed-in choices follow your account across devices; before sign-in, each device uses its last confirmed title for that server, or the default until an account has synced. Drafts stay in the preview until **Save**, including Restore defaults. Cached choices display immediately, and refreshing their settings never delays Home. The animation appears during the first Home load; return visits keep their existing fast loading behavior.
- **Desktop administration:** signed-in administrators get **More** on supported media pages, opening Jellyfin's native item menu for **Edit metadata**, **Edit images**, **Refresh metadata**, **Identify** and other actions appropriate to that item. Jellyfin retains its editor forms, permission checks and confirmations. If the menu cannot open in the current client, ScreenHarbour opens the original item page. These management controls stay off TV layouts and non-administrator accounts.
- **Login:** large profile cards, a matching password form, readable focus states and themed native Quick Connect/error dialogs in TV and desktop display modes. Native authentication and saved device layout remain in control.
- **Native folder libraries:** mixed-content and historic recording libraries receive matching headings, controls and cards while retaining native contents, filters and navigation. A previous recording library can differ from the server’s current DVR library; ScreenHarbour styles both without merging or redirecting them.

- **TV Shows library:** opens Suggestions by default, followed by Watchlist, Favourites, Genres, Collections and **All shows** last. Search and A–Z/# filters help find a title. Suggestions show Jellyfin’s Continue watching, Next up and Recently added items, with episode titles and numbers.
- **TV Show details:** backdrop and title artwork, next-episode/resume action, and a dedicated browser with seasons on the left and episode thumbnails, synopses and watch progress on the right. Down from a season’s last episode opens the next season’s first episode; Up from its first episode opens the previous season’s last. **Ends at** beside the ratings estimates when the selected episode will finish, including in the series hero, and uses the remaining duration when resuming. Season and episode detail links open the corresponding show. Scroll down for collection links and More like this recommendations.
- **Movies library:** opens Suggestions by default, followed by Watchlist, Favourites, Genres, Collections and **All movies** last, with search and A–Z/# title filters. Suggestions use Jellyfin’s continue-watching, recently-added and recommendation lists. Browse in pages, open a film and return to the same filters and selected card.
- **Movie details:** a large backdrop, title, Play/Resume, a trailer button with a clapperboard icon, favourites, runtime/rating/quality when available, cast and genres, and a More like this grid. **Ends at** beside the ratings estimates the finish time from the current clock and remaining runtime, and updates while the page stays open. Trailer playback uses Jellyfin’s own trailer action or an available local trailer; unavailable trailers show a clear message. Recommendations open their own detail pages. Collection cards show which collections contain the movie and open their collection pages in the same style.
- **Collections:** a cinematic collections list and individual collection pages with artwork, descriptions and a remote-friendly grid. **Customize Home rows** opens the Home row editor from this page in desktop display mode; TV displays saved rows without the editing control. Use **Add to collection** from media details to choose an existing collection or create one when your account has permission. Existing memberships are shown and refreshed after saving. Open a member or nested collection, then use Back to return to the selected card.
- **Live TV:** current programme, broadcast times and live progress, plus a landscape guide with channel rows and programmes laid out horizontally under a shared time axis. The highlighted programme’s artwork keeps its original proportions on the right and blends into the background, confined above the schedule, with its title, synopsis and live/upcoming status over a left fade. Missing or failed programme artwork falls back to the channel logo. Left/Right moves through a channel’s schedule; Up/Down moves between channels. Select a currently live programme or a channel name to tune that channel. Future programmes show details without changing playback. The hero has no separate Watch live button, and the guide has no channel-count footer.

- **During playback:** Down from the bottom playback control, or the Browse icon in desktop layout, opens episodes across every available season, similar films, or live channels. This includes the seek slider when a theme places it below the buttons. The compact icon leaves the native control bar sizing intact and has a tooltip and accessible label. A season selector jumps directly to that season’s first available episode; playback changes only when you choose Play/Resume. Left/Right browses, OK plays/resumes, and Back returns to playback. Episode browsing wraps across seasons and the whole series. Cinema intros use the current device’s queue to identify the upcoming feature. A new selection stays open until local playback is confirmed, with a retry if it fails.
- **Watchlist:** save or remove a film or whole TV show from its details. Browse **Movies → Watchlist** or **TV Shows → Watchlist**, with search, A–Z filters and return focus. Add a mixed row through **Collections → Customize Home rows → Add Watchlist row**, then choose its title, position and order. In a streaming service’s settings, **Add Watchlist row** shows saved films and series matched to that service’s catalogue, including Disney studio titles when Disney+ is selected. Both Home row types are optional, appear only when they contain items, and remain separate from Favourites.
- **Cinema trailers:** before a film, **Skip trailer** advances one trailer through Jellyfin's existing queue. **Add to watchlist** saves the film advertised by that trailer to the signed-in user's private **Watchlist**, available in **Movies → Watchlist**; saved films also remain in the native playlist under **Playlists**. The controls appear from the first trailer and remain available over the pause screen. Skip keeps the next video playing. Add shows **In watchlist** after saving and avoids duplicate entries. This works with Cinema Mode's local movie trailers; if Jellyfin cannot identify the advertised film, the watchlist button stays unavailable. Standalone trailers, theme videos and custom cinema bumpers do not receive these controls.
- **Pause screen:** Logo/title, metadata, synopsis and optional disc artwork appear when video is paused, without a redundant “Paused” label. Missing logo/disc art can come from the season or series; the synopsis stays with the playing item. Cinema trailers use the server-confirmed advertised movie’s title, synopsis and artwork. The treatment yields to native dialogs and in-player browsing, and disappears on resume.

Working standalone InPlayerEpisodePreview-TV controls take precedence to avoid duplicate previews. A failed or stale preview script no longer blocks Down from opening the integrated browser. The standalone PauseScreen plugin still takes precedence over the integrated pause treatment.

Movie and series pages reveal Jellyfin’s existing theme video behind readable gradients when it is playing. Theme playback remains controlled by Jellyfin’s user settings; the plugin does not start another stream. Static artwork returns when the video is unavailable. Native page controls are hidden visually while our layout is open, while remaining available to Jellyfin’s playback actions.

During live video, exposed **ChannelUp / ChannelDown** commands or channel keys step through the same permitted channel order as the guide. A held key does not repeatedly retune. LG lists programme +/− as unavailable to web apps on some devices, so physical delivery needs testing; if those keys do not reach Jellyfin, use **Down → Channels** to choose a channel. See [LG’s remote-key documentation](https://webostv.developer.lge.com/develop/guides/magic-remote).

Open **Live TV** from Jellyfin's navigation (`web/#/livetv?collectionType=livetv`) to use the main guide. **Channels & guide** on a channel's detail page links to that same guide. Use arrows to navigate, **OK / Enter** to select, and **Back / Escape** to return. Episode and guide lists scroll as focus moves. Pointer controls also work.

The plugin activates in Jellyfin Web’s TV and desktop display modes. Mobile mode retains its normal pages. Web-based TV clients can load it; native clients with independent interfaces cannot. CSS and JavaScript include fallbacks for webOS 6’s Chromium 79 engine. Physical remotes and an actual Jellyfin server still need installation testing.

Home Screen Sections compatibility also respects both native visibility checkboxes—**Display on home screen** and **Display in home screen sections such as Recently Added Media and Continue Watching**—for that plugin's extra per-library **Recently Added** rows. Saved exclusions are read for the signed-in account and matched by library ID, including after a rename. For user-specific views such as Playlists, the server also resolves the underlying folder ID. Re-enable Home visibility to restore the row. This does not change My Media shortcuts, deliberately selected custom collection rows or aggregate third-party sections that do not identify a single library.

## Your Home collection rows

In desktop display mode, open **Collections → Customize Home rows**. Choose a row from the row list, then edit it in one workspace:

- **Content:** select several collections for a Collections row, or a source collection for a collection items row. Item rows can have up to six named tabs, each with its own source collection. Set a row title and optionally enable Ranked artwork.
- **Item order:** keep the collection’s order, sort members by title or year, or move them into a custom order. Each tab has its own source and item order. Collection cards can also be reordered. These changes affect this Home row only, not the server’s collection order.
- **Home position:** move your row between existing Home sections, including Featured and each library’s Latest row. Visit Home once if its sections are not listed. A row falls back to the end when its chosen section is unavailable.

Choose **Add seasonal group** to reserve one position for seasonal content, then add named collection, collection-items or Watchlist sub-rows. Set each sub-row's start and end month/day: **1 October–31 October** for Halloween, or **1 December–6 January** for Christmas. Both endpoints are included, the dates repeat annually, and ranges can cross New Year. The viewing device's local calendar determines visibility. Each sub-row keeps the usual content, tabs, artwork and ordering options. Use the group's **Home position** to move all its active sub-rows together; arrange overlapping seasons within the group. Only child row names appear on Home. When no child is in season, the group creates no section or blank space.

A seasonal sub-row also has an **Appearance** tab. Choose **Normal**, **Halloween** or **Christmas**, then configure its scenery and items independently:

- **Background:** none, static scenery behind the scrolling items, or gently moving parallax scenery. The top and bottom fade into Home's background.
- **Height when focused:** standard height, roomier (up to 1.5×), or immersive (up to 2×). Extra space reveals more scenery; posters keep their size. Growth is limited to the available screen space and ends when item focus leaves the row.
- **Artwork styles:** choose scenery, frames and doors/shutters independently. **Illustrated** and **Playful / family** suit both seasons; **Photorealistic** adds atmospheric Halloween or cosy Christmas imagery. Halloween also offers **Nightmare — very scary**, intended for adult horror collections. Selecting Christmas removes any Nightmare choices. Illustrated is the default.
- **Themed item frames:** spooky window frames or festive advent-style frames.
- **Rank number style:** enable **Ranked artwork** in Content to theme the number images beside posters. **Match frame style** follows the selected frame artwork by default. Choose **Standard numbers**, **Illustrated**, **Playful / family**, **Textured**, or Halloween-only **Nightmare** independently in Appearance. The preview updates immediately.
- **Item reveal:** always visible, opening doors, window shutters or drawing curtains. A covered item's artwork and title appear when focused or hovered and close when you move away. Christmas doors show sequential numbers; these are item positions, not calendar locks.
- **Advent calendar doors:** Christmas collection-item rows can use a numbered single-opening flap for each film, independently of Ranked artwork. Choose Illustrated, Playful / family or Gilded winter wood. **Daily from season start** opens door 1 on the start date, door 2 the following local day, and so on; a 1 December start makes a traditional advent calendar. Future doors stay closed and show their opening date. **Open any door on focus** removes the date restriction. Daily calendars ignore shuffle and use your Item order; keep the source collection and ordering fixed during the calendar if each film should retain its day. Preview doors always open, even outside the season. Calendar doors affect this Home row; they do not restrict access to films elsewhere in Jellyfin.

The live preview uses the same scenery and focus behavior as Home. **Save rows** applies your choices to the account; **Cancel** discards the draft. Normal removes all optional decoration. Decorations do not change season dates, and out-of-season rows still take no space. Reduced-motion preferences disable animated transitions and parallax movement. Existing rows remain normal until you choose a theme; no settings migration is needed. Generated photorealistic artwork is bundled with the plugin and demo, with no external image-service requests during use.

Under **Item order**, enable **Shuffle on load** for a normal row or a seasonal sub-row. Home shuffles its collection tiles or members on each visit. Background refreshes keep the current order stable and add new members without rearranging the existing ones. Saved manual ordering and Jellyfin collections are unchanged; turning shuffle off restores the chosen order. The editor shows a sample shuffle.

The **Home preview** shows the selected row’s title, artwork and chosen item order, including ranked number images and the selected collection tab when enabled. It updates as you edit so you can review the result before saving. The position context shows where the row will appear among your Home sections. Missing-artwork placeholders stay inside their thumbnails, keeping the editor controls usable.

Choose **Save rows** to apply your changes. Ranked artwork uses large SVG number images to the left of posters, with standard outlines on normal rows or themed artwork on seasonal rows. Numbers follow the row’s chosen item order, not popularity scores. Existing saved rows keep their collection order and end-of-Home position until you change them.

For platform charts, use one row per service with separate **Movies** and **Shows** tabs. The [UK platform trending setup](docs/platform-trending.md) explains optional SmartLists/MDBList sources for Netflix, Prime Video, Disney+, Apple TV+, NOW, Paramount+, BBC iPlayer, ITVX and Channel 4. Existing Jellyfin collections work without those integrations.

These choices now sync through your Jellyfin server for the signed-in account, including row titles, sources, tabs, ranking, item order, shuffle, seasonal dates, appearance and Home position. If upgrading from an older device-only release, open Home once in the desktop browser where you configured your rows so it can migrate them. Then reopen Home on the TV using the same account; an already-open Home checks for updates every minute and when it regains focus. The server copy wins if devices disagree; concurrent edits prompt you to reload instead of overwriting another device. Local storage is an offline cache. Home sync failures stay quiet and retry automatically; the collection editor still reports failed loads and saves. The standalone demo remains local-only. Existing version-1 settings are preserved, and native Jellyfin Home preferences remain separate. You can save up to 12 top-level rows or seasonal groups, with up to 12 sub-rows per seasonal group, select up to 40 collections in each Collections row, and store a manual order of up to 2,000 item IDs per row. Home displays up to 60 members from the selected source in an item row; larger sources end with **View full collection**. Existing single-collection rows keep their previous behavior.

## Your provider Home pages

Select a tile in **Streaming services** on Home. The provider logo and name remain visible while you browse its films, TV shows and trending rows. Only titles visible to the signed-in Jellyfin account appear; selecting one opens its ScreenHarbour details and existing Jellyfin playback.

Open **Settings → ScreenHarbour → Streaming services** to arrange the tiles, set their size (70–150%), show or hide their name labels, rename or move the Home row, and choose a provider to edit. Add custom services and edit service names, logos, colours and catalogue sources; restore built-in defaults or remove services as needed. Each provider supports up to 12 rows: rename, reorder, show/hide, choose a source or collection override, select title/release-year sorting, and enable rank artwork. The editor previews the Home tiles and selected content row, including unsaved source changes. BBC iPlayer, ITVX and Channel 4 start with Films and TV shows; use your own collections for their trending rows. Changes apply only after **Save changes**, and sync to the same account on other devices. Native Home preferences and collection-row settings remain separate.

Automatic **Films** and **TV shows** check the library's TMDB metadata IDs against UK availability. The original six presets include subscription (`flatrate`) offers; BBC iPlayer, ITVX and Channel 4 include free and ad-supported offers. Under **Automatic catalogue matching**, choose services by name in searchable **Film services** and **TV services** lists, and select the offer types. ScreenHarbour reuses the installed Jellyfin TMDB integration on the server; no extra key belongs in the browser. The first lookup fills rows progressively, and successful availability results are cached for seven days. Rental and purchase offers do not count as streaming matches. Selecting Disney+ also includes titles whose Jellyfin studio metadata identifies a recognised Disney studio, regardless of current streaming offers. This includes Walt Disney Pictures/Animation, Pixar, Marvel Studios, Lucasfilm, 20th Century and Searchlight production labels; other services continue to use availability matching.

**Trending films** and **Trending TV shows** use the collection you choose, saved by its stable Jellyfin ID. On a desktop service page, choose **Edit service**, select a row, pick **Collection** by name, review its preview and **Save changes**. Renaming a collection will not break the link. Older rows that relied on automatic name matching need a one-time choice; ScreenHarbour no longer guesses from names. SmartLists/MDBList still owns chart refreshes. Number artwork counts the visible items in the selected order. See the [provider Home guide](docs/provider-homes.md) for setup and loading states.

## Preview locally

```sh
npm ci
npm run build
npm run dev
```

Open [the local preview](http://127.0.0.1:4173) or [desktop mode](http://127.0.0.1:4173/?layout=desktop&featured=0#/home). The controls at the top switch between Home, TV Shows, Movies, Live TV, Collections, Music and Recordings. This preview runs the production layout against fictional library data; playback is explicitly simulated. Its photos are local assets, and it does not connect to a server or need credentials. See [demo scenarios](demo/README.md).

## Install

The [v0.2.47 prerelease](https://github.com/jampez77/ScreenHarbour/releases/tag/v0.2.47) supports Jellyfin 10.10.7, 10.11.x and 12.x and is intended for server testing. Physical Mac mini/TV deployment and remote testing have not been performed for this release. See the [0.2.47 release notes](docs/releases/v0.2.47.md) for changes and validation status.

In **Dashboard → Plugins → Repositories**, add:

```text
https://raw.githubusercontent.com/jampez77/ScreenHarbour/main/manifest.json
```

Install **ScreenHarbour** and a compatible **File Transformation** plugin, then restart Jellyfin and use **Desktop** or **TV** display mode in your Jellyfin Web user settings. Existing Jellyfin Cinema or TV Item Layout users should replace their old catalogue repository entry with the URL above, then update the existing plugin; no uninstall is needed. The plugin GUID, DLL, API routes, archive filenames and internal settings keys remain stable. Saved collection rows and streaming-service choices continue to use the same account settings. The catalogue retains releases from 0.2.0 onward; older TV Item Layout releases remain outside it. See the [installation guide](docs/server.md) for migration, manual installation and troubleshooting. No web files are silently modified.

To build the packages locally:

```sh
bash scripts/package-plugin.sh all
```

The published builds are `0.2.47.1` for 10.10.7, `0.2.47.2` for 10.11.x and `0.2.47.3` for 12.x. Archives retain their `TvItemLayout_…` names. Release preparation is documented in [publishing](docs/publishing.md).

## Verify

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
dotnet run --project server/verification/TvItemLayout.ServerChecks.csproj --configuration Release
```

The browser suite exercises the actual layout against a simulated Jellyfin API. Server checks exercise injection, script delivery and caching on a temporary local HTTP host. These checks do not establish real-server playback or hardware compatibility.

The Featured compatibility tests additionally run its unmodified frontend with fixture API responses and a generated local trailer. To enable them, provide the audited checkout; otherwise those tests explicitly skip:

```sh
git clone https://github.com/spkesDE/jellyfin-featured-plugin.git /tmp/tvl-featured-audit
git -C /tmp/tvl-featured-audit checkout 2cb03c5360cc39836bc0f7c283752c9398eb50b9
TVL_FEATURED_SOURCE=/tmp/tvl-featured-audit npx playwright test tests/browser/featured-home.spec.ts
```

Its server-side feed generation and external trailer providers are not covered by these fixtures. Native Home tests run without the external checkout.

The native music queue, login and trailer-action checks load Jellyfin 12's actual templates and styles from an external checkout. Login checks also exercise its native controller with simulated server responses; trailer checks exercise its queue and TV focus navigation while simulating media playback. They skip when that source is unavailable; Jellyfin source is not bundled with ScreenHarbour:

```sh
git clone https://github.com/jellyfin/jellyfin-web.git /tmp/tvl-jellyfin-web-12-audit
git -C /tmp/tvl-jellyfin-web-12-audit checkout 0e83c6a724b31f3e9b5a499244331a288c060a4a
TVL_JELLYFIN_WEB_SOURCE=/tmp/tvl-jellyfin-web-12-audit npx playwright test tests/browser/music-player-native.spec.ts tests/browser/login-native.spec.ts tests/browser/trailer-actions.spec.ts
```

Optional theme-conflict checks use an external [ElegantFin stylesheet](https://github.com/lscambo13/ElegantFin), audited with v26.09.05. Set `TVL_ELEGANTFIN_CSS` to a downloaded CSS file when running the browser suite. Those checks explicitly skip without the stylesheet; it is not bundled with ScreenHarbour. The login theme check also needs `TVL_JELLYFIN_WEB_SOURCE` above.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/view.ts`, `src/style.css` | Media layouts, loading/empty/error states and actions |
| `src/remote.ts`, `src/remote-layout.ts` | Focus navigation, adjacent visual-row selection and remote key handling |
| `src/guide-view.ts`, `src/guide.ts`, `src/guide.css` | Main Live TV page, horizontal guide and timeline navigation |
| `src/library-view.ts`, `src/library.css` | Shared Movies and TV Shows filters, suggestions and paginated browsing |
| `src/collection-view.ts`, `src/collection.css` | Collections list and member browsing |
| `src/collection-picker.ts` | Create collections and add media from detail pages |
| `src/api.ts`, `src/local-playback.ts` | Authenticated Jellyfin data and native playback bridge |
| `src/browse-api.ts`, `src/browse-view.ts`, `src/browse.css` | Music and Recordings |
| `src/music-player.css`, `src/native-recordings.ts`, `src/recordings.css` | Native music player, queue and DVR styling |
| `src/profile-menu.ts`, `src/profile-menu.css`, `src/profile-auth.ts` | Full-screen profile chooser and guarded native authentication handover |
| `src/native-user-pages.ts`, `src/native-user-pages.css`, `src/current-user-policy.ts` | Native Search and Settings styling with current-account Dashboard permission checks |
| `src/native-login.ts`, `src/login.css`, `src/native-folder.ts`, `src/native-folder.css` | Signed-out login and ordinary folder styling without replacing native controllers |
| `src/home.css` | Native Home styling that preserves user/device preferences and Featured |
| `src/home-collections.ts`, `src/home-collection-settings.ts`, `src/home-collections.css` | Custom Home collection rows, settings schema and numbered artwork |
| `src/home-collection-editor.ts`, `src/home-row-card.ts`, `src/home-row-placement.ts` | Collection row editor, shared Home/preview cards and placement among native Home sections |
| `src/home-seasonal-appearance.ts`, `src/home-seasonal-appearance.css`, `src/home-seasonal-art.ts`, `src/home-seasonal-editor.css` | Optional seasonal scenery, frames, reveals, focus expansion and editor styling |
| `src/home-collection-store.ts`, `src/home-collection-transport.ts` | Per-account server sync, migration, revisions and offline cache |
| `src/provider-home.ts`, `src/provider-data.ts`, `src/provider-home.css` | Branded provider navigation, catalogue/chart sources and paginated provider pages |
| `src/provider-settings.ts`, `src/provider-settings-store.ts`, `src/provider-settings-editor.ts` | Personal provider-page configuration, draft previews and server sync |
| `src/loading-animation.ts`, `src/loading-animation.css`, `src/loading-settings-editor.ts`, `src/loading-settings-store.ts`, `server/Api/LoadingScreenController.cs` | Shared loading artwork, personal text/animation settings, previews and account sync |
| `src/admin-item-actions.ts`, `src/admin-item-actions.css` | Desktop administrator controls that open Jellyfin's native item menu and editors |
| `server/Api/ProviderHomesController.cs`, `server/Api/ProviderItemsController.cs`, `server/Providers/` | Authenticated provider settings, permitted-library matching and server-side availability cache |
| `src/channel-zapper.ts` | Live channel commands with native playback and stale-request guards |
| `src/player-context.ts`, `src/player-browser.ts` | Active playback identity, queues and in-player navigation |
| `src/trailer-actions.ts`, `src/trailer-actions.css`, `server/Api/TrailerActionsController.cs` | Pre-film trailer controls, advertised-film lookup and private user watchlists |
| `src/pause-screen.ts`, `src/pause-screen.css` | Pause artwork and metadata |
| `src/native-host.ts`, `src/native-host.css` | Native page visibility and restoration |
| `src/index.ts`, `src/layout.ts`, `src/theme-video.ts` | Display-mode activation, route lifecycle, native theme-video visibility and page restoration |
| `src/desktop-player.ts` | Native desktop audio-footer visibility and space reservation over ScreenHarbour pages |
| `server/` | Independent server plugin and File Transformation integration |
| `demo/` | Offline fixture and artwork |

## Credits

Integration and local playback code are adapted from [jampez77/InPlayerEpisodePreview-TV](https://github.com/jampez77/InPlayerEpisodePreview-TV), based on [Namo2/InPlayerEpisodePreview](https://github.com/Namo2/InPlayerEpisodePreview). The pause-screen behavior is independently implemented from [jampez77/Jellyfin-PauseScreen](https://github.com/jampez77/Jellyfin-PauseScreen); its code is not copied. Original MIT notices for InPlayerEpisodePreview are retained in [LICENSE.md](LICENSE.md) and the packaged server licence. The TV design takes inspiration from the supplied Netflix [overview](https://techwiser.com/wp-content/uploads/2023/01/Netflix-Smart-TV-More-episodes.jpg) and [season browser](https://techwiser.com/wp-content/uploads/2023/01/Netflix-Smart-TV-Change-season.jpg), and the supplied movie reference.

Provider logos are bundled to identify the corresponding services; sources, licensing and trademark notices are in [provider asset credits](assets/providers/README.md). ScreenHarbour is not affiliated with or endorsed by those services. UK streaming availability comes from [JustWatch](https://www.justwatch.com/uk) through [TMDB](https://www.themoviedb.org/). **This product uses the TMDB API but is not endorsed or certified by TMDB.** Demo titles and provider assignments are fictional; their photograph sources are listed in [artwork credits](demo/assets/CREDITS.md).

The optional Jellyfin loading animation uses the [Jellyfin Project's icon](assets/loading/CREDITS.md), licensed under [CC BY-SA 4.0](assets/loading/JELLYFIN-LICENSE.md). Its paths and colours are unchanged; CSS animates the complete image. It identifies Jellyfin and is not ScreenHarbour's branding. Jellyfin does not publish, endorse or affiliate with ScreenHarbour. The source SVG, attribution and licence are included in the plugin archives.
