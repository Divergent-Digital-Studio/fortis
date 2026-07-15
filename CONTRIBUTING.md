# Contributing to Fortis

Thank you for your interest in improving Fortis. This document explains how to
set up the project, the conventions we follow, and how to submit changes.

## Development setup

Requirements: Node.js 20+, npm.

```bash
npm install      # install dependencies
npm run dev      # launch the app in development mode
```

### Useful scripts

| Script                      | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `npm run dev`               | Launch Electron in dev mode with hot reload    |
| `npm run build`             | Type-check + production build (electron-vite)  |
| `npm run typecheck`         | TypeScript type-check (node + web configs)     |
| `npm run test`              | Run the Vitest suite                           |
| `npm run check`             | The release gate: typecheck + tests + build    |

The single source of truth for "is this releasable" is `npm run check`. Every
pull request must keep it green.

## Code conventions

These are enforced by review and CI. Match the surrounding code.

- **TypeScript strict** everywhere; no `any`, no `@ts-ignore`.
- **English only** in all code, comments, and commit messages.
- **No code comments** in implementation files. Let names and types speak. The
  only acceptable inline annotation is a `// noop` marker inside an
  intentionally-empty `catch`.
- **Single source of truth.** When a list of keys, channels, or tiers exists,
  it lives in one place (e.g. `src/shared/types/settings.ts`) and others derive
  from it.
- **No silent catches.** Either handle, rethrow, or log; never swallow.
- **Renderer UI**: Lucide icons, the in-repo design-system primitives, CSS
  variables from the theme. No native `<select>` unless explicitly justified.
- **Accessibility**: dialogs are keyboard-accessible, focus is trapped and
  restored, visible focus indicators are preserved.

## Testing discipline

- Pure logic is unit-tested (Vitest, co-located `.test.ts`).
- Electron/SQLite paths are smoke-tested (`tests/smoke/*.cjs`, run via Electron).
- IPC handlers are tested via the contract harness in
  `tests/node/int-ipc-contract.test.ts` (mock `electron`, drive handlers).
- New security-sensitive logic must include adversarial tests (tamper, forgery,
  expiry, boundary cases), not just happy paths.

When you add a setting key, update the drift-guard test
(`tests/node/sec-sensitive-keys-drift.test.ts`) and the validator test
(`tests/node/int-04-settings-validator.test.ts`).

## Pull request checklist

- [ ] `npm run check` is green (typecheck + tests + build).
- [ ] New behavior is tested, including failure / adversarial paths.
- [ ] No secrets, private keys, or internal paths are introduced.
- [ ] Public-API or settings changes update the relevant shared types and any
      drift guards.
- [ ] The PR description explains the *why*, not just the *what*.

## Reporting issues

Use GitHub Issues for bugs and feature requests. For security issues, follow
[SECURITY.md](./SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT license](./LICENSE).
