# Provider Home pages

The **Streaming services** row on Home opens a separate ScreenHarbour page for Netflix, Prime Video, Disney+, Apple TV+, NOW, Paramount+, BBC iPlayer, ITVX and Channel 4, plus custom services you add. Its logo and name identify the page throughout. The original six pages start with featured artwork and separate **Trending films**, **Trending TV shows**, **Films** and **TV shows** rows. The three broadcasters start with **Films** and **TV shows**; add collection rows for any charts you maintain.

These pages browse titles already in your Jellyfin library and permitted for the current account. They do not sign into a streaming subscription, fetch missing media or play a provider's stream. Opening a title uses ScreenHarbour's existing details and Jellyfin playback. **View all** or a section button opens that row as a grid; **Load more** continues beyond the first page. Back from a provider page returns to the main Home screen; switching provider tabs does not add extra Back steps. Back from a title’s details restores the selected provider tab and item.

## Configure the pages

On desktop, open a service page and choose **Edit service**. Its settings open directly, with **Back to service** to return. You can also use **Settings → ScreenHarbour → Streaming services** in either layout. TV service pages keep their browsing controls only.

1. Select **Home row** to change its title, hide/show it, place it before a native Home section or at the end, and arrange or hide individual services, adjust tile size from 70% to 150%, and show or hide the name labels. The Home preview updates as you change these controls. Visit Home once if its native sections are not yet listed. An unavailable saved section falls back to the end.
2. Select a provider to edit its name, logo URL, accent colour, featured artwork and rows. Blank built-in logo fields use bundled artwork; custom services and unavailable image URLs use initials. Logo URLs must use HTTP(S) without embedded credentials. Select one row to edit it in the workspace.
3. Select a content row, then choose its **Collection** by name. The row list shows its current collection or **Choose a collection**. Review the item preview, title, visibility, item order and **Show rank artwork**. Automatic Films/TV rows can retain their catalogue or use a collection override. Add or remove rows as needed, up to 12 per provider.
4. Review the tile or content-row preview, then choose **Save changes**. **Cancel changes** restores the last loaded or saved settings in place; Back leaves without saving the draft. **Add service** creates a collection-backed service; **Remove service** removes it from your configuration. Removed built-in services can be added again, and their display/source defaults can be restored. Up to 24 services are supported.

Available content sources are **Films**, **TV shows**, **Trending films**, **Trending TV shows**, **Collection** and **Watchlist**. Trending and Collection rows use the collection you select. An unconfigured trending row stays empty until you choose one; an enabled new Collection row requires a choice before saving. It can contain films and TV series. Collection overrides on a Films/TV source retain that source's media-type filter.

Choose **Add Watchlist row** to mix saved films and whole TV shows available on this service. The row uses your Watchlist intersected with the service’s catalogue, so it needs no collection selection. Disney+ also includes saved titles from recognised Disney studios even before or between streaming releases. It is optional; set its title, visibility, item order and position, preview it, then save. Membership updates after titles are added or removed. Empty Watchlist rows and their section buttons stay hidden while browsing, including while initial availability checks are pending. Saved configuration remains in place, and the row appears automatically when matches become available. The editor still shows empty/error feedback for configuring a row. A custom service must have automatic catalogue matching configured for this source.

### Connect a custom service to your titles

1. Choose **Add service** and enter its name. The **Collection** chooser is immediately below the name and visibility controls.
2. Select a Jellyfin collection. ScreenHarbour adds the first row, uses the collection name as its initial row title, and previews its films and shows. Adjust the title, order or rank artwork as needed.
3. Choose **Add collection row** for more collections, then **Save changes**. Content controls appear before service artwork and optional automatic catalogue settings.

For individual titles, use **Add to collection** on a film or show to create or update a Jellyfin collection, then select it for the service. The row follows the collection's permitted items. **Refresh collections** reloads the choices without discarding unsaved service edits; use it after creating a collection elsewhere or if the initial choices could not load. Existing services, automatic rows and collection assignments remain unchanged until you save an edit.

**Source order** preserves the order of a collection, including a chart collection. Automatic catalogue rows use title order for this option. Other choices are title A–Z, title Z–A, newest release year and oldest release year. Rank artwork is a numbered image beside each poster, starting at 1 in the displayed order. Reordering or ranking a row does not change the underlying Jellyfin collection or supply a new popularity score.

Choices sync through Jellyfin for the signed-in account. Home and open provider pages check for settings changes every minute while visible and when the app regains focus. Provider pages update changed rows and featured artwork while preserving a still-valid selection. Native Home choices and **Settings → ScreenHarbour → Collection rows** remain separate. A conflicting save keeps your draft visible and offers **Reload saved settings**; reloading replaces the draft with the server copy. Opening Settings or Home on a fresh device does not write default settings over an existing account configuration.

## Where the content comes from

| Row source | Data | Scope and order |
| --- | --- | --- |
| Automatic Films / TV shows | UK availability plus recognised Disney studios when Disney+ is selected | Matching, permitted library titles; sorted by your row preference |
| Watchlist | Your saved films and whole TV shows, intersected with the service catalogue | Permitted saved titles matched by availability or Disney studio membership; sorted by your row preference |
| Trending films / Trending TV shows | Your selected collection, linked by its Jellyfin ID | Its permitted film or series members; chart order when **Source order** is selected |
| Collection or collection override | Your selected Jellyfin collection | Its permitted film/series members, with your chosen display order |

Automatic availability uses the **United Kingdom** (`GB`). The original six presets match subscription (`flatrate`) offers; BBC iPlayer, ITVX and Channel 4 match free and ad-supported (`free`, `ads`) offers. Rental and purchase offers are excluded. Under **Automatic catalogue matching**, search the separate **Film services** and **TV services** lists and tick the names you want. The server gets these names from the official UK [movie](https://developer.themoviedb.org/reference/watch-providers-movie-list) and [TV](https://developer.themoviedb.org/reference/watch-provider-tv-list) directories; numeric IDs remain internal. The directory is cached for 24 hours, with the last successful list retained on temporary failures. Built-in choices and existing selections remain available if the full list cannot load. With no services selected, that automatic catalogue is unconfigured; collection rows still work. Live previews use the draft configuration without saving it. NOW uses NOW Cinema for films and NOW for shows. Disney+ additionally includes titles whose Jellyfin studio metadata matches a recognised Disney production label, regardless of current streaming offers. This covers Disney, Pixar, Marvel Studios, Lucasfilm, 20th Century/Fox, Searchlight and related television production studios, including historical names. The rule follows the selected Disney+ service separately for films and shows, including custom or renamed pages. It does not use title text or unrelated co-producers, and does not change explicit collection rows. Other services retain availability matching. A title may legitimately appear under more than one provider.

Disney studio matches use existing library metadata immediately, without needing a TMDB ID or waiting for availability checks. For other candidates, ScreenHarbour reads the TMDB IDs already attached to library movies and series and checks their watch-provider data on the server. It reuses the installed Jellyfin TMDB integration, including its configured key when present. There is no ScreenHarbour browser API-key field. The key stays on the server; movie/TV TMDB IDs are sent to TMDB for these requests. ScreenHarbour does not send Jellyfin user IDs, media file paths or watch history as part of those lookups.

Successful results, including confirmed absence from a service, are cached on the server for **seven days** and shared across provider pages. The first visit queues missing lookups and displays **Checking UK availability…** while matches arrive. Later visits reuse that cache. Upgrading from the earlier cache preserves existing subscription matches while refreshing the new free/ad-supported categories in the background. A new library title is included after its metadata ID has been checked; an older title's changed streaming availability appears after its cache entry becomes eligible for refresh. Existing results remain available when an upstream refresh fails.

Source links and attribution labels are omitted from ScreenHarbour's browsing and settings screens. The [UK platform trending guide](platform-trending.md#source-urls) documents all twelve chart URLs and the SmartLists setup.

Existing version-1 preferences are upgraded in memory without overwriting saved settings: service/row choices are preserved, and the three broadcasters are appended. An explicitly empty services list remains empty. Saving writes version 2; older ScreenHarbour clients cannot overwrite that configuration.

### Choose a trending collection

Open the service on desktop → **Edit service** → select **Trending films** or **Trending TV shows** → choose **Collection** → **Save changes**. Choose your Daily, Weekly or ordinary collection; ScreenHarbour does not pick a chart for you.

The saved row contains the collection's stable Jellyfin ID. Renaming the service or collection, adding a suffix, or creating another collection with the same name does not change that link. Existing explicit links are preserved. Older rows that relied on automatic name discovery need a one-time collection choice. If you delete and recreate a collection, choose the new one, because it has a new ID. Names are display labels only.

SmartLists controls when chart collections refresh. A Jellyfin library scan alone does not update them. With the documented SmartLists setup, wait for the staggered daily refresh or refresh the relevant list individually while SmartLists is idle. ScreenHarbour then reads the updated members. The selected row preserves source-relative order but its number artwork counts visible library matches as **1, 2, 3…**; it does not preserve gaps from the original twenty source positions.

## Home loading and return position

A fixed cinema projector animation stays visible in the viewport while the initial Home rows load, with static artwork when reduced motion is requested. Native and ScreenHarbour rows reveal together when ready, with the existing 3.5-second fallback if a source stalls. Returning during the same session restores that account’s card focus, vertical position and horizontal row offsets after the rows settle. New navigation input takes priority; background refreshes keep existing content visible.

## Loading, missing titles and errors

| What the page shows | Meaning and next step |
| --- | --- |
| **Checking UK availability…** | Initial or newly required metadata lookups are queued. The page checks progress automatically; large libraries take longer. |
| **No matching titles in your library.** | The loaded source has no permitted matches. A streaming service's external catalogue can include many titles you do not own. |
| **UK availability is temporarily unavailable.** | The server cannot currently provide availability. Check its installed TMDB integration and connectivity; this is not confirmation of an empty catalogue. |
| **Some availability could not be refreshed…** | Previously known matches remain visible while a refresh is unavailable. Requests retry with backoff. |
| **Choose a collection for this row…** | Use **Edit service** on desktop, select the row, choose its Collection, and save. |
| **The selected collection is unavailable for this account.** | Check the saved collection still exists and this account can access it. |
| **This row could not be loaded.** / **could not refresh** | The row request failed. Use **Retry**; existing results remain visible when available. |

Titles without usable TMDB metadata need a recognised Disney studio association to qualify automatically for Disney+; browsing pages do not show a library-wide metadata warning. If a particular Disney title is missing, check its Studios metadata. Live-action and animated editions both qualify when their studios match. Studio membership is a library grouping rule and does not assert that the title is currently streaming. Recognised production labels follow [Disney’s studio portfolio](https://www.disneystudios.com/) and [television businesses](https://thewaltdisneycompany.com/about/).

The installed server plugin and client bundle must both include provider support. If Settings reports **Update ScreenHarbour**, update the matching server package, restart Jellyfin and fully close/reopen the web client. See [server installation and provider troubleshooting](server.md#provider-home-data-and-settings).

Provider marks and the TMDB logo are attributed in [provider asset credits](../assets/providers/README.md). This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability is supplied by JustWatch.
