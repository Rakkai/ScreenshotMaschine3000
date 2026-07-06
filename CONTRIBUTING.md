# Contributing

Thanks for considering a contribution to Screenshot Maschine 3000.

This is a small, maintainer-led project for personal, authorized evidence preservation. Contributions are welcome when they make the app safer, clearer, easier to run, or more reliable.

## Good Contributions

- Bug fixes for the dashboard, setup scripts, packaging, or monitor behavior.
- Documentation improvements, especially for non-technical users.
- Safer defaults around screenshots, logs, local auth folders, and configuration.
- Compatibility fixes for WhatsApp Web, Telegram Web, Electron, or Puppeteer changes.
- Small UI improvements that make normal workflows clearer.

## Out of Scope

Please do not open issues or pull requests for features that:

- hide monitoring from the account owner or local user
- capture credentials, session tokens, or auth data
- exfiltrate screenshots or logs to third-party services
- bypass messenger security or privacy controls
- monitor accounts, chats, contacts, or devices the user does not control

Those requests will be closed.

## Privacy

Do not attach private screenshots, logs, `.env` files, auth folders, contact IDs, phone numbers, chat names, or message contents to public issues or pull requests. Redact examples before sharing them.

If you think you found a security vulnerability, follow `SECURITY.md` instead of opening a public issue.

## Local Setup

```bash
npm install
npm start
```

The dashboard creates a local `.env` file when needed. Runtime folders such as `.wwebjs_auth/`, `.telegram_auth/`, `screenshots/`, `logs/`, `dist/`, and `node_modules/` should stay untracked.

## Checks

Before opening a pull request, run:

```bash
npm run check
```

For changes that affect packaging, setup scripts, or Electron configuration, also run:

```bash
npm run pack
```

## Pull Requests

Keep pull requests focused. Include:

- what changed
- why it changed
- how you verified it
- any privacy, security, or compatibility concerns

Maintainers may ask for changes or close pull requests that are too broad, unsafe, or outside the project's purpose.
