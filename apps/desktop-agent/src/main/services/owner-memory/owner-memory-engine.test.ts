import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OnarOwnerMemoryEngine } from './owner-memory-engine';
import { TokenBudgetManager } from './token-budget';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; engine: OnarOwnerMemoryEngine }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'onar-memory-'));
  temporaryDirectories.push(base);
  const root = path.join(base, 'authorized');
  await mkdir(root);
  return { root, engine: new OnarOwnerMemoryEngine(path.join(base, 'data')) };
}

describe('OnarOwnerMemoryEngine', () => {
  it('indexes supported content, ignores denied directories and skips unchanged files', async () => {
    const { root, engine } = await fixture();
    await writeFile(path.join(root, 'cliente-rossi.txt'), 'Contratto annuale per il cliente Rossi. Progetto turismo.');
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'node_modules', 'ignored.txt'), 'non indicizzare');

    const first = await engine.scan([root]);
    const second = await engine.scan([root]);

    expect(first).toMatchObject({ discovered: 1, indexed: 1, errors: 0 });
    expect(second).toMatchObject({ discovered: 1, indexed: 0, unchanged: 1, errors: 0 });
    expect(await engine.search('Rossi turismo')).toHaveLength(1);

    await engine.forgetRoot(root);
    expect(await engine.search('Rossi turismo')).toHaveLength(0);
  });

  it('reindexes changed files and produces an OSMEM card and bounded context', async () => {
    const { root, engine } = await fixture();
    const file = path.join(root, 'preventivo.md');
    await writeFile(file, '# Preventivo\nOfferta iniziale per Alfa Srl.');
    await engine.scan([root]);
    const before = (await engine.search('Alfa'))[0].record;

    await writeFile(file, '# Preventivo\nOfferta aggiornata per Alfa Srl e progetto Beta.');
    const future = new Date(Date.now() + 2_000);
    await utimes(file, future, future);
    const scan = await engine.scan([root]);
    const result = (await engine.search('Beta'))[0];
    const card = await engine.card(result.record.id);
    const context = await engine.context('Beta', 'simple');

    expect(scan.indexed).toBe(1);
    expect(result.record.hash).not.toBe(before.hash);
    expect(card).toContain('OSMEM/1.0');
    expect(card).toContain('local_only = true');
    expect(context.estimatedTokens).toBeLessThanOrEqual(1_000);
    expect(context.fileIds).toContain(result.record.id);
  });
});

describe('TokenBudgetManager', () => {
  it('isolates token estimation and truncates to the configured level', () => {
    const manager = new TokenBudgetManager();
    const result = manager.fit(['a'.repeat(8_000)], 'simple');
    expect(result.estimatedTokens).toBeLessThanOrEqual(1_000);
    expect(result.truncated).toBe(true);
  });
});
