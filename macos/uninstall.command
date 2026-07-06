#!/bin/zsh
set -euo pipefail

APP_NAME="Screenshot Maschine 3000"
LAUNCH_AGENT_LABEL="com.screenshotmaschine3000.dashboard"
LAUNCH_AGENT_PATH="$HOME/Library/LaunchAgents/$LAUNCH_AGENT_LABEL.plist"
DESKTOP_LAUNCHER="$HOME/Desktop/$APP_NAME.command"

echo
echo "Screenshot Maschine 3000 - macOS uninstall"
echo

if [ -f "$LAUNCH_AGENT_PATH" ]; then
  launchctl bootout "gui/$UID" "$LAUNCH_AGENT_PATH" >/dev/null 2>&1 || true
  rm -f "$LAUNCH_AGENT_PATH"
  echo "Removed login item: $LAUNCH_AGENT_PATH"
else
  echo "No login item found."
fi

if [ -f "$DESKTOP_LAUNCHER" ]; then
  rm -f "$DESKTOP_LAUNCHER"
  echo "Removed Desktop launcher: $DESKTOP_LAUNCHER"
else
  echo "No Desktop launcher found."
fi

echo
echo "Done. Screenshots, logs, .env, and browser login sessions were not deleted."
echo
