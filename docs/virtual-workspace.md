# OnarSuite Virtual Workspace — shared contract

The Virtual Workspace is the single AI-readable layer over every data source.
Max AI never talks to Google Drive, Gmail, GitHub or the file system directly —
it talks to the Workspace, and the Workspace decides which provider to query.

This document is the **shared contract** between OnarSuite Desktop (TypeScript /
Electron) and OnarSuite Online (PHP / Laravel). Both sides implement the same
model so a resource looks identical regardless of origin.

- Desktop implementation: `apps/desktop-agent/src/main/services/workspace/*`
  and the shared types in `apps/desktop-agent/src/shared/workspace.ts`.
- Online implementation: `app/Workspace/*` (mirrors this contract on top of the
  existing `app/Integrations` connectors).

## Logical tree

```
/workspace
  /local        → OnarSuite Desktop Memory Engine (local-first)
  /cloud        → OnarSuite Cloud account data
  /connectors   → google-drive, gmail, github, notion, onedrive, dropbox, …
  /memory       → index, cards (.osmem), chunks, entities, relations
```

## Resource

Everything is a `Resource`, independent of provenance:

| field | notes |
|-------|-------|
| id, source (`local`/`cloud`/`connector`), provider | identity + routing |
| path, virtualPath | native path + stable `/workspace/...` path |
| name, type, mime, extension, size, hash | descriptors |
| createdAt, modifiedAt, indexedAt | timestamps |
| privacy | see below |
| metadata | provider-specific extras |

### Privacy flags (never send local data to cloud automatically)

`localOnly`, `askBeforeCloud`, `sensitiveDetected`, `excludedFromAi`,
`allowedScopes`, `readOnly`, `canSync`, `canEmbed`, `canSummarize`.

## Provider contract

A provider exposes `status()`, `search()`, `get(id)`, `card(id)` and a set of
capabilities (`search`/`read`/`card`/`scan`/`sync`/`write`). Adding a connector
means adding a provider — nothing else in the pipeline changes.

## Retrieval scores

`semantic` (0 until Phase 2 embeddings) + `keyword` are recall signals;
`recency` + `permission` re-rank; `final` is the blended ordering score.

## AI Context Builder

Input: `{ query, level (simple|medium|advanced), mode (desktop|cloud|hybrid), providers? }`.

Steps: query the Workspace → drop ineligible (excluded / permission 0) → add
OSMEM cards by final score until the token budget fills.

Output: `{ context, usedTokens, maxTokens, includedResources, excludedResources, reason }`.

## OSMEM card

`OSMEM/1.0` text format produced by the Memory Engine — see
`apps/desktop-agent/src/main/services/owner-memory/osmem.ts`. Contains node id,
descriptors, summaries, topics, entities, relations, permissions and chunk index.

## Desktop IPC surface

`workspace:providers`, `workspace:status`, `workspace:search`,
`workspace:resource`, `workspace:card`, `workspace:context`. The legacy
`memory:*` channels stay for backward compatibility — the Workspace wraps the
same engine.

## Online API surface (mirror)

`GET  /workspace/providers` · `GET /workspace/status` ·
`GET  /workspace/search?q=` · `GET /workspace/resource/{id}` ·
`GET  /workspace/card/{id}` · `POST /workspace/context`.
