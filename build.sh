#!/usr/bin/env bash
# Rebuild the DeepSeek Harness desktop artifacts after source or dependency
# changes. Run from the repository root with Git Bash (Windows) or WSL.
# Usage: build.sh [dist|package|dev]  (default: dist)
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-dist}"
case "$MODE" in
  dist|package|dev) ;;
  *)
    echo "usage: $0 [dist|package|dev]" >&2
    exit 2
    ;;
esac

# pnpm requires the repository engine range; fail early with a clear message
# instead of letting pnpm exit deep into the build.
command -v node >/dev/null 2>&1 || { echo "error: node not found on PATH" >&2; exit 1; }
require_node() {
  local version major minor
  version="$(node --version)"
  version="${version#v}"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if (( major >= 24 || (major == 22 && minor >= 19) )); then
    return 0
  fi
  echo "error: node ${version} does not satisfy engines.node ^22.19.0 || >=24.0.0; put a supported Node first on PATH" >&2
  exit 1
}
require_node

# pnpm install is idempotent and restores missing workspace links (for example
# a half-linked node_modules after an interrupted install).
echo "==> pnpm install"
pnpm install

# Electron ships no lifecycle script under pnpm's reviewed build list, so its
# binary downloads lazily. Materialize it once; fall back to the npmmirror
# mirror when the primary source stalls (useful behind restricted networks).
ensure_electron() {
  local dist
  dist="apps/desktop/node_modules/electron/dist"
  if [[ -f "$dist/electron.exe" || -f "$dist/electron" ]]; then
    return
  fi
  echo "==> downloading the Electron binary"
  if ! node apps/desktop/node_modules/electron/install.js; then
    echo "==> primary Electron download failed; retrying through npmmirror"
    ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
      node apps/desktop/node_modules/electron/install.js
  fi
}

case "$MODE" in
  dist)
    # Full build: workspace build, Host dependency staging, NSIS installer.
    # Output: apps/desktop/dist/DeepSeek Harness Setup <version>.exe
    ensure_electron
    pnpm run dist:win:desktop
    ;;
  package)
    # Unpacked portable application only (faster than the installer).
    # Output: apps/desktop/dist/win-unpacked/
    ensure_electron
    pnpm run package:desktop
    ;;
  dev)
    # Source launch for interactive development (rebuilds, then runs Electron).
    ensure_electron
    pnpm run dev:desktop
    ;;
esac
