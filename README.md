# Fortis

> A privacy-first network security monitor for your desktop.

Fortis shows you every connection your computer makes, flags suspicious ones,
and lets you act on them — all locally, with optional AI analysis.

![platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![tests](https://img.shields.io/badge/tests-vitest%20%2B%20electron--vite-success)

---

## What it does

- **Connection visibility** — live list of every outbound/inbound connection
  with process, remote IP, port, and geo-location.
- **Anomaly detection** — new-device alerts, VPN leak detection, certificate
  expiry monitoring, insider-threat behavioral scoring.
- **Active defense (manual-confirm)** — suggest a kill or IP block, then act on
  it only after explicit confirmation. Rules never auto-execute.
- **AI analysis (BYOK or local)** — bring your own OpenAI/Anthropic key, or run
  a local Ollama model. Everything sent to the AI is inspectable via the
  **View AI Payload** dialog; private IPs are hashed first.
- **Reports & compliance** — weekly rollups, CSV/PDF export, SOC2/ISO/PCI/
  HIPAA/GDPR templates.
- **Enterprise integrations** — RBAC, REST API, SIEM (Splunk/ELK/Datadog),
  PagerDuty, headless remote agents.

## Privacy by design

- Your network data and alerts live in a **SQLCipher-encrypted** local
  database. The DB key is sealed by your OS keychain.
- **Private IPs are hashed** (salted SHA-256) before anything leaves the
  machine. **Public IPs and process names are sent to the AI provider by
  design** — that is what the AI analyzes. You can inspect exactly what is sent
  at any time.
- Optional community threat-intel submission is **off by default** and sends
  only salted-hashed indicators, never raw IPs or hostnames.

## Getting started (development)

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

### Scripts

| Script                | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Launch in development mode                |
| `npm run check`       | Release gate: typecheck + tests + build   |
| `npm run test`        | Run the Vitest suite                      |
| `npm run build`       | Production build via electron-vite        |
| `npm run typecheck`   | TypeScript type-check                     |

## Architecture

```
src/
  main/         Electron main process: services, IPC, DB, defense, AI
  renderer/     React + Zustand + Vite UI
  preload/      contextBridge (no node integration; sandboxed)
  shared/       Types and pure logic shared across processes
  agent/        Headless CLI agent (no Electron, no SQLite) for remote hosts
resources/      Bundled datasets (DB-IP GeoIP city, OUI), icons
scripts/        Build tooling + license keygen
website/        Static download site (built to dist-site/)
```

Defense actions are **manual-confirm only**. The rule engine creates
*suggestions* (status `pending`); nothing executes without an explicit confirm.

## Releasing / distributing

See [`docs/RELEASE.md`](./docs/RELEASE.md) for the complete owner checklist.
The short version:

1. Set GitHub Variables `FORTIS_REPO_OWNER` and `FORTIS_PUBLISHER_NAME`.
2. Generate a license keypair with `node scripts/license-keygen.mjs init` and
   replace the public key in `src/main/services/license/public-key.ts`.
3. Provide code-signing secrets (Apple Developer ID + Windows cert) as GitHub
   Secrets.
4. Push a `v*` tag — the `release.yml` workflow builds signed installers for
   mac/Windows/Linux and publishes a GitHub Release.

## Licensing model

Fortis is open-source (MIT). Paid tiers are gated by **ed25519-signed license
tokens** that the app verifies offline against an embedded public key. The
maintainers hold the signing private key offline. If you fork and ship your own
builds, generate your own keypair so your license grants are independent.

Tier grants are honored for honest users. As with any client-side licensing,
nothing stops a determined attacker from patching the binary — the realistic
guarantee is "honest-user gating," not tamper-proof enforcement.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Security reports: see
[`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE). Third-party data attributions (IP Geolocation by DB-IP under
CC BY 4.0, IEEE OUI) are noted in the LICENSE file.
