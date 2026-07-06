# Security Policy

## Supported Versions

This project is maintained on a best-effort basis. Security fixes target the latest code on the default branch.

| Version | Supported |
| --- | --- |
| `main` / latest release | Yes |
| Older commits or local forks | No |

## Reporting a Vulnerability

Please do not open a public issue with exploit details, private screenshots, auth folders, session data, logs, contact IDs, phone numbers, or message contents.

Preferred reporting flow:

1. Use GitHub's private vulnerability reporting feature from the repository Security tab if it is available.
2. If private vulnerability reporting is not available, contact the maintainer through the contact information on the maintainer's GitHub profile.
3. If you cannot find a private channel, open a minimal public issue saying that you have a security concern to report, but do not include technical details or private data.

Useful reports include:

- the affected version or commit
- a clear description of the impact
- minimal reproduction steps
- whether private data, screenshots, logs, auth folders, or messenger sessions are involved

## Scope

Security reports are especially useful for issues involving:

- unsafe handling of `.env`, screenshots, logs, or auth/session folders
- command execution, path traversal, or file overwrite risks
- Electron IPC or preload isolation mistakes
- dependency vulnerabilities with a practical impact on this app
- behavior that could enable unauthorized monitoring or data capture

Issues in WhatsApp, Telegram, Chrome, Chromium, or Electron itself should usually be reported to those upstream projects unless this app is misusing them in a way that creates additional risk.

## Response Expectations

This is a small project, so response times are best effort. Valid reports will be prioritized over normal feature work, and fixes will be documented in the repository once disclosure is safe.
