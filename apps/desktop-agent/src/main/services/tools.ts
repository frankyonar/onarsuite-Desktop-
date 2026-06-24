import { exec } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ActionResult } from '../../shared/types';
import { isAllowedPath } from '../../shared/path-policy';
import type { AuditLog } from './audit-log';
import type { ConfigStore } from './config-store';
import { isSupportedFile, parseDocument } from './document-parser';

const execAsync = promisify(exec);

const MAX_TOOL_OUTPUT = 60_000;
const SHELL_TIMEOUT_MS = 120_000;
const SEARCH_FILE_LIMIT = 4_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'vendor', '.next', 'release', 'bootstrap/cache']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss', '.html', '.htm',
  '.php', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.yml', '.yaml', '.xml',
  '.env', '.sql', '.vue', '.svelte', '.toml', '.ini', '.conf', '.log',
]);

export interface ToolResult {
  ok: boolean;
  /** Full text fed back to the model. */
  content: string;
  /** Short preview shown in the console UI. */
  preview: string;
  isDiff?: boolean;
  data?: unknown;
}

/**
 * Local tools Max can call during an autonomous run. Every filesystem path is
 * confined to the authorized roots (workspace + approved folders); shell
 * commands run with their cwd inside a root. Nothing escapes the allowlist.
 */
export class AgentTools {
  constructor(
    private readonly config: ConfigStore,
    private readonly audit: AuditLog,
    private readonly onarUpload: (filePath: string) => Promise<ActionResult>,
    private readonly onarExecute: (actionType: string, data: Record<string, unknown>) => Promise<{ success: boolean; message: string; data?: unknown }>,
  ) {}

  /** OpenAI-style tool schemas advertised to the model each step. */
  definitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> {
    const filePath = { type: 'string', description: 'Percorso del file, assoluto o relativo a una cartella autorizzata.' };
    return [
      fn('read_file', 'Leggi il contenuto di un file (estrae testo da PDF/DOCX/XLSX, altrimenti UTF-8).', {
        path: filePath,
      }, ['path']),
      fn('list_dir', 'Elenca file e cartelle in una directory autorizzata.', {
        path: { type: 'string', description: 'Cartella da elencare. Vuoto = radici autorizzate.' },
      }, []),
      fn('search_files', 'Cerca una stringa nei file di testo dentro le cartelle autorizzate.', {
        query: { type: 'string', description: 'Testo da cercare (case-insensitive).' },
        path: { type: 'string', description: 'Cartella in cui cercare (opzionale).' },
      }, ['query']),
      fn('write_file', 'Crea o sovrascrive un file con il contenuto fornito.', {
        path: filePath,
        content: { type: 'string', description: 'Contenuto completo del file.' },
      }, ['path', 'content']),
      fn('edit_file', 'Sostituisci una porzione esatta di testo in un file esistente.', {
        path: filePath,
        old_string: { type: 'string', description: 'Testo esatto da sostituire (deve essere unico).' },
        new_string: { type: 'string', description: 'Nuovo testo.' },
        replace_all: { type: 'boolean', description: 'Sostituisci tutte le occorrenze.' },
      }, ['path', 'old_string', 'new_string']),
      fn('create_file', 'Crea un nuovo file. Fallisce se esiste già.', {
        path: filePath,
        content: { type: 'string', description: 'Contenuto del nuovo file.' },
      }, ['path', 'content']),
      fn('delete_file', 'Elimina un file dentro una cartella autorizzata.', {
        path: filePath,
      }, ['path']),
      fn('run_shell', 'Esegui un comando di shell (npm, git, ecc.) con cwd in una cartella autorizzata.', {
        command: { type: 'string', description: 'Comando da eseguire.' },
        cwd: { type: 'string', description: 'Cartella di lavoro (opzionale).' },
      }, ['command']),
      fn('onar_action', 'Esegui un\'azione REALE su OnarSuite (stesso potere del Max in-app). Usa SEMPRE questo per agire su OnarSuite, mai messaggi di testo speciali.', {
        action_type: { type: 'string', description: 'Es: create_user {name,email,role_id,mobile_no?}, create_note {title,content}, create_reminder {title,date,description?}, create_contract {title,content,amount?}, create_ticket {subject,description}, create_product {name,price}, calendar_create_event {title,start,end}, drive_create_file {name,content}, library_search {query}, contract_search {query}, web_search {query}, news {topic?} (notizie verificate da Perplexity, topic vuoto = notizie di oggi).' },
        data: { type: 'object', description: 'Oggetto con i campi richiesti dall\'azione.' },
      }, ['action_type', 'data']),
      fn('onar_upload', 'Carica un file locale come allegato su OnarSuite.', {
        path: filePath,
      }, ['path']),
    ];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'read_file': return this.readFile(String(args.path ?? ''));
      case 'list_dir': return this.listDir(args.path ? String(args.path) : undefined);
      case 'search_files': return this.search(String(args.query ?? ''), args.path ? String(args.path) : undefined);
      case 'write_file': return this.writeFile(String(args.path ?? ''), String(args.content ?? ''));
      case 'edit_file': return this.editFile(String(args.path ?? ''), String(args.old_string ?? ''), String(args.new_string ?? ''), Boolean(args.replace_all));
      case 'create_file': return this.createFile(String(args.path ?? ''), String(args.content ?? ''));
      case 'delete_file': return this.deleteFile(String(args.path ?? ''));
      case 'run_shell': return this.runShell(String(args.command ?? ''), args.cwd ? String(args.cwd) : undefined);
      case 'onar_action': return this.onarAction(String(args.action_type ?? ''), (args.data as Record<string, unknown>) ?? {});
      case 'onar_upload': return this.onarUploadFile(String(args.path ?? ''));
      // Robustness: some models call an OnarSuite read-only action as a bare
      // top-level tool instead of via onar_action. Delegate instead of failing.
      case 'news':
      case 'web_search':
      case 'web_fetch':
      case 'library_search':
      case 'contract_search':
        return this.onarAction(name, args);
      default: return { ok: false, content: `Strumento sconosciuto: ${name}`, preview: 'Strumento sconosciuto' };
    }
  }

  // --- file tools -----------------------------------------------------------

  private async readFile(p: string): Promise<ToolResult> {
    const target = await this.assertInside(p);
    let text: string;
    if (isSupportedFile(target) && !TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      text = (await parseDocument(target)).text;
    } else {
      text = await readFile(target, 'utf8');
    }
    await this.log('agent_read', 'info', 'File letto', { path: target });
    return ok(cap(text), `${path.basename(target)} · ${text.length} caratteri`);
  }

  private async listDir(p?: string): Promise<ToolResult> {
    const roots = await this.roots();
    const targets = p ? [await this.assertInside(p)] : roots;
    const lines: string[] = [];
    for (const dir of targets) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        lines.push(`${entry.isDirectory() ? 'DIR ' : 'FILE'}  ${full}`);
      }
    }
    const body = lines.join('\n') || '(vuoto)';
    return ok(cap(body), `${lines.length} elementi`);
  }

  private async search(query: string, p?: string): Promise<ToolResult> {
    if (!query.trim()) return { ok: false, content: 'Query vuota.', preview: 'Query vuota' };
    const needle = query.toLowerCase();
    const roots = p ? [await this.assertInside(p)] : await this.roots();
    const hits: string[] = [];
    let scanned = 0;
    const walk = async (dir: string): Promise<void> => {
      if (scanned >= SEARCH_FILE_LIMIT || hits.length >= 200) return;
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (scanned >= SEARCH_FILE_LIMIT || hits.length >= 200) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) await walk(full);
          continue;
        }
        if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        scanned++;
        try {
          const lines = (await readFile(full, 'utf8')).split('\n');
          lines.forEach((line, i) => {
            if (hits.length < 200 && line.toLowerCase().includes(needle)) {
              hits.push(`${full}:${i + 1}: ${line.trim().slice(0, 200)}`);
            }
          });
        } catch { /* skip unreadable */ }
      }
    };
    for (const root of roots) await walk(root);
    await this.log('agent_search', 'info', 'Ricerca nei file', { query, hits: hits.length });
    const body = hits.join('\n') || 'Nessun risultato.';
    return ok(cap(body), `${hits.length} risultati per "${query}"`);
  }

  private async writeFile(p: string, content: string): Promise<ToolResult> {
    const target = await this.assertWritable(p);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    await this.log('agent_write', 'security', 'File scritto', { path: target, bytes: content.length });
    return ok(`Scritto ${target} (${content.length} byte).`, headPreview(target, content));
  }

  private async editFile(p: string, oldStr: string, newStr: string, replaceAll: boolean): Promise<ToolResult> {
    const target = await this.assertInside(p);
    const original = await readFile(target, 'utf8');
    if (!original.includes(oldStr)) {
      return { ok: false, content: `Testo da sostituire non trovato in ${target}.`, preview: 'Testo non trovato' };
    }
    const count = original.split(oldStr).length - 1;
    if (!replaceAll && count > 1) {
      return { ok: false, content: `Il testo compare ${count} volte; usa replace_all o un contesto più ampio.`, preview: `${count} occorrenze ambigue` };
    }
    const updated = replaceAll ? original.split(oldStr).join(newStr) : original.replace(oldStr, newStr);
    await writeFile(target, updated, 'utf8');
    await this.log('agent_edit', 'security', 'File modificato', { path: target });
    return { ok: true, content: `Modificato ${target}.`, preview: diffPreview(oldStr, newStr), isDiff: true };
  }

  private async createFile(p: string, content: string): Promise<ToolResult> {
    const target = await this.assertWritable(p);
    try { await stat(target); return { ok: false, content: `Esiste già: ${target}.`, preview: 'File già esistente' }; }
    catch { /* good, does not exist */ }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    await this.log('agent_create', 'security', 'File creato', { path: target, bytes: content.length });
    return ok(`Creato ${target}.`, headPreview(target, content));
  }

  private async deleteFile(p: string): Promise<ToolResult> {
    const target = await this.assertInside(p);
    await rm(target, { force: true });
    await this.log('agent_delete', 'security', 'File eliminato', { path: target });
    return ok(`Eliminato ${target}.`, `Eliminato ${path.basename(target)}`);
  }

  private async runShell(command: string, cwd?: string): Promise<ToolResult> {
    if (!command.trim()) return { ok: false, content: 'Comando vuoto.', preview: 'Comando vuoto' };
    const roots = await this.roots();
    const workdir = cwd ? await this.assertInside(cwd) : roots[0];
    if (!workdir) return { ok: false, content: 'Nessuna cartella autorizzata in cui eseguire.', preview: 'Nessuna cartella' };
    await this.log('agent_shell', 'security', 'Comando shell eseguito', { command, cwd: workdir });
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workdir,
        timeout: SHELL_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 5 * 1024 * 1024,
      });
      const body = [stdout, stderr].filter(Boolean).join('\n').trim() || '(nessun output)';
      return ok(cap(body), `$ ${command}`);
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      const body = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
      return { ok: false, content: cap(body || 'Comando fallito.'), preview: `$ ${command} — uscita ${e.code ?? '?'}` };
    }
  }

  private async onarAction(actionType: string, data: Record<string, unknown>): Promise<ToolResult> {
    if (!actionType.trim()) return { ok: false, content: 'action_type mancante.', preview: 'action_type mancante' };
    try {
      const result = await this.onarExecute(actionType, data);
      await this.log('agent_onar_action', 'info', `Azione OnarSuite: ${actionType}`, { actionType, ok: result.success });
      return { ok: result.success, content: result.message, preview: `${actionType} · ${result.message}`, data: result.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Azione OnarSuite fallita.';
      return { ok: false, content: message, preview: `${actionType} · errore` };
    }
  }

  private async onarUploadFile(p: string): Promise<ToolResult> {
    const target = await this.assertInside(p);
    const result = await this.onarUpload(target);
    return { ok: result.status === 'completed', content: result.message, preview: result.message };
  }

  // --- path safety ----------------------------------------------------------

  private async roots(): Promise<string[]> {
    const config = await this.config.read();
    return Promise.all([config.workspacePath, ...config.authorizedFolders].map(async (r) => {
      try { return await realpath(r); } catch { return path.resolve(r); }
    }));
  }

  /** Resolve a (possibly relative) path against the first root. */
  private async resolve(p: string): Promise<string> {
    if (path.isAbsolute(p)) return p;
    const roots = await this.roots();
    return path.resolve(roots[0] ?? process.cwd(), p);
  }

  /** Assert the resolved, existing path lives inside an authorized root. */
  private async assertInside(p: string): Promise<string> {
    const resolved = await this.resolve(p);
    let canonical = resolved;
    try { canonical = await realpath(resolved); } catch { /* may not exist for some ops */ }
    if (!isAllowedPath(canonical, await this.roots())) {
      await this.log('security_warning', 'security', 'Accesso fuori allowlist bloccato', { path: resolved });
      throw new Error(`Percorso non autorizzato: ${resolved}. Aggiungi la cartella alle autorizzazioni.`);
    }
    return canonical;
  }

  /** For create/write: the file may not exist yet, so validate the parent dir. */
  private async assertWritable(p: string): Promise<string> {
    const resolved = await this.resolve(p);
    const parent = path.dirname(resolved);
    let canonicalParent = parent;
    try { canonicalParent = await realpath(parent); } catch { /* parent may be created */ }
    if (!isAllowedPath(canonicalParent, await this.roots())) {
      await this.log('security_warning', 'security', 'Scrittura fuori allowlist bloccata', { path: resolved });
      throw new Error(`Percorso non autorizzato: ${resolved}. Aggiungi la cartella alle autorizzazioni.`);
    }
    return path.join(canonicalParent, path.basename(resolved));
  }

  private log(event: string, level: 'info' | 'security', message: string, metadata: Record<string, string | number | boolean | null>) {
    return this.audit.write(event, level, message, metadata);
  }
}

function fn(name: string, description: string, properties: Record<string, object>, required: string[]) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } };
}

function ok(content: string, preview: string): ToolResult {
  return { ok: true, content, preview };
}

function cap(text: string): string {
  return text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}\n… (troncato)` : text;
}

function headPreview(target: string, content: string): string {
  return `${path.basename(target)}\n${content.split('\n').slice(0, 30).join('\n')}`;
}

function diffPreview(oldStr: string, newStr: string): string {
  const minus = oldStr.split('\n').slice(0, 12).map((l) => `- ${l}`).join('\n');
  const plus = newStr.split('\n').slice(0, 12).map((l) => `+ ${l}`).join('\n');
  return `${minus}\n${plus}`;
}
