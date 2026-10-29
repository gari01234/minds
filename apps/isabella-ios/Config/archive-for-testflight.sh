#!/bin/bash
# Run from apps/isabella-ios. No Apple credentials or provisioning requests here.
set -euo pipefail
: "${APPLE_TEAM_ID:?}" "${APP_BUNDLE_ID:?}" "${RUNNER_TEMP:?}" "${GITHUB_RUN_NUMBER:?}"

# A local ad-hoc code signature preserves entitlements for export. This is NOT
# Apple's device-based Ad Hoc distribution method. Distribution signing happens
# only in -exportArchive with method=app-store-connect.
settings=(
  -project MINDS.xcodeproj -configuration Release -sdk iphoneos
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" MINDS_BUNDLE_ID="$APP_BUNDLE_ID"
  CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY=- AD_HOC_CODE_SIGNING_ALLOWED=YES
  MARKETING_VERSION=0.1.0 CURRENT_PROJECT_VERSION="$GITHUB_RUN_NUMBER"
)
xcodebuild "${settings[@]}" -alltargets -showBuildSettings -json > "$RUNNER_TEMP/window-signing-settings.json"
python3 Config/verify-testflight-signing.py settings "$RUNNER_TEMP/window-signing-settings.json" "$APP_BUNDLE_ID" "$APPLE_TEAM_ID"
xcodebuild "${settings[@]}" -scheme MINDS -destination 'generic/platform=iOS' \
  -archivePath "$RUNNER_TEMP/Isabella.xcarchive" archive
python3 Config/verify-testflight-signing.py archive "$RUNNER_TEMP/Isabella.xcarchive/Products/Applications" "$APP_BUNDLE_ID" "$APPLE_TEAM_ID"
