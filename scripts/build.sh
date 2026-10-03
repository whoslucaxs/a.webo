#!/usr/bin/env bash
set -euo pipefail

if [ -z "${VERSION:-}" ]; then echo "Error: VERSION is not set"; exit 1; fi
if [ -z "${TARGET_PLATFORM:-}" ]; then echo "Error: TARGET_PLATFORM is not set"; exit 1; fi

update_package_json_version() {
  local tmp
  tmp=$(mktemp)
  jq --arg v "$VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json
}

update_package_json_version

build_windows() {
  pnpm run build && ./node_modules/.bin/electron-builder --win --publish never
}

build_linux() {
  pnpm run build && ./node_modules/.bin/electron-builder --linux --publish never
}

build_linux_arm64() {
  pnpm run build && ./node_modules/.bin/electron-builder --linux deb --publish never --arm64 && \
    pnpm run build && ./node_modules/.bin/electron-builder --linux flatpak --publish never --arm64 && \
    pnpm run build && ./node_modules/.bin/electron-builder --linux appimage --publish never --arm64
}

build_linux_debug() {
  pnpm run build && ./node_modules/.bin/electron-builder --linux deb --publish never
}

build_macos() {
  pnpm run build && ./node_modules/.bin/electron-builder --mac --publish never
}

case $TARGET_PLATFORM in
  "linux")
    build_linux
    ;;
  "linux-arm64")
    build_linux_arm64
    ;;
  "linux-debug")
    build_linux_debug
    ;;
  "macos")
    build_macos
    ;;
  "windows")
    build_windows
    ;;
  *)
    echo "Error: TARGET_PLATFORM $TARGET_PLATFORM is not supported"
    exit 1
    ;;
esac
