#!/usr/bin/env bash
set -euo pipefail

# Rebuild the smaller TV copies without changing desktop artwork or its alpha.
# Requires the WebP project's cwebp encoder; shipped files need no extra runtime.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
art_dir="$repo_dir/assets/seasonal"
command -v cwebp >/dev/null || { echo 'Install the WebP cwebp encoder to rebuild TV artwork.' >&2; exit 1; }
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/screenharbour-tv-art.XXXXXX")"
trap 'rm -rf "$staging_dir"' EXIT

for name in halloween-photoreal halloween-nightmare christmas-photoreal; do
    cwebp -quiet -q 60 -m 6 -metadata none -resize 1280 480 -o - -- - \
        < "$art_dir/originals/$name.png" > "$staging_dir/$name-tv.webp"
done

for name in halloween-nightmare-door halloween-nightmare-frame christmas-photoreal-door christmas-photoreal-frame; do
    cwebp -quiet -q 70 -alpha_q 100 -m 6 -metadata none -resize 0 600 -o - -- - \
        < "$art_dir/$name.webp" > "$staging_dir/$name-tv.webp"
done

for asset in "$staging_dir"/*.webp; do mv "$asset" "$art_dir/"; done
