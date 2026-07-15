# Security Policy

Fortis is a desktop network-security monitor. We take security reports
seriously. This document explains how to report a vulnerability and what to
expect.

## Reporting a vulnerability

**Please do NOT report security vulnerabilities via public GitHub issues.**

Instead, report them privately using GitHub's advisory feature:

1. Go to the **Security** tab of this repository.
2. Click **Advisories → New draft security advisory**.
3. Describe the issue, the steps to reproduce, and the impact.

If you prefer email, send a PGP-encrypted message to the maintainers (include
your public key). Acknowledge within 48 hours.

Include, where possible:

- A clear description of the vulnerability and its security impact.
- Steps to reproduce (a minimal reproducer is ideal).
- Affected versions / platforms.
- Any suggested remediation.

## Scope

In scope:

- Fortis desktop application (this repository), including the main process, the
  renderer, the headless agent, and the build/distribution pipeline.
- Cryptographic handling (license verification, secret encryption at rest, the
  remote-agent token handshake).
- Privilege/RBAC enforcement on the IPC and REST surfaces.
- The auto-update mechanism.
- Command-execution paths (firewall rule building, kill commands, network
  parsers).

Out of scope:

- Vulnerabilities in third-party dependencies already disclosed to their
  maintainers (report upstream).
- Self-inflicted issues from running with RBAC disabled in a multi-user
  environment (the default, recommended single-user configuration is assumed).
- Issues that require the attacker to already have the user's OS account or the
  application's local SQLite database (the database is SQLCipher-encrypted, but
  an attacker with the user's OS account and OS keychain access already wins).

## Threat model summary

Fortis is a single-user desktop application by default. The security boundary
it maintains is:

- Secrets (AI API keys, license keys, integration tokens) are encrypted at rest
  with AES-256-GCM; the key is protected by the OS keychain.
- The renderer is sandboxed (context isolation on, node integration off).
- Defense actions (kill process, block IP) are **manual-confirm only**; rules
  never auto-execute.
- When RBAC is enabled (optional), every IPC channel is scope-checked.
- Public IPs and process names are sent to the configured AI provider by
  design; private IPs are hashed before any AI call. Use the **View AI
  Payload** dialog to inspect exactly what is sent.

A determined attacker who controls the user's OS account, the OS keychain, or
who patches the binary can bypass client-only controls. This is an inherent
limitation of any local-first desktop licensing model, not a defect.

## License key custody

The shipped application embeds an ed25519 **public** key and verifies tier
grants against it. The matching **private** key is held offline by the
maintainers. Anyone with the source code can read the public key but cannot
forge a valid license without the private key. If you fork this project and
ship your own builds, generate your own keypair with
`node scripts/license-keygen.mjs init` and replace the public key in
`src/main/services/license/public-key.ts` before release.

## Disclosure policy

- We acknowledge receipt within 48 hours.
- We aim to provide an initial assessment within 7 days.
- We coordinate a fix and disclosure timeline with the reporter.
- Credit is given to the reporter in the advisory unless they prefer to remain
  anonymous.
