import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OwnerMemoryEngine } from './owner-memory-engine';

// Files whose text shares entities (an email, an amount) so the graph links them.
const FILES: Record<string, string> = {
  'preventivo.txt': 'Preventivo per mario@rossi.it, totale €1.200 scadenza 15/03/2026.',
  'contratto.txt': 'Contratto con mario@rossi.it, importo €1.200.',
  'nota.txt': 'Promemoria: chiamare fornitore anna@acme.it.',
};

describe('OwnerMemoryEngine.graph', () => {
  let dir: string;
  let root: string;
  let engine: OwnerMemoryEngine;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'osmem-graph-'));
    root = path.join(dir, 'docs');
    await mkdtemp(root).catch(() => undefined);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(root, { recursive: true });
    for (const [name, text] of Object.entries(FILES)) await writeFile(path.join(root, name), text, 'utf8');
    engine = new OwnerMemoryEngine(dir);
    await engine.scan([root]);
  });

  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('links files that share an entity via that entity hub', async () => {
    const graph = await engine.graph();
    const email = graph.nodes.find((n) => n.kind === 'entity' && n.label === 'mario@rossi.it');
    expect(email).toBeDefined();
    expect(email!.weight).toBe(2); // in preventivo + contratto
    const emailEdges = graph.edges.filter((e) => e.source === email!.id);
    expect(emailEdges).toHaveLength(2);
    expect(graph.sharedEntities).toBeGreaterThanOrEqual(1);
  });

  it('respects minFiles to keep only cross-linking entities', async () => {
    const shared = await engine.graph({ minFiles: 2 });
    // anna@acme.it appears in one file only → excluded when minFiles=2.
    expect(shared.nodes.some((n) => n.label === 'anna@acme.it')).toBe(false);
    expect(shared.nodes.some((n) => n.label === 'mario@rossi.it')).toBe(true);
  });

  it('filters by entity type', async () => {
    const money = await engine.graph({ entityType: 'money' });
    expect(money.nodes.filter((n) => n.kind === 'entity').every((n) => n.entityType === 'money')).toBe(true);
    expect(money.nodes.some((n) => n.label.includes('1.200'))).toBe(true);
  });
});
