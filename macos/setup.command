#!/bin/zsh
set -euo pipefail

skip_desktop_launcher=false
skip_login_item=false

for arg in "$@"; do
  case "$arg" in
    --skip-desktop-launcher)
      skip_desktop_launcher=true
      ;;
    --skip-login-item)
      skip_login_item=true
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./macos/setup.command [--skip-desktop-launcher] [--skip-login-item]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="Screenshot Maschine 3000"
LAUNCH_AGENT_LABEL="com.screenshotmaschine3000.dashboard"
LAUNCH_AGENT_PATH="$HOME/Library/LaunchAgents/$LAUNCH_AGENT_LABEL.plist"
DESKTOP_LAUNCHER="$HOME/Desktop/$APP_NAME.app"
LEGACY_DESKTOP_LAUNCHER="$HOME/Desktop/$APP_NAME.command"

xml_escape() {
  printf '%s' "$1" \
    | sed \
      -e 's/&/\&amp;/g' \
      -e 's/</\&lt;/g' \
      -e 's/>/\&gt;/g' \
      -e 's/"/\&quot;/g' \
      -e "s/'/\&apos;/g"
}

applescript_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

write_desktop_launcher() {
  local project_root_script
  local log_dir_script
  local stdout_script
  local stderr_script
  local launcher_script

  project_root_script="$(applescript_escape "$PROJECT_ROOT")"
  log_dir_script="$(applescript_escape "$PROJECT_ROOT/logs")"
  stdout_script="$(applescript_escape "$PROJECT_ROOT/logs/macos-launch.log")"
  stderr_script="$(applescript_escape "$PROJECT_ROOT/logs/macos-launch-error.log")"
  launcher_script="$(mktemp)"

  mkdir -p "$HOME/Desktop"
  rm -rf "$DESKTOP_LAUNCHER"
  rm -f "$LEGACY_DESKTOP_LAUNCHER"

cat > "$launcher_script" <<APPLESCRIPT
property projectRoot : "$project_root_script"
property logDir : "$log_dir_script"
property stdoutPath : "$stdout_script"
property stderrPath : "$stderr_script"

on run
  set commandText to "mkdir -p " & quoted form of logDir & " && cd " & quoted form of projectRoot & " && npm start >> " & quoted form of stdoutPath & " 2>> " & quoted form of stderrPath & " &"
  do shell script "/bin/zsh -lc " & quoted form of commandText
end run
APPLESCRIPT

  /usr/bin/osacompile -o "$DESKTOP_LAUNCHER" "$launcher_script"
  rm -f "$launcher_script"
}

write_launch_agent() {
  local project_root_xml
  local stdout_xml
  local stderr_xml

  project_root_xml="$(xml_escape "$PROJECT_ROOT")"
  stdout_xml="$(xml_escape "$PROJECT_ROOT/logs/macos-launch.log")"
  stderr_xml="$(xml_escape "$PROJECT_ROOT/logs/macos-launch-error.log")"

  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$LAUNCH_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCH_AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "\$SM3000_PROJECT_ROOT" &amp;&amp; /usr/bin/env npm start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SM3000_PROJECT_ROOT</key>
    <string>$project_root_xml</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>$project_root_xml</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$stdout_xml</string>
  <key>StandardErrorPath</key>
  <string>$stderr_xml</string>
</dict>
</plist>
PLIST
}

echo
echo "========================================"
echo "  Screenshot Maschine 3000 - macOS setup"
echo "========================================"
echo

if [ ! -f "$PROJECT_ROOT/monitor.js" ]; then
  echo "monitor.js not found in: $PROJECT_ROOT"
  exit 1
fi

export SM3000_PROJECT_ROOT="$PROJECT_ROOT"

echo "-> Checking Node.js..."
if ! /bin/zsh -lc 'command -v node >/dev/null 2>&1'; then
  echo "Node.js is not installed or is not available in your login shell."
  echo "Install the LTS version from https://nodejs.org/ and run this script again."
  exit 1
fi
echo "   Node $(/bin/zsh -lc 'node --version')"

echo "-> Installing dependencies..."
/bin/zsh -lc 'cd "$SM3000_PROJECT_ROOT" && npm install'

echo "-> Checking configuration..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ ! -f "$PROJECT_ROOT/.env.example" ]; then
    echo ".env and .env.example are missing."
    exit 1
  fi
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  echo "   Created .env from .env.example."
else
  echo "   .env already exists."
fi

mkdir -p "$PROJECT_ROOT/logs" "$PROJECT_ROOT/screenshots"

if [ "$skip_desktop_launcher" = false ]; then
  echo "-> Creating Desktop launcher..."
  write_desktop_launcher
  echo "   $DESKTOP_LAUNCHER"
fi

if [ "$skip_login_item" = false ]; then
  echo "-> Creating login item..."
  write_launch_agent
  echo "   $LAUNCH_AGENT_PATH"
fi

echo
echo "Done."
echo
echo "Next steps:"
if [ "$skip_desktop_launcher" = false ]; then
  echo "  1. Open the Desktop launcher: $APP_NAME"
else
  echo "  1. Run: npm start"
fi
echo "  2. Scan the WhatsApp QR code in the app window if needed."
echo "  3. Enter WhatsApp contacts or Telegram chat names, then save."
if [ "$skip_login_item" = false ]; then
  echo "  4. The dashboard will also open after your next macOS login."
fi
echo
