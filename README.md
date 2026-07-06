# WhatsApp Web Message Screenshot Monitor

A local Node.js script that watches incoming WhatsApp Web messages and saves a screenshot whenever a specific contact sends a message.

## Tooling research summary

This build uses `whatsapp-web.js` because it already provides:
- Event hooks for incoming messages (`client.on('message', ...)`).
- Local session persistence via `LocalAuth`.
- Direct access to Puppeteer page (`client.pupPage`) for screenshots.

Why this stack:
- `whatsapp-web.js` is designed around WhatsApp Web and exposes high-level events.
- Screenshot capture is handled by Puppeteer's `page.screenshot(...)` API.
- QR login can be handled in terminal using `qrcode-terminal`.

## Important caveat

This approach relies on an unofficial WhatsApp Web automation library. Use it only on accounts and devices you own/control, and only for legal/authorized use.

## Prerequisites

- Node.js 18+
- A local browser environment (script defaults to headed mode for easy pairing)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from example:

```bash
cp .env.example .env
```

3. Edit `.env` and set at least one target:

```env
TARGET_CONTACT_ID=4917612345678@c.us
# OR
TARGET_CONTACT_NAME=Alice
```

Best reliability is `TARGET_CONTACT_ID`.

## Run

```bash
npm start
```

On first run:
- A QR code is printed in terminal.
- Scan it in WhatsApp mobile app:
  - `Settings` -> `Linked Devices` -> `Link a Device`

After login, the script listens for new messages and stores PNG screenshots in `./screenshots`.

## How matching works

- If `TARGET_CONTACT_ID` is set, matching is exact against `message.from`.
- If only `TARGET_CONTACT_NAME` is set, script tries to resolve a unique ID from contacts/chats on startup.
- If unique resolution fails, it falls back to runtime exact name checks (case-insensitive).

## Output naming

Screenshot filenames include:
- local timestamp
- contact display name
- sender id
- message id

Example:

```text
20260517_213400__Alice__4917612345678_c.us__false_3A7....png
```

## Useful commands

```bash
npm run check   # Syntax check
npm start       # Start monitor
```

## Notes

- Session data is saved in `./.wwebjs_auth` so you usually scan QR only once.
- Set `HEADLESS=true` in `.env` if you want hidden browser mode.
- Set `FULL_PAGE_SCREENSHOT=false` to capture only viewport instead of full page.
- `AUTO_OPEN_CHAT_BEFORE_SCREENSHOT=true` forces WhatsApp Web to open the sender chat before capture (helps ensure newest message is visible).
- `MESSAGE_RENDER_WAIT_MS=1200` controls extra render delay before capture if WhatsApp UI is slow.
- `DEBUG_FOCUS=true` prints chat-focus method diagnostics in terminal.
- On disconnect, the monitor reconnects automatically (`RECONNECT_BASE_MS`, `RECONNECT_MAX_MS`).

## Windows-Einrichtung (für nicht-technische Nutzer)

Für einen Windows-PC mit Desktop-Verknüpfung und Autostart nach Neustart:

### Voraussetzungen

1. [Node.js LTS](https://nodejs.org/) installieren (Standard-Einstellungen reichen).
2. Dieses Projekt auf den PC kopieren, z. B. nach `C:\ScreenshotMaschine3000`.
3. In `.env` den Zielkontakt eintragen (`TARGET_CONTACT_ID` oder `TARGET_CONTACT_NAME`).

### Einmalige Einrichtung

Doppelklick auf:

```text
windows\Einrichten.bat
```

Das Skript:

- installiert npm-Abhängigkeiten,
- legt bei Bedarf `.env` aus der Vorlage an,
- erstellt die Desktop-Verknüpfung **Screenshot Maschine 3000**,
- registriert den Autostart (45 Sekunden nach Windows-Anmeldung).

### Erster Start (QR-Code scannen)

1. Desktop-Verknüpfung **Screenshot Maschine 3000** doppelklicken.
2. Im Terminal den QR-Code mit WhatsApp scannen:
   - Handy: `Einstellungen` → `Verknüpfte Geräte` → `Gerät hinzufügen`
3. Fenster offen lassen — das Programm läuft.

Danach meldet sich WhatsApp automatisch wieder an (Session in `.wwebjs_auth`). Beim PC-Neustart startet das Programm von selbst **unsichtbar im Hintergrund** — kein leeres Terminal-Fenster.

> **Hinweis:** Beim Autostart kann kurz ein Chrome-Fenster (WhatsApp Web) aufblitzen. Das ist normal, solange `HEADLESS=false` gesetzt ist.

### Screenshots & Logs

- Screenshots: `screenshots\`
- Logdatei (v. a. bei Autostart): `logs\monitor.log`

### Autostart wieder entfernen

Doppelklick auf:

```text
windows\Deinstallieren.bat
```

### Windows-Dateien

| Datei | Zweck |
| --- | --- |
| `windows\Einrichten.bat` | Einmalige Einrichtung (Verknüpfung + Autostart) |
| `windows\start-monitor.bat` | Manueller Start über Desktop-Verknüpfung |
| `windows\start-monitor-background.vbs` | Hintergrundstart für Autostart |
| `windows\Deinstallieren.bat` | Verknüpfung und Autostart entfernen |
