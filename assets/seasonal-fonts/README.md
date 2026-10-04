# Seasonal display fonts

These fonts are bundled locally for the expanded seasonal row title. The browser
loads only the selected style, when its row approaches the viewport or receives
focus. There are no runtime Google Fonts requests. Regular row headings retain
the existing interface font.

| Theme | Style | Font | Weight | File size |
| --- | --- | --- | --- | --- |
| Halloween | Classic | Creepster | 400 | 27.5 KiB |
| Halloween | Storybook | Henny Penny | 400 | 37.3 KiB |
| Halloween | Photoreal | IM Fell English SC | 400 | 55.6 KiB |
| Halloween | Nightmare | Nosifer | 400 | 14.7 KiB |
| Christmas | Classic | Berkshire Swash | 400 | 16.7 KiB |
| Christmas | Storybook | Snowburst One | 400 | 24.4 KiB |
| Christmas | Photoreal | Cinzel Decorative | 700 | 15.1 KiB |

All seven faces use the SIL Open Font License 1.1. The individual `*-OFL.txt`
files retain their copyright notices and license terms, and are embedded with
the fonts in the plugin assembly. They are also distributed with the static
demo. These fonts remain under their own licenses, independent of the plugin's
source-code license.

The WOFF2 files are the unmodified Latin subsets supplied by the
[official Google Fonts service](https://fonts.google.com/). They cover Latin
letters, including common Western European accented characters, with the
browser's usual fallback for missing glyphs. `SOURCES.json` records exact
download URLs, SHA-256 hashes, and the matching licenses from the
[Google Fonts source repository](https://github.com/google/fonts) at commit
`9710da1eacb3be272583c3224dcb70f9da6eadbb` (acquired 4 October 2026).

CSS family aliases start with `ScreenHarbour` to avoid colliding with other web
plugins. The underlying font binaries and their internal names are unchanged.
The source URLs are provenance only, and are never used by the client.
