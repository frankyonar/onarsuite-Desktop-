import { createHash } from 'node:crypto';
import { createReadStream, type Stats } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MemoryBudgetLevel,
  MemoryContextResult,
  MemoryEngineStatus,
  MemoryFileRecord,
  MemoryGraph,
  MemoryGraphNode,
  MemoryGraphEdge,
  MemoryGraphOptions,
  MemoryScanResult,
  MemorySearchOptions,
  MemorySearchResult,
} from '../../../shared/types';
import { isSupportedFile, parseDocument } from '../document-parser';
import { HashingEmbedder, recordEmbeddingText, toSparse } from '../workspace/embeddings';
import { TextContentChunker } from './content-chunker';
import { extractEntities } from './entity-extractor';
import { generateOsmem } from './osmem';
import { TokenBudgetManager } from './token-budget';

interface StoredMemoryIndex {
  version: 1;
  records: MemoryFileRecord[];
  lastScan?: MemoryScanResult;
}

const IGNORED_DIRECTORIES = new Set([
  '.git', '.svn', '.hg', '.idea', '.vscode', 'node_modules', 'vendor', 'cache', '.cache',
  'build', 'dist', 'bin', 'obj', 'coverage', 'release', 'tmp', 'temp', '$recycle.bin',
  'system volume information',
]);
const IGNORED_FILE_SUFFIXES = ['.tmp', '.temp', '.swp', '.swo', '.part', '.crdownload', '~'];
const MAX_CONTENT_INDEX_BYTES = 25 * 1024 * 1024;

export class OnarOwnerMemoryEngine {
  private readonly indexPath: string;
  private readonly chunker = new TextContentChunker();
  private readonly tokens = new TokenBudgetManager();
  private readonly embedder = new HashingEmbedder();
  private cache?: StoredMemoryIndex;
  private activeScan?: Promise<MemoryScanResult>;
  private status: MemoryEngineStatus = { state: 'idle', totalFiles: 0, processedFiles: 0, indexedFiles: 0 };

  constructor(dataDirectory: string) {
    this.indexPath = path.join(dataDirectory, 'owner-memory', 'index.json');
  }

  async scan(roots: string[]): Promise<MemoryScanResult> {
    if (this.activeScan) return this.activeScan;
    const normalizedRoots = minimizeRoots(roots.map((root) => path.resolve(root)));
    if (!normalizedRoots.length) throw new Error('Nessuna cartella autorizzata da scansionare.');
    this.activeScan = this.runScan(normalizedRoots).finally(() => { this.activeScan = undefined; });
    return this.activeScan;
  }

  async getStatus(): Promise<MemoryEngineStatus> {
    const index = await this.readIndex();
    const totalFiles = this.status.state === 'scanning' ? this.status.totalFiles : index.records.length;
    return { ...this.status, totalFiles, lastScan: this.status.lastScan ? { ...this.status.lastScan } : undefined };
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const index = await this.readIndex();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

    return index.records
      .filter((record) => matchesFilters(record, options))
      .map((record) => scoreRecord(record, query, terms))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.record.modifiedAt.localeCompare(a.record.modifiedAt))
      .slice(0, limit);
  }

  async card(fileId: string): Promise<string> {
    const record = (await this.readIndex()).records.find((item) => item.id === fileId);
    if (!record) throw new Error('File non presente nella memoria locale.');
    return generateOsmem(record);
  }

  /** Resolve a single indexed record by id (used by the Virtual Workspace provider). */
  async record(fileId: string): Promise<MemoryFileRecord | null> {
    return (await this.readIndex()).records.find((item) => item.id === fileId) ?? null;
  }

  /** Total number of indexed records (used for provider status). */
  async count(): Promise<number> {
    return (await this.readIndex()).records.length;
  }

  /**
   * Build a knowledge graph from the index: file nodes linked to the entities
   * they mention. Entities shared by several files become the hubs that reveal
   * how documents relate (same client email, same amount, same date).
   */
  async graph(options: MemoryGraphOptions = {}): Promise<MemoryGraph> {
    const minFiles = Math.max(1, options.minFiles ?? 1);
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
    const records = (await this.readIndex()).records.filter((record) => !record.privacy.excludedFromAi);

    // Gather entity -> set of file ids.
    const entityFiles = new Map<string, { type: string; value: string; files: Set<string> }>();
    for (const record of records) {
      for (const entity of record.entities) {
        if (options.entityType && entity.type !== options.entityType) continue;
        const key = `entity:${entity.type}:${entity.value.toLowerCase()}`;
        const bucket = entityFiles.get(key) ?? { type: entity.type, value: entity.value, files: new Set<string>() };
        bucket.files.add(record.id);
        entityFiles.set(key, bucket);
      }
    }

    const keptEntities = [...entityFiles.entries()]
      .filter(([, info]) => info.files.size >= minFiles)
      .sort((a, b) => b[1].files.size - a[1].files.size)
      .slice(0, limit);

    const nodes: MemoryGraphNode[] = [];
    const edges: MemoryGraphEdge[] = [];
    const usedFiles = new Set<string>();
    let sharedEntities = 0;

    for (const [id, info] of keptEntities) {
      nodes.push({ id, kind: 'entity', label: info.value, entityType: info.type, weight: info.files.size });
      if (info.files.size >= 2) sharedEntities++;
      for (const fileId of info.files) {
        edges.push({ source: id, target: `file:${fileId}`, weight: 1 });
        usedFiles.add(fileId);
      }
    }

    const byId = new Map(records.map((record) => [record.id, record]));
    for (const fileId of usedFiles) {
      const record = byId.get(fileId);
      if (record) nodes.push({ id: `file:${fileId}`, kind: 'file', label: record.name, weight: 0 });
    }

    return { nodes, edges, sharedEntities };
  }

  async context(query: string, level: MemoryBudgetLevel = 'medium'): Promise<MemoryContextResult> {
    const results = (await this.search(query, { limit: 30 }))
      .filter(({ record }) => !record.privacy.excludedFromAi);
    const parts = results.map(({ record }) => {
      const relevantChunks = record.chunks
        .filter((chunk) => tokenize(query).some((term) => normalize(chunk.text).includes(term)))
        .slice(0, 2)
        .map((chunk) => `[${chunk.title}]\n${chunk.text}`)
        .join('\n');
      return `${generateOsmem(record)}${relevantChunks ? `\ncontent.preview:\n${relevantChunks}` : ''}`;
    });
    const fitted = this.tokens.fit(parts, level);
    const fileIds = Array.from(fitted.text.matchAll(/@node file:([^\n]+)/g), (match) => match[1].trim());
    return {
      query,
      budgetTokens: this.tokens.budget(level),
      estimatedTokens: fitted.estimatedTokens,
      truncated: fitted.truncated,
      fileIds,
      context: fitted.text,
    };
  }

  async clear(): Promise<void> {
    this.cache = undefined;
    this.status = { state: 'idle', totalFiles: 0, processedFiles: 0, indexedFiles: 0 };
    await rm(path.dirname(this.indexPath), { recursive: true, force: true });
  }

  async forgetRoot(root: string): Promise<void> {
    const index = await this.readIndex();
    const records = index.records.filter((record) => !isInside(record.path, path.resolve(root)));
    if (records.length !== index.records.length) await this.writeIndex({ ...index, records });
  }

  private async runScan(roots: string[]): Promise<MemoryScanResult> {
    const startedAt = new Date().toISOString();
    const index = await this.readIndex();
    const previous = new Map(index.records.map((record) => [pathKey(record.path), record]));
    const files: string[] = [];
    for (const root of roots) await collectFiles(root, files);

    this.status = { state: 'scanning', totalFiles: files.length, processedFiles: 0, indexedFiles: 0 };
    const next = new Map(previous);
    const seen = new Set<string>();
    let indexed = 0;
    let unchanged = 0;
    let errors = 0;

    for (const filePath of files) {
      const key = pathKey(filePath);
      seen.add(key);
      this.status.currentPath = filePath;
      try {
        const details = await stat(filePath);
        const old = previous.get(key);
        const modifiedAt = details.mtime.toISOString();
        if (old && old.size === details.size && old.modifiedAt === modifiedAt) {
          unchanged++;
          next.set(key, old);
        } else {
          next.set(key, await this.indexFile(filePath, details, old));
          indexed++;
        }
      } catch (error) {
        errors++;
        const old = previous.get(key);
        if (old) next.set(key, { ...old, indexStatus: 'error', indexError: errorMessage(error), indexedAt: new Date().toISOString() });
      }
      this.status.processedFiles++;
      this.status.indexedFiles = indexed;
    }

    let removed = 0;
    for (const [key, record] of next) {
      if (roots.some((root) => isInside(record.path, root)) && !seen.has(key)) {
        next.delete(key);
        removed++;
      }
    }

    const result: MemoryScanResult = {
      roots,
      discovered: files.length,
      indexed,
      unchanged,
      removed,
      errors,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    await this.writeIndex({ version: 1, records: [...next.values()].sort((a, b) => a.path.localeCompare(b.path)), lastScan: result });
    this.status = { state: 'idle', totalFiles: files.length, processedFiles: files.length, indexedFiles: indexed, lastScan: result };
    return result;
  }

  private async indexFile(filePath: string, details: Stats, old?: MemoryFileRecord): Promise<MemoryFileRecord> {
    const id = old?.id ?? createHash('sha256').update(pathKey(filePath)).digest('hex').slice(0, 24);
    const extension = path.extname(filePath).slice(1).toLowerCase();
    let summaryShort = '';
    let summaryLong = '';
    let chunks: MemoryFileRecord['chunks'] = [];
    let entities: MemoryFileRecord['entities'] = old?.entities ?? [];
    let indexStatus: MemoryFileRecord['indexStatus'] = 'metadata_only';
    let indexError: string | undefined;

    if (details.size <= MAX_CONTENT_INDEX_BYTES && isSupportedFile(filePath)) {
      try {
        const parsed = await parseDocument(filePath);
        summaryShort = parsed.summary.slice(0, 280);
        summaryLong = parsed.summary.slice(0, 700);
        chunks = this.chunker.chunk(id, parsed.text);
        entities = extractEntities(parsed.text);
        indexStatus = 'indexed';
      } catch (error) {
        indexStatus = 'error';
        indexError = errorMessage(error);
      }
    }

    const record: MemoryFileRecord = {
      id,
      path: filePath,
      name: path.basename(filePath),
      extension,
      mimeType: mimeType(extension),
      documentKind: documentKind(extension),
      size: details.size,
      hash: await hashFile(filePath),
      createdAt: details.birthtime.toISOString(),
      modifiedAt: details.mtime.toISOString(),
      indexedAt: new Date().toISOString(),
      indexStatus,
      indexError,
      summaryShort,
      summaryLong,
      topics: inferTopics(filePath),
      entities,
      relations: [{ type: 'belongs_to', target: path.dirname(filePath) }, ...(old?.relations.filter((item) => item.type !== 'belongs_to') ?? [])],
      privacy: old?.privacy ?? {
        localOnly: true,
        askBeforeCloud: true,
        sensitiveDetected: false,
        excludedFromAi: false,
        allowedScopes: ['local_retrieval'],
      },
      chunks,
    };

    // Persist the semantic embedding once, at index time (local vector store),
    // so retrieval never has to recompute it per query.
    record.embedding = toSparse(this.embedder.embed(recordEmbeddingText(record)));
    return record;
  }

  private async readIndex(): Promise<StoredMemoryIndex> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, 'utf8')) as StoredMemoryIndex;
      this.cache = parsed.version === 1 && Array.isArray(parsed.records) ? parsed : { version: 1, records: [] };
    } catch {
      this.cache = { version: 1, records: [] };
    }
    if (this.cache.lastScan) this.status = { ...this.status, lastScan: this.cache.lastScan };
    return this.cache;
  }

  private async writeIndex(index: StoredMemoryIndex): Promise<void> {
    this.cache = index;
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const tempPath = `${this.indexPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(index), { encoding: 'utf8', mode: 0o600 });
    await rm(this.indexPath, { force: true });
    await rename(tempPath, this.indexPath);
  }
}

async function collectFiles(root: string, output: string[]): Promise<void> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) await collectFiles(fullPath, output);
    } else if (entry.isFile() && !isIgnoredFile(entry.name)) {
      output.push(fullPath);
    }
  }
}

function isIgnoredFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'thumbs.db' || lower === 'desktop.ini' || lower.startsWith('~$') || IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function scoreRecord(record: MemoryFileRecord, rawQuery: string, terms: string[]): MemorySearchResult {
  const fields: Array<[string, string, number]> = [
    ['name', record.name, 12],
    ['path', record.path, 5],
    ['summary', `${record.summaryShort} ${record.summaryLong}`, 8],
    ['topics', record.topics.join(' '), 7],
    ['entities', record.entities.map((item) => `${item.type} ${item.value}`).join(' '), 8],
    ['chunks', record.chunks.map((chunk) => chunk.text).join(' '), 3],
  ];
  let score = 0;
  const matchedFields: string[] = [];
  const phrase = normalize(rawQuery);
  for (const [name, value, weight] of fields) {
    const normalized = normalize(value);
    let fieldScore = terms.reduce((sum, term) => sum + (normalized.includes(term) ? weight : 0), 0);
    if (phrase.length > 2 && normalized.includes(phrase)) fieldScore += weight * 2;
    if (fieldScore) { score += fieldScore; matchedFields.push(name); }
  }
  return { record, score, matchedFields };
}

function matchesFilters(record: MemoryFileRecord, options: MemorySearchOptions): boolean {
  if (options.folder && !isInside(record.path, path.resolve(options.folder))) return false;
  if (options.extension && record.extension !== options.extension.replace(/^\./, '').toLowerCase()) return false;
  if (options.modifiedAfter && record.modifiedAt < options.modifiedAfter) return false;
  if (options.modifiedBefore && record.modifiedAt > options.modifiedBefore) return false;
  return true;
}

function minimizeRoots(roots: string[]): string[] {
  const unique = [...new Map(roots.map((root) => [pathKey(root), root])).values()];
  return unique.filter((root) => !unique.some((other) => other !== root && isInside(root, other)));
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function pathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function tokenize(value: string): string[] {
  return [...new Set(normalize(value).split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1))];
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function inferTopics(filePath: string): string[] {
  const ignored = new Set(['users', 'documents', 'desktop', 'file', 'files']);
  return tokenize(filePath).filter((term) => term.length > 2 && !ignored.has(term)).slice(-8);
}

function documentKind(extension: string): string {
  if (['md', 'txt'].includes(extension)) return 'text';
  if (['pdf', 'doc', 'docx', 'odt'].includes(extension)) return 'document';
  if (['csv', 'xls', 'xlsx', 'ods'].includes(extension)) return 'spreadsheet';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'php', 'java', 'cs', 'go', 'rs', 'swift'].includes(extension)) return 'source_code';
  return extension || 'unknown';
}

function mimeType(extension: string): string {
  return ({
    pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv',
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', html: 'text/html',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
  } as Record<string, string>)[extension] ?? 'application/octet-stream';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore di indicizzazione imprevisto.';
}
