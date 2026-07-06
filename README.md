# Screenshot Maschine 3000

A desktop app that watches WhatsApp Web and saves screenshots when selected contacts send messages.

## Important Caveat

This uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. Use it only on accounts and devices you own/control, and only for legal/authorized use.

## Normal Use

Open **Screenshot Maschine 3000**.

The app window lets you:

- scan the WhatsApp login QR code
- select one or more target contacts after WhatsApp is connected
- enter contact IDs or exact names manually
- choose and open the screenshot folder
- adjust the same settings that are stored in `.env`
- start, stop, and restart the monitor
- see recent activity without opening a terminal

Screenshots are saved as PNG files. Filenames include the local timestamp, contact display name, sender ID, and message ID.

## Installers

Build a local installer from this project:

```bash
npm install
npm run dist:mac
```

On Windows, build the Windows installer on a Windows machine:

```powershell
npm install
npm run dist:win
```

Generated installers are written to `dist/`.

## Run From Source

Node.js 18+ is required when running from source.

```bash
npm install
npm start
```

`npm start` opens the desktop dashboard. The old terminal monitor is still available:

```bash
npm run monitor
```

On Windows, `windows\Einrichten.bat` installs dependencies, creates a desktop shortcut, and registers startup using the dashboard instead of the terminal monitor.

## Configuration

In development, config is read from this project’s `.env`.

In packaged desktop builds, config is stored in the app data folder so installed apps can write settings without administrator access.

Supported settings:

```env
TARGET_CONTACT_IDS=
TARGET_CONTACT_NAMES=
TARGET_CONTACT_ID=
TARGET_CONTACT_NAME=
SCREENSHOT_DIR=./screenshots
LOCAL_AUTH_PATH=./.wwebjs_auth
HEADLESS=false
FULL_PAGE_SCREENSHOT=true
AUTO_OPEN_CHAT_BEFORE_SCREENSHOT=true
MESSAGE_RENDER_WAIT_MS=1200
DEBUG_FOCUS=false
RECONNECT_BASE_MS=5000
RECONNECT_MAX_MS=120000
LOG_TO_FILE=true
LOG_FILE=./logs/monitor.log
PUPPETEER_EXECUTABLE_PATH=
```

For best reliability, use contact IDs in WhatsApp JID format, for example `4917612345678@c.us`. The dashboard can fill these IDs from the WhatsApp contacts list after login.

`PUPPETEER_EXECUTABLE_PATH` is optional. The monitor tries common Chrome, Edge, and Chromium locations on macOS, Windows, and Linux.

## Checks

```bash
npm run check
npm run pack
```

`npm run check` validates JavaScript syntax. `npm run pack` creates an unpacked desktop app for a quick packaging smoke test.
