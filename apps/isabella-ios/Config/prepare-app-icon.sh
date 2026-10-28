#!/usr/bin/env bash
# Temporary TestFlight icon: reuse the existing Isabella PWA artwork.
# The public Window icon has not been designed/approved yet.
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_icon="$app_dir/../isabella/icon-512.png"
asset_dir="$app_dir/Assets.xcassets/AppIcon.appiconset"
output="$asset_dir/Window-AppIcon-1024.png"

[[ -f "$source_icon" ]] || { echo "Missing source icon: $source_icon" >&2; exit 1; }
command -v sips >/dev/null || { echo "sips is required to prepare the iOS icon (macOS)." >&2; exit 1; }
mkdir -p "$asset_dir"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

# Passing through opaque JPEG ensures no alpha channel survives App Store validation.
sips -s format jpeg -z 1024 1024 "$source_icon" --out "$temp_dir/icon-opaque.jpg" >/dev/null
sips -s format png "$temp_dir/icon-opaque.jpg" --out "$output" >/dev/null
echo "Prepared temporary 1024×1024 Window icon from existing PWA asset."
