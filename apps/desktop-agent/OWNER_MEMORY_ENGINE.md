# Owner Memory Engine

The first local-first memory phase is implemented in the Electron main process. Its persistent index is stored at `max-desktop/owner-memory/index.json` under Electron's user-data directory. No indexed content or metadata is sent to cloud services.

## Internal API

The preload bridge exposes these calls to trusted renderer code:

```ts
await window.maxDesktop.scanMemory(); // workspace plus all authorized folders
await window.maxDesktop.scanMemory(folderPath); // one authorized folder

const status = await window.maxDesktop.getMemoryStatus();
const results = await window.maxDesktop.searchMemory('cliente Rossi contratto', {
  limit: 10,
  extension: 'pdf',
});
const card = await window.maxDesktop.getMemoryCard(results[0].record.id);
const context = await window.maxDesktop.getMemoryContext('cliente Rossi contratto', 'medium');
```

`scanMemory` recursively indexes file metadata and SHA-256 hashes, ignores common dependency/build/cache/system paths, and preserves unchanged records using size plus modification time. Supported PDF, DOCX, XLSX, CSV, TXT and Markdown files are parsed locally through the existing document adapters and split into chunks. Other formats remain useful as metadata-only records.

Search uses weighted keyword matching over file name, path, summaries, topics, entities and chunk text. `getMemoryContext` returns ranked `.osmem` cards and relevant chunk previews within the selected approximate token budget: 1,000 (`simple`), 4,000 (`medium`) or 12,000 (`advanced`).

Privacy defaults are `localOnly: true`, `askBeforeCloud: true`, no automatic sensitive-data claim, and no exclusion from AI. The schema reserves entities, relations, allowed scopes and embedding state without activating cloud or embedding services.

## Phase 2 boundaries

The module leaves explicit extension points for semantic/full-text ranking, local or remote embeddings, OCR, richer parsers, graph relations, granular folder/file policies, optional cloud synchronization, model routing and a complete memory-management UI.
