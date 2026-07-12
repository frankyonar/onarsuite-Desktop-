import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDocument, type GeneratedDocumentFormat } from '../src/main/services/document-generator';
import { AgentTools } from '../src/main/services/tools';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('real document generation', () => {
  it.each<GeneratedDocumentFormat>(['pdf', 'xlsx', 'docx', 'csv', 'txt', 'md', 'html'])('generates a non-empty %s file', async (format) => {
    const bytes = await generateDocument({
      format, title: 'Riepilogo aziendale', content: 'Documento creato da Max.',
      sections: [{ heading: 'Priorità', content: 'Contattare il cliente Rossi.' }],
      table: { columns: ['Cliente', 'Importo'], rows: [['Rossi', 1200]] },
    });
    expect(bytes.length).toBeGreaterThan(['txt', 'csv', 'md'].includes(format) ? 20 : 100);
    if (format === 'pdf') expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    if (format === 'xlsx' || format === 'docx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
  });

  it('saves locally and reports verified OnarSuite and Drive deliveries', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'max-document-'));
    tempDirectories.push(workspace);
    const onarUpload = vi.fn(async () => ({ status: 'completed' as const, message: 'Libreria ID 42' }));
    const onarExecute = vi.fn(async () => ({ success: true, message: 'Drive ID abc', data: { id: 'abc' } }));
    const tools = new AgentTools(
      { read: vi.fn(async () => ({ workspacePath: workspace, authorizedFolders: [] })) } as never,
      { write: vi.fn(async () => undefined) } as never,
      onarUpload,
      onarExecute,
      vi.fn() as never,
      vi.fn() as never,
    );

    const result = await tools.execute('create_document', {
      format: 'pdf', title: 'Riepilogo viaggio', destination: 'all', content: 'Volo e hotel confermati.',
    });
    const data = result.data as { path: string; deliveries: Array<{ ok: boolean }> };

    expect(result.ok).toBe(true);
    expect((await readFile(data.path)).subarray(0, 4).toString()).toBe('%PDF');
    expect(data.deliveries.every((delivery) => delivery.ok)).toBe(true);
    expect(onarUpload).toHaveBeenCalledWith(data.path, { category: 'generic' });
    expect(onarExecute).toHaveBeenCalledWith('drive_create_file', expect.objectContaining({ content_base64: expect.any(String), _confirmed: true }));
  });
});
