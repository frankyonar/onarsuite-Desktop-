import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnarOwnerMemoryEngine } from './owner-memory-engine';

describe('OnarOwnerMemoryEngine snapshots', () => {
  let dir: string;
  let root: string;
  let engine: OnarOwnerMemoryEngine;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'osmem-snap-'));
    root = path.join(dir, 'docs');
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'a.txt'), 'primo documento cliente rossi', 'utf8');
    await writeFile(path.join(root, 'b.txt'), 'secondo documento importo €50', 'utf8');
    engine = new OnarOwnerMemoryEngine(dir);
    await engine.scan([root]);
  });

  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('captures the current index and lists it', async () => {
    const meta = await engine.snapshot('due file');
    expect(meta.records).toBe(2);
    expect(meta.label).toBe('due file');
    const list = await engine.listSnapshots();
    expect(list.map((s) => s.id)).toContain(meta.id);
  });

  it('restores a snapshot after the index changed', async () => {
    const meta = await engine.snapshot('baseline');
    await writeFile(path.join(root, 'c.txt'), 'terzo documento', 'utf8');
    await engine.scan([root]);
    expect(await engine.count()).toBe(3);

    await engine.restoreSnapshot(meta.id);
    expect(await engine.count()).toBe(2);
    expect((await engine.getStatus()).totalFiles).toBe(2);
  });

  it('updates and persists a record privacy flag', async () => {
    const before = await engine.search('primo');
    const id = before[0].record.id;
    await engine.setPrivacy(id, { excludedFromAi: true, localOnly: true });
    const record = await engine.record(id);
    expect(record?.privacy.excludedFromAi).toBe(true);
    expect(record?.privacy.localOnly).toBe(true);
    // survives a fresh engine reading the same index
    const reopened = new OnarOwnerMemoryEngine(dir);
    expect((await reopened.record(id))?.privacy.excludedFromAi).toBe(true);
  });

  it('deletes a snapshot and rejects restoring a missing one', async () => {
    const meta = await engine.snapshot();
    await engine.deleteSnapshot(meta.id);
    expect((await engine.listSnapshots()).some((s) => s.id === meta.id)).toBe(false);
    await expect(engine.restoreSnapshot(meta.id)).rejects.toThrow();
  });
});
