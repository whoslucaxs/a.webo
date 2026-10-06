#!/usr/bin/env bash
# Verifies the signed macOS app.
# Usage: ci-verify-macos-signature.sh signed|notarized
set -euo pipefail

MODE="${1:-signed}"
APP="${APP:-dist/mac-universal/a.webo.app}"
DMG="${DMG:-dist/a-webo_universal.dmg}"

if [ ! -d "$APP" ]; then
  echo "Error: app bundle not found: $APP"
  exit 1
fi

echo "codesign --verify app"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "codesign -dv app"
codesign -dv --verbose=4 "$APP"

echo "codesign entitlements app"
codesign -d --entitlements - "$APP"

if [ "$MODE" = "notarized" ]; then
  echo "spctl --assess app"
  spctl --assess --type execute --verbose=4 "$APP"
  echo "stapler validate app"
  xcrun stapler validate "$APP"
  echo "stapler validate dmg"
  xcrun stapler validate "$DMG"
fi
