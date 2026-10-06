#!/usr/bin/env bash
set -euo pipefail

cp logo.png web/static/logo.png || exit 1
cp logo.png web/static/favicon.png || exit 1
