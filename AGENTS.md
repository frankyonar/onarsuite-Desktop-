# OnarSuite Desktop — agent playbook

Shared conventions for every AI agent working on this repo (Claude Code, Codex,
etc.). Read this before making changes so we don't step on each other.

## What this is

OnarSuite Desktop ("Max Desktop") is an Electron + React + TypeScript desktop
app: an autonomous AI agent ("Max") for the OnarSuite business platform, plus
local file/code tools. Monorepo; the app lives in `apps/desktop-agent`.

- `src/main` — Electron main process. `desktop-runtime.ts` orchestrates;
  `services/` has `agent-engine` (tool-use loop), `tools` (local read/write/
  edit/shell, confined to authorized folders), `conversation-store`,
  `agent-sdk` (talks to OnarSuite), `update-service` (electron-updater).
- `src/preload/index.ts` — the `window.maxDesktop` bridge. Every IPC method is
  declared in `src/shared/types.ts` (`MaxDesktopApi`) and mocked in
  `src/renderer/src/preview-api.ts`.
- `src/renderer/src/App.tsx` — the whole UI (chat console, sidebar history,
  the resizable right "Lock" column: preview / file editor / embedded web).
- Server side lives in the **onarsuite** repo (`C:\xampp\htdocs\onarsuite`):
  `packages/workdo/AgentGateway` (device pairing, `/api/max/desktop/agent`,
  `/desktop/authorize`, `/desktop/web-login`) and `app/Http/Controllers/
  AiAssistantController.php` (the shared action dispatcher).

## Branching — ONE mainline

- **`main` is the integration branch. Do all work on `main`.**
- The legacy `codex/chatgpt-like-ui` branch is kept in sync with `main` only for
  back-compat; prefer `main`. If you must use it, fast-forward it to `main`
  first and merge back immediately.
- **Always `git fetch` + `git pull --rebase origin main` before pushing.** Two
  agents push here — never force-push shared branches.

## Versioning — bump these THREE together (they have drifted before)

1. `apps/desktop-agent/package.json` → `"version"`
2. `apps/desktop-agent/src/shared/types.ts` → `APP_VERSION`
3. `apps/desktop-agent/src/renderer/src/preview-api.ts` → `appVersion`

Use semver `0.9.x`. The sidebar shows `APP_VERSION`; the installer + auto-update
use `package.json`. They MUST match.

## Build & verify (Node 22, npm 10)

From `apps/desktop-agent`:

```
npm run typecheck   # tsc, both tsconfigs — must pass
npm test            # vitest
npm run build       # electron-vite build
```

Note: the renderer can't be browser-previewed via a static server (strict CSP +
1 MB ESM won't execute headless). Verify with typecheck + build, not screenshots.

## Installer + GitHub release (auto-update)

```
cd apps/desktop-agent
NODE_OPTIONS=--use-system-ca npx electron-builder --win nsis --x64
```

- Run the builder with the Bash/PowerShell **sandbox disabled**, or signing
  throws `spawn EPERM`. If you get `EPERM rename win-unpacked`, stop the running
  `OnarSuite` process and delete `release/win-unpacked(.tmp)` then rebuild.
- Then publish with the repo-root script:
  `powershell -ExecutionPolicy Bypass -File publish-release.ps1`
  It reads the version from package.json, creates the GitHub release, and
  uploads `exe` + `.blockmap` + `latest.yml` (the last is required for
  electron-updater). The GitHub repo id is hard-coded (it was renamed to
  `frankyonar/onarsuite-Desktop-`); the token comes from the git credential
  store (kept local).

## Gotchas (learned the hard way)

- **Commit messages must be quote-free.** Double quotes inside a PowerShell
  here-string (`-m @'...'@`) break parsing and split the message into pathspecs.
- **`AGENT_SYSTEM` in `agent-engine.ts` is a backtick template literal** — never
  put backtick-wrapped shell commands inside it; use double quotes.
- **In the onarsuite repo**, the working tree always shows `public/build/assets/*`
  as deleted (CI churn). Do NOT commit those deletions — `git stash push --
  public/build` before a rebase, then `stash drop`. CI rebuilds assets on push.
- Agent file tools are confined to authorized folders (workspace is always
  authorized). Keep that boundary; it's the security model.
- End commit messages with: `Co-Authored-By: <your-model> <noreply@anthropic.com>`.

## Architecture quick-reference for adding a feature

A new capability usually touches: a tool/method in `desktop-runtime.ts` (or a
service) → an IPC handler in `src/main/index.ts` → `src/preload/index.ts` →
`MaxDesktopApi` in `src/shared/types.ts` → the mock in `preview-api.ts` → UI in
`App.tsx`. Keep all five in sync or typecheck fails.
