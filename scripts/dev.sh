#!/usr/bin/env bash

set -euo pipefail

TMP_DIR_NAME="${TMP_DIR_NAME:-xdg-temp}"

echo "Using temporary directory: $TMP_DIR_NAME"
echo "To change it, run: task TMP_DIR_NAME=<new-directory-name> dev"

mkdir -p "/tmp/a-webo/$TMP_DIR_NAME/xdg-config-home" \
  "/tmp/a-webo/$TMP_DIR_NAME/xdg-data-home" \
  "/tmp/a-webo/$TMP_DIR_NAME/xdg-cache-home"

env XDG_CONFIG_HOME="/tmp/a-webo/$TMP_DIR_NAME/xdg-config-home" \
  XDG_DATA_HOME="/tmp/a-webo/$TMP_DIR_NAME/xdg-data-home" \
  XDG_CACHE_HOME="/tmp/a-webo/$TMP_DIR_NAME/xdg-cache-home" pnpm run dev
