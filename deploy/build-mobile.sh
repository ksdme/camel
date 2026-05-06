#!/usr/bin/env bash
# build-mobile.sh — Rebuild mobile apps with the production server URL
#
# Run this on your DEVELOPMENT machine (macOS or Linux) after deploying the
# server with deploy.sh.  It bakes the server URL into the compiled web assets
# and syncs them into the Android / iOS native projects.
#
# Usage:
#   bash deploy/build-mobile.sh --url https://yourdomain.com
#   bash deploy/build-mobile.sh --url https://yourdomain.com --platform android
#   bash deploy/build-mobile.sh --url https://yourdomain.com --platform ios
#   bash deploy/build-mobile.sh --url https://yourdomain.com --platform all --apk
#
# Options:
#   --url       (required) Public server URL, e.g. https://example.com
#   --platform  android | ios | all  (default: all)
#   --apk       Also run Gradle to produce a debug APK after syncing Android
#   --release   Combine with --apk to build a release APK (requires signing)

set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${BLUE}▶  $*${NC}"; }
ok()     { echo -e "${GREEN}   ✓ $*${NC}"; }
warn()   { echo -e "${YELLOW}   ! $*${NC}"; }
die()    { echo -e "${RED}   ✗ $*${NC}" >&2; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER_URL=""
PLATFORM="all"
BUILD_APK=false
RELEASE=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$REPO_ROOT/frontend"

# ── Args ──────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)      SERVER_URL="$2"; shift 2 ;;
    --platform) PLATFORM="$2";   shift 2 ;;
    --apk)      BUILD_APK=true;  shift   ;;
    --release)  RELEASE=true;    shift   ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -z "$SERVER_URL" ]] && {
  read -rp "$(echo -e "${BOLD}Production server URL${NC} (e.g. https://example.com): ")" SERVER_URL
}
SERVER_URL="${SERVER_URL%/}"
[[ "$SERVER_URL" =~ ^https?:// ]] || die "URL must start with http:// or https://"

[[ "$PLATFORM" =~ ^(android|ios|all)$ ]] || die "--platform must be android, ios, or all"

echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BOLD}Camel — Mobile Build${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Server URL : $SERVER_URL"
echo "  Platform   : $PLATFORM"
echo "  Build APK  : $BUILD_APK"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$FRONTEND_DIR"

# ── Step 1: Install frontend dependencies ────────────────────────────────────
info "Installing frontend dependencies..."
pnpm install
ok "Dependencies installed"

# ── Step 2: Build with server URL baked in ───────────────────────────────────
#
# VITE_API_URL is read by src/lib/api.ts at runtime on native platforms.
# Vite compiles import.meta.env.VITE_API_URL into the JS bundle, so the
# mobile app knows which server to call without any QR pairing step.
info "Building frontend (VITE_API_URL=$SERVER_URL)..."
VITE_API_URL="$SERVER_URL" pnpm run build
ok "Frontend built → dist/"

# ── Step 3: Capacitor sync ────────────────────────────────────────────────────
sync_platform() {
  local platform="$1"
  info "Running: npx cap sync $platform"
  npx cap sync "$platform"
  ok "Capacitor sync complete → $platform"
}

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  if [[ -d "android" ]]; then
    sync_platform android
  else
    warn "android/ directory not found — run 'npx cap add android' first"
  fi
fi

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  if [[ -d "ios" ]]; then
    sync_platform ios
  else
    warn "ios/ directory not found — run 'npx cap add ios' first"
  fi
fi

# ── Step 4: (Optional) Build Android APK ─────────────────────────────────────
if [[ "$BUILD_APK" == true ]]; then
  if [[ ! -d "android" ]]; then
    die "android/ directory not found. Cannot build APK."
  fi

  GRADLE_TASK="assembleDebug"
  APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

  if [[ "$RELEASE" == true ]]; then
    GRADLE_TASK="assembleRelease"
    APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
    warn "Release build requires a signing keystore configured in android/app/build.gradle"
  fi

  info "Building Android APK ($GRADLE_TASK)..."
  cd android
  if [[ -x "./gradlew" ]]; then
    ./gradlew "$GRADLE_TASK"
  elif command -v gradle &>/dev/null; then
    gradle "$GRADLE_TASK"
  else
    die "Gradle not found. Install Android Studio or the Android SDK."
  fi
  cd "$FRONTEND_DIR"

  if [[ -f "$APK_PATH" ]]; then
    ok "APK ready → $FRONTEND_DIR/$APK_PATH"
  else
    die "APK not found at expected path: $APK_PATH"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}${BOLD}Mobile build complete!${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Server URL baked in : $SERVER_URL"
echo ""

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]] && [[ -d "android" ]]; then
  echo "  Android:"
  if [[ "$BUILD_APK" == true ]]; then
    echo "    Install APK:  adb install -r $FRONTEND_DIR/$APK_PATH"
  else
    echo "    Open in Android Studio:"
    echo "      npx cap open android"
    echo "    Then build/run from Android Studio, or:"
    echo "      bash deploy/build-mobile.sh --url $SERVER_URL --platform android --apk"
  fi
  echo ""
fi

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]] && [[ -d "ios" ]]; then
  echo "  iOS:"
  echo "    Open in Xcode:"
  echo "      npx cap open ios"
  echo "    Then archive & distribute from Xcode."
  echo ""
fi

echo "  The compiled-in server URL can be overridden at runtime via the"
echo "  QR pairing flow in the app (Settings → Add Mobile Device)."
echo ""
