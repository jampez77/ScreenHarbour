# ScreenHarbour demo

Try the hosted demo in [TV mode](https://jampez77.github.io/ScreenHarbour/?layout=tv&featured=0#/home) or [desktop mode](https://jampez77.github.io/ScreenHarbour/?layout=desktop&featured=0#/home). It uses fictional media and simulated playback; the screenshots in the main README show a real Jellyfin library instead. No personal library content or Jellyfin credentials are included in the public demo.

To run it locally, use `npm ci`, `npm run build`, and `npm run dev` from the project root. Open [the local preview](http://127.0.0.1:4173/).

Add `?layout=desktop` before the hash to preview desktop mode, for example [desktop Home](http://127.0.0.1:4173/?layout=desktop&featured=0#/home). This keeps the same ScreenHarbour design without enabling Jellyfin’s TV display mode.

The preview loads the same layout bundle used by Jellyfin, with a separate in-memory API supplying fictional media. It needs no Jellyfin credentials and makes no network requests after the local page and bundled photographs have loaded. The small switcher at the top belongs only to this preview.

- **TV Shows:** browse five fictional series using search, genres, A–Z/#, favourites and native-style episode suggestions. Open North of Nowhere to try its full episode browser. North of Nowhere has three seasons and six episodes per season. The first episode is watched; the second is partially watched. Down from the last episode advances to the next season; Up from the first returns to the previous season’s last episode.
- **Movies:** the library includes search, letter filters, genres, favourites and suggestions. Open a card to view its details; After the Tide has a resume position, a trailer action, cast, technical metadata and four related films. The trailer opens its own labelled playback simulation and preserves the film’s resume position.
- **Live TV:** Four channels share a horizontal programme timeline, with varied programme durations. Left/Right browses time, Up/Down browses channels, and artwork for the highlighted programme fits above the schedule, including future programmes. The schedule is calculated when the page loads.
- **Home:** in desktop mode, use **Settings → ScreenHarbour → Collection rows**, or [open the local collection-row editor](http://127.0.0.1:4173/?layout=desktop&featured=0#/mypreferencesmenu?cinemaCollections=1), to choose collections, add rows of their members and enable outlined rank images beside posters. Choices persist for the demo account in this browser. The rest is a native-shaped Home fixture with My Media, Continue watching/listening, Next up, Live TV navigation and latest additions. The installed layout styles Jellyfin's existing sections in place, preserving its user preferences and plugins. The preview's fictional featured hero is labelled; it is not the Featured plugin. A minimal Settings page opens the collection-row, streaming-service and loading-screen editors; other native settings/search forms are not simulated.
- **Seasonal rows:** add a seasonal group in the Home row editor, add a named sub-row with collections and annual dates, then open its **Appearance** tab. Try Normal, Halloween or Christmas; static/parallax/no scenery; standard or expanding focus height; frames; and opening doors, window shutters or curtains. The preview remains available outside the chosen season and uses real card focus/hover effects without navigating away. On Home only date-active sub-rows appear. Scenery, frame and door/shutter styles can each use Illustrated, Playful / family or Photorealistic artwork. Halloween also offers an explicit Nightmare choice; Christmas does not. Generated artwork is bundled locally and makes no external image-service requests. Ranked seasonal item rows also theme their number images: Match frame style, Standard numbers, Illustrated, Playful / family, Textured, and Halloween-only Nightmare. Enable Ranked artwork in Content, then choose Rank number style in Appearance. Christmas collection-item sub-rows also offer Advent calendar doors, with Illustrated, Playful / family or Gilded winter wood flaps. Door opening can follow the season start date (one more film each day) or allow every door on focus. The editor preview always opens every door, and daily calendars ignore shuffle. Saved choices persist in this browser; server account sync is not simulated.
- **Loading screen:** open **Settings → ScreenHarbour → Loading screen**, or the [direct local editor](http://127.0.0.1:4173/?layout=desktop&featured=0#/mypreferencesmenu?cinemaLoading=1), to preview six animations and edit their title and message. **Save** also applies the title to interface wordmarks, including the Settings section heading, editor headers and preview fallback page. Blank text hides that label. Choices persist in this browser; **Restore defaults** remains a preview until saved and **Cancel** preserves the saved choice. The demo does not exercise server-side account sync or a real Jellyfin login session.
- **Streaming services:** nine branded tiles open individual provider pages with featured artwork, full fictional film/TV catalogues and configured chart subsets. **Settings → ScreenHarbour → Streaming services** edits the tile order, Home position, provider rows, collection overrides, sorting and rank artwork with live previews. **Save changes** persists preferences in this browser; the demo does not exercise server sync or make availability requests. Provider assignments and chart order are fictional test data, not real UK streaming offers.
- **Music:** fictional albums, artists and tracks, with search, genres, A–Z/#, favourites and suggestions. Open an artist to see albums, then an album to select its tracks.
- **Recordings:** completed and active recordings, search and direct playback. Scheduling links point to Jellyfin's native pages, which the local fixture does not implement.

Movies and TV Shows start on Suggestions, with All movies/shows last. Movie/show details include **Add to collection**; demo additions and newly created collections last until page reload. Selecting a currently live programme or a channel name in the guide starts its simulated channel; upcoming programmes stay selected without playback.

The desktop administrator **More** menu requires Jellyfin's signed-in administrator policy and native item editors, which the ordinary demo does not simulate, so those controls are normally hidden here. Metadata, image, refresh and identification actions must be verified on an installed Jellyfin server; browser tests supply isolated native-menu fixtures for regression coverage.

The Live TV preview opens the main guide at `/#/livetv?collectionType=livetv`. Channel details remain available at `/#/details?id=channel-field`; their **Channels & guide** button links to the main guide.

Arrow keys, Enter and Escape exercise remote navigation. Clicking works too. Playback opens a clearly labelled simulation; **Back to details**, **Back to guide** or Escape returns to the previous page. Favorites remain set while the page stays open.

Use the address bar to open an item directly:

- `/#/tv?topParentId=library-tv`
- `/#/details?id=series-north`
- `/#/movies?topParentId=library-movies`
- `/#/details?id=movie-tide`
- `/#/details?id=channel-field`
- `/#/home`
- `/#/home?cinemaProvider=netflix`
- `/#/mypreferencesmenu?cinemaProviders=1`
- `/#/mypreferencesmenu?cinemaCollections=1` (desktop display mode)
- `/#/music?topParentId=library-music&collectionType=music`
- `/#/livetv?tab=3&collectionType=livetv`

## Failure and loading scenarios

Add a query before the hash and reload:

- `/?scenario=empty#/details?id=series-north`: empty seasons, episodes, related films, channels and programme listings.
- `/?scenario=empty#/details?id=movie-tide`: no trailer available, while film playback remains available.
- `/?scenario=error#/details?id=series-north`: all asynchronous API calls reject, allowing the error and retry state to be checked.
- `/?scenario=slow#/details?id=series-north`: longer, varied response times. Switch items or seasons quickly to check that older requests cannot replace the active view.

Remove the query and reload to restore ordinary behaviour. All titles, descriptions, cast names and ratings are fictional demonstration data. Photograph sources are recorded in [assets/CREDITS.md](assets/CREDITS.md).

## Native Home preferences fixture

The Home preview uses the native `#indexPage #homeTab .sections.homeSectionsContainer` structure. It keeps the native Home/Favourites tabs and navigation controls. It does not fetch or overwrite a real user's preferences.

Query parameters before the hash demonstrate different native section outputs:

- `/?featured=0#/home`: native rows without the fictional featured hero.
- `/?featured=0&homeSections=nextup,librarybuttons,resumeaudio,latestmedia#/home`: reordered sections, library buttons, and Continue listening.
- `/?featured=0&libraryOrder=library-music,library-tv,library-movies,library-live&hiddenLibraries=library-tv&hiddenLatest=library-movies#/home`: library order, a hidden library, and Movies excluded from Latest.

Supported fixture section names are `smalllibrarytiles`, `librarybuttons`, `resume`, `resumeaudio`, `nextup`, `livetv`, `activerecordings`, `latestmedia`, and `none`. As native TV Home does, the fixture adds a library section if both library section types are absent. These are fictional preview preferences only.

Browser tests can dispatch `demo-home-settings` on `document`, with a `CustomEvent` detail containing `sections`, `libraryOrder`, `hiddenLibraries`, `hiddenLatest`, or `featured`, to model native sections changing after activation. Production applies styling without replacing, cloning or moving those sections.

The ordinary preview hero uses a representative `.ec-root` solely to verify that independently owned controls survive the Home skin. The dedicated Featured browser tests disable it with `featured=0`, load the actual upstream Featured bundle and stub its server responses. No Featured source or bundle is included in this plugin or the preview installer.

## Collections and theme videos

The preview includes **Coastal Stories** for After the Tide and **Into the Wilderness** for North of Nowhere, plus twelve fictional provider chart collections (films and shows for each service). Chart subsets are deliberately separate from the larger provider catalogue fixtures. Collection cards open the styled collection page with links to its members. The Collections preview control opens the library list at `/#/list?parentId=library-collections`. Configure Home rows separately in desktop **Settings → ScreenHarbour → Collection rows**; a custom interface title also renames this Settings section. Back restores the selected card. Series overviews now scroll down to recommendations as well as collections.

Native theme-video integration is covered by browser tests using a local canvas video stream. The preview does not download or autoplay a sample theme video; installed Jellyfin clients use their existing theme player and preferences.

In-player browsing and the pause screen are tested with real local canvas video streams in the browser suite. The regular demo playback screen remains a labelled simulation; it does not reproduce Jellyfin’s actual player. Test the integrated player UI on the installed server using Down/Browse or Pause.

## Cinema trailer controls

Open the [local trailer preview](http://127.0.0.1:4173/?scenario=cinema-trailers#/video) to try the production **Add to watchlist** and **Skip trailer** controls. Two fictional trailer entries advertise The Shape of Silence and Higher Ground before the feature, After the Tide. The player displays bundled artwork through a silent local canvas stream; these are labelled artwork simulations, not trailer clips.

**Skip trailer** advances exactly one entry. Each trailer also advances after one minute of playing; Pause stops its timer. The actions disappear when the feature begins. Tab or the arrow keys reach the controls, and Enter selects them. Up from a native control reaches the trailer actions. Back or Escape exits to After the Tide’s details.

**Add to watchlist** saves the advertised film, not After the Tide. **View watchlist** opens the fictional account’s video playlist, also available through [Playlists](http://127.0.0.1:4173/?scenario=cinema-trailers#/playlists). It persists across reloads in this browser under the demo-only `screenharbour-demo:demo:trailer-watchlist` storage key. It does not contact or alter a Jellyfin account. Leaving the player stops its canvas stream and timer. Other preview scenarios retain their existing simulated player.

## Publishing the demo

Run `npm run build:demo` to create a standalone static site in `dist/demo-site`. The build includes the production layout bundle, fictional fixture, bundled artwork and credits. Relative asset paths support hosting beneath a project path such as `/Jellyfin-ScreenHarbour/`.

The [Publish demo workflow](../.github/workflows/demo.yml) builds and deploys this directory to GitHub Pages when relevant source or build files change on `main`. It can also be run manually from the repository’s Actions page. Repository Pages settings must use **GitHub Actions** as the publishing source; deployment is restricted to `main`. This workflow does not package or release the Jellyfin server plugin.
