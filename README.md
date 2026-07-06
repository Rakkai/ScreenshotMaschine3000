# Screenshot Maschine 3000

A desktop app that watches WhatsApp Web and Telegram Web and saves screenshots when selected contacts or chats receive messages.

## Why This Exists

This project started as a small defensive tool for a friend who was being harrassed via messengers and needed a way to preserve screenshots in case police or a lawyer ever needed hard evidence to initiate legal action. This extended to messages and chats that were deleted after being sent or read, so preserving them was even harder.

It proved incredibly useful in this context, so we figured we should share it for others to protect themselves, too.

This little tool creates a screenshot of incoming messages from selected contacts on WhatsApp and Telegram. The screenshots are created shortly after receiving them, so later edits and deletions are ignored but the screenshots kept. 

It is intended only for personal, authorized, GDPR-compliant evidence preservation on accounts you control. Keep saved screenshots local and private, and share them only with police, lawyers, courts, or victim-support services when needed.

## Important Notice

This uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library, and browser automation for Telegram Web. Use it only on accounts and devices you own/control, and only for legal/authorized use.

WhatsApp and Telegram can change their web apps at any time. If login, contact loading, or screenshots suddenly stop working, first update dependencies and then check whether the web UI changed.

## Requirements

- Node.js 18 or newer
- npm
- A browser the monitor can use: Chrome, Edge, Chromium, or Puppeteer's managed browser
- A WhatsApp account, Telegram account, or both, depending on what you want to monitor

If browser launch fails, install Chrome/Edge/Chromium or set `PUPPETEER_EXECUTABLE_PATH` in `.env`.

## Quick Start

From a fresh clone:

```bash
npm install
npm start
```

`npm start` opens the desktop dashboard and creates a local `.env` automatically if one does not exist. On first run:

1. Scan the WhatsApp QR code in the app window if you want WhatsApp monitoring.
2. Choose WhatsApp target contacts from the loaded contact list, or enter exact IDs/names manually.
3. Enter Telegram Web chat names if you want Telegram monitoring.
4. Choose a screenshot folder if the default is not right.
5. Click **Save**. The monitor restarts with the new settings.

Screenshots are saved as PNG files. WhatsApp filenames include the local timestamp, contact display name, sender ID, and message ID. Telegram filenames include the local timestamp, chat name, and a short hash of the detected message state.

## macOS Setup

For a normal macOS setup from this source folder:

```bash
./macos/setup.command
```

That script checks Node.js, runs `npm install`, creates `.env` from `.env.example` if needed, creates `logs/` and `screenshots/`, creates a Desktop launcher, and writes a LaunchAgent so the dashboard opens after your next macOS login.

To omit either piece, pass one or both skip flags:

```bash
./macos/setup.command --skip-login-item
./macos/setup.command --skip-desktop-launcher
```

To remove the Desktop launcher and login item:

```bash
./macos/uninstall.command
```

The uninstall helper does not delete screenshots, logs, `.env`, or browser login sessions.

## Windows Setup

For a non-technical Windows setup from this source folder:

```powershell
.\windows\Einrichten.bat
```

That script checks Node.js, runs `npm install`, creates `.env` from `.env.example` if needed, creates `logs/` and `screenshots/`, adds a desktop shortcut, and registers a startup task that opens the dashboard after login.

To remove the desktop shortcut and startup task:

```powershell
.\windows\Deinstallieren.bat
```

The uninstall helper does not delete screenshots, logs, `.env`, or browser login sessions.

## Normal Use

Open **Screenshot Maschine 3000**.

The app window lets you:

- scan the WhatsApp login QR code
- select one or more target contacts after WhatsApp is connected
- enter contact IDs or exact names manually
- enter Telegram Web chat names manually
- choose and open the screenshot folder
- adjust the same settings that are stored in `.env`
- start, stop, and restart the monitor
- see recent activity without opening a terminal

The old terminal monitor is still available:

```bash
npm run monitor
```

Use that only if `.env` already contains target contacts or Telegram chat names. The terminal version prints the WhatsApp QR code in the terminal and has no dashboard contact picker.

## Configuration

In development, config is read from this project's `.env`.

In packaged desktop builds, config is stored in the app data folder so installed apps can write settings without administrator access.

For normal use, do not create `.env` by hand. The dashboard and setup scripts create it when missing. Use `.env.example` as the reference when editing settings manually.

Supported settings:

```env
TARGET_CONTACT_IDS=
TARGET_CONTACT_NAMES=
TARGET_CONTACT_ID=
TARGET_CONTACT_NAME=
TELEGRAM_TARGET_CHAT_NAMES=
TELEGRAM_AUTH_PATH=./.telegram_auth
TELEGRAM_POLL_MS=3000
TELEGRAM_WEB_URL=https://web.telegram.org/k/
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

For best WhatsApp reliability, use contact IDs in WhatsApp JID format, for example `4917612345678@c.us`. The dashboard can fill these IDs from the WhatsApp contacts list after login.

`TARGET_CONTACT_ID` and `TARGET_CONTACT_NAME` are legacy single-contact fields. Prefer `TARGET_CONTACT_IDS` and `TARGET_CONTACT_NAMES` for new setups.

Telegram Web chats are matched by exact visible chat name. On first run, sign in inside the opened Telegram Web browser window; session data is saved in `TELEGRAM_AUTH_PATH`. Telegram monitoring polls the configured chats because Telegram Web does not expose the same incoming-message event hook as WhatsApp Web.

## Local Files

These folders/files are created locally and are intentionally ignored by git:

- `.env` - local settings
- `.wwebjs_auth/` - WhatsApp Web login/session data
- `.telegram_auth/` - Telegram Web login/session data
- `.wwebjs_cache/` - WhatsApp Web cache
- `screenshots/` - captured evidence images
- `logs/` - monitor log output
- `node_modules/` - installed npm dependencies
- `dist/` - generated app builds/installers

Do not commit `.env`, auth folders, screenshots, or logs. They can contain private data.

## Checks

Run the lightweight syntax and regression checks:

```bash
npm run check
```

Create an unpacked desktop app for a packaging smoke test:

```bash
npm run pack
```



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

Generated installers and unpacked apps are written to `dist/`.

## Troubleshooting

If the app cannot start after a fresh checkout, run `npm install`.

If WhatsApp asks for login again, scan the QR code in the dashboard. Removing `.wwebjs_auth/` resets the WhatsApp Web session.

If Telegram asks for login again, sign in in the Telegram browser window. Removing `.telegram_auth/` resets the Telegram Web session.

If no screenshots are saved, confirm that targets are configured, the monitor status says `Monitoring`, and `SCREENSHOT_DIR` points to a writable folder.

If the browser does not open, install Chrome/Edge/Chromium or set `PUPPETEER_EXECUTABLE_PATH` to the browser executable.