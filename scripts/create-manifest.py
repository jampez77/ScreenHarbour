#!/usr/bin/env python3
"""Generate the Jellyfin catalogue from the three packaged release archives."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
repository = 'jampez77/ScreenHarbour'
release_url_prefix = f'https://github.com/{repository}/releases/download/'
previous_release_url_prefix = 'https://github.com/jampez77/Jellyfin-Cinema/releases/download/'
release = json.loads((root / 'package.json').read_text())['version']
plugin_id = '1a06b74f-7609-4af9-899d-430c9b5a52b1'
client_hash = hashlib.sha256((root / 'dist/jellyfin-tv-layout.js').read_bytes()).hexdigest()
timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
versions = []
for suffix, target in [('3', '12.0.0'), ('2', '10.11.0'), ('1', '10.10.7')]:
    version = f'{release}.{suffix}'
    archive = root / 'dist/releases' / f'TvItemLayout_{version}_jellyfin-{target}.zip'
    data = archive.read_bytes()
    with ZipFile(archive) as package:
        assert package.testzip() is None, f'Corrupt archive: {archive.name}'
        info = json.loads(package.read('build-info.json'))
        assert info['id'] == plugin_id and info['version'] == version
        assert info['jellyfinVersion'] == target and info['clientSha256'] == client_hash
        assert 'Jellyfin.Plugin.TvItemLayout.dll' in package.namelist()
        for name in ('CREDITS.md', 'JELLYFIN-LICENSE.md', 'jellyfin-icon--color-on-dark.svg'):
            assert 'assets/loading/' + name in package.namelist(), f'Missing loading-artwork credit or source: {name}'
        for asset in (root / 'assets/seasonal-fonts').glob('*-OFL.txt'):
            assert package.read('assets/seasonal-fonts/' + asset.name) == asset.read_bytes(), f'Missing font licence: {asset.name}'
    assert archive.with_suffix('.zip.sha256').read_text().split()[0] == hashlib.sha256(data).hexdigest()
    versions.append({
        'version': version,
        'changelog': 'Moves Home collection-row editing into desktop Settings, under ScreenHarbour > Collection rows, alongside Streaming services and Loading screen. The Collections page retains its browsing controls. Preserves all saved rows and settings; editing remains desktop-only. Update the plugin, restart Jellyfin and fully reopen clients. Requires File Transformation.',
        'targetAbi': target,
        'sourceUrl': f'{release_url_prefix}v{release}/{archive.name}',
        # Jellyfin's catalogue protocol requires MD5; SHA-256 files are also published.
        'checksum': hashlib.md5(data).hexdigest(),
        'timestamp': timestamp,
    })

manifest_path = root / 'manifest.json'
if manifest_path.exists():
    previous = next((item for item in json.loads(manifest_path.read_text()) if item['guid'] == plugin_id), None)
    if previous:
        current = {item['version'] for item in versions}
        # This is a rename of the same repository: its existing release assets
        # move with it. Keep their versions/checksums and canonicalise only URLs
        # from the known former name; unrelated repositories stay excluded.
        for item in previous['versions']:
            if item['version'] in current:
                continue
            source_url = item.get('sourceUrl', '')
            if source_url.startswith(previous_release_url_prefix):
                source_url = release_url_prefix + source_url[len(previous_release_url_prefix):]
            if source_url.startswith(release_url_prefix):
                versions.append({**item, 'sourceUrl': source_url})
versions.sort(key=lambda item: tuple(map(int, item['version'].split('.'))), reverse=True)
manifest = [{
    'guid': plugin_id,
    'name': 'ScreenHarbour',
    'overview': 'Cinematic TV and desktop browsing, personal Watchlist and collection rows, and in-player navigation.',
    'description': 'An independent cinematic interface for Jellyfin Web in TV and desktop display modes, with a personal film/series Watchlist, optional mixed Watchlist Home rows, branded UK streaming-provider Home pages and Settings-based configuration, configurable Home collection rows and optional collection tabs, matching Jellyfin Featured styling, Movies, TV Shows, Music, Recordings, Collections, a horizontal Live TV guide and pause artwork. Add items to collections and browse seasons during playback. Preview Home collection rows while editing. Add seasonal groups with annual visibility dates, optional shuffle on load, Halloween/Christmas scenery, frames and focus reveals. Ranked Home artwork follows the chosen item order; it does not calculate popularity. Formerly Jellyfin Cinema and TV Item Layout, with the same plugin ID and saved settings for upgrades. Not affiliated with or endorsed by Jellyfin. Install File Transformation separately for automatic loading. Native Android TV, Roku and other independent clients are not supported.',
    'owner': 'jampez77',
    'category': 'General',
    'imageUrl': f'https://raw.githubusercontent.com/{repository}/main/assets/catalogue/screenharbour.png',
    'versions': versions,
}]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Generated {manifest_path.name} for v{release} with {len(versions)} package versions.')
