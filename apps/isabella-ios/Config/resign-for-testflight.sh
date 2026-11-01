#!/bin/bash
# Build the App Store IPA from the local archive with a runner-held Apple Distribution
# identity (see asc-local-signing.py). Inner bundles first, then the app.
# The identity is passed by SHA-1 so no non-ASCII name travels through argv, and
# codesign derives each designated requirement from the certificate itself.
set -euo pipefail
: "${APPLE_TEAM_ID:?}" "${RUNNER_TEMP:?}"
WORK="$RUNNER_TEMP/window-local"
STATE="$WORK/state.json"
PY="${WINDOW_PY:-python3}"
IDENTITY="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["identity"])' "$STATE")"
KEYCHAIN="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["keychain"])' "$STATE")"
profile_for(){ "$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["profiles"][sys.argv[2]]["path"])' "$STATE" "$1"; }

rm -rf "$WORK/ipa" && mkdir -p "$WORK/ipa/Payload"
ditto "$RUNNER_TEMP/Isabella.xcarchive/Products/Applications/" "$WORK/ipa/Payload/"
shopt -s nullglob
apps=("$WORK/ipa/Payload/"*.app)
[[ ${#apps[@]} -eq 1 ]] || { echo "Expected one app in the archive" >&2; exit 1; }
APP="${apps[0]}"

sign_bundle(){
  local bundle="$1" id profile ent
  id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$bundle/Info.plist")"
  profile="$(profile_for "$id")"
  ent="$WORK/$(basename "$bundle").entitlements.plist"
  "$PY" "$(dirname "$0")/asc-local-signing.py" entitlements "$bundle" "$profile" "$APPLE_TEAM_ID" "$ent"
  cp "$profile" "$bundle/embedded.mobileprovision"
  codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --entitlements "$ent" --generate-entitlement-der "$bundle"
  if ! codesign --verify --strict --verbose=2 "$bundle" >/dev/null 2>&1; then
    # Fallback: an all-ASCII requirement on the Team ID instead of the certificate name.
    local req="$WORK/$(basename "$bundle").requirement"
    printf 'designated => identifier "%s" and anchor apple generic and certificate leaf[subject.OU] = "%s" and certificate 1[field.1.2.840.113635.100.6.2.1] /* exists */\n' "$id" "$APPLE_TEAM_ID" > "$req"
    codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --entitlements "$ent" --generate-entitlement-der -r "$req" "$bundle"
    echo "Signed $(basename "$bundle") as $id with the Team ID requirement"
  else
    echo "Signed $(basename "$bundle") as $id"
  fi
}

for item in "$APP"/PlugIns/*.appex/Frameworks/* "$APP"/Frameworks/*; do
  codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" "$item"
done
for appex in "$APP"/PlugIns/*.appex; do sign_bundle "$appex"; done
sign_bundle "$APP"

# Fail closed here too: each bundle must satisfy its own designated requirement.
for bundle in "$APP"/PlugIns/*.appex "$APP"; do
  codesign --verify --deep --strict --verbose=2 "$bundle"
done

(cd "$WORK/ipa" && /usr/bin/zip -qry "$WORK/Window.ipa" Payload)
echo "WINDOW_IPA=$WORK/Window.ipa" >> "$GITHUB_ENV"
echo "WINDOW_PAYLOAD=$WORK/ipa/Payload" >> "$GITHUB_ENV"
