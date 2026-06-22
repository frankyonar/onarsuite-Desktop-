import { randomUUID } from 'node:crypto';
import type { AgentMessage, AgentStreamEvent, PanelData, PanelField, ToolName } from '../../shared/types';
import type { AuditLog } from './audit-log';
import type { AgentSdk } from './agent-sdk';
import type { AgentTools } from './tools';

const MAX_ITERATIONS = 25;

const AGENT_SYSTEM = `Sei Max, un assistente AI autonomo in esecuzione dentro "Max Desktop" sul computer dell'utente.
Lavori come un dipendente esperto che aiuta l'utente con OnarSuite e con i file locali.

STRUMENTI (usa SOLO questi per agire — niente marcatori di testo):
- File locali: read_file, list_dir, search_files, write_file, edit_file, create_file, delete_file (solo nelle cartelle autorizzate).
- Shell: run_shell (npm, git, ecc.) con cwd in una cartella autorizzata.
- OnarSuite: onar_action(action_type, data) esegue azioni REALI sul gestionale — create_user {name,email,role_id,mobile_no?}, create_note, create_reminder, create_contract, create_ticket, create_product, calendar_create_event, drive_create_file/drive_list_items, library_search, contract_search, web_search, e altre. onar_upload(path) carica un file.

REGOLE TASSATIVE (la fiducia dell'utente dipende da queste):
1. NON dichiarare MAI di aver fatto qualcosa se non dopo che lo strumento corrispondente ha restituito esito positivo. Niente "fatto", "creato", "ho letto" senza la chiamata reale e il suo risultato.
2. Per agire su OnarSuite usa SEMPRE il tool onar_action. NON scrivere mai marcatori tipo <<<MAXAI>>> né JSON di "navigate": l'app NON li esegue, sarebbe una bugia.
3. Per conoscere il contenuto di un file LEGGILO con read_file (i PDF/DOCX vengono estratti). search_files cerca solo nei file di testo, NON nei PDF: per un PDF usa read_file. Non inventare mai contenuti o dati che non hai letto.
4. Se uno strumento torna vuoto o "nessun risultato", DILLO chiaramente e chiedi indicazioni; non riempire i vuoti con supposizioni.
5. Se ti manca un dato obbligatorio (es. email o role_id per create_user), chiedilo prima di chiamare il tool.
6. Lavora in autonomia, ma riporta sempre l'esito REALE restituito dagli strumenti. Alla fine riassumi in italiano, conciso, solo ciò che è davvero accaduto.`;

/**
 * Drives the autonomous tool-use loop. Keeps the full message list (including
 * tool calls and results) across user turns so the conversation is coherent.
 * Inference runs server-side (OnarSuite/OpenRouter); tool execution is local.
 */
export class AgentEngine {
  private messages: AgentMessage[] = [];
  private canceled = false;
  private running = false;

  constructor(
    private readonly sdk: AgentSdk,
    private readonly tools: AgentTools,
    private readonly audit: AuditLog,
  ) {}

  reset(): void {
    this.messages = [];
  }

  /** Load a saved conversation's LLM context (for continuity after switching). */
  load(messages: AgentMessage[]): void {
    this.messages = Array.isArray(messages) ? [...messages] : [];
  }

  /** Snapshot the current LLM context to persist with the conversation. */
  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  cancel(): void {
    if (this.running) this.canceled = true;
  }

  async run(userMessage: string, fileContext: string | undefined, emit: (event: AgentStreamEvent) => void): Promise<void> {
    const runId = randomUUID();
    this.canceled = false;
    this.running = true;

    const content = fileContext
      ? `${userMessage}\n\n[Contesto file selezionato]\n${fileContext}`
      : userMessage;
    this.messages.push({ role: 'user', content });

    const toolDefs = this.tools.definitions();

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (this.canceled) { emit({ type: 'status', runId, text: 'Interrotto.' }); break; }
        emit({ type: 'status', runId, text: i === 0 ? 'Max sta pensando…' : 'Max continua…' });

        const { message } = await this.sdk.agentStep(AGENT_SYSTEM, this.messages, toolDefs);
        this.messages.push(message);

        if (message.content && message.content.trim()) {
          emit({ type: 'assistant', runId, text: message.content });
        }

        const calls = message.tool_calls ?? [];
        if (calls.length === 0) break;

        for (const call of calls) {
          // Always answer every tool_call (even when canceled) so the message
          // history stays valid for the next step — OpenAI/OpenRouter reject
          // an assistant tool_call with no matching tool result.
          if (this.canceled) {
            this.messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: 'Interrotto dall\'utente.' });
            continue;
          }
          const args = safeParse(call.function.arguments);
          const { title, command } = describe(call.function.name as ToolName, args);
          emit({ type: 'tool_start', runId, id: call.id, tool: call.function.name as ToolName, title, command });

          let result;
          try {
            result = await this.tools.execute(call.function.name, args);
          } catch (error) {
            result = { ok: false, content: errorText(error), preview: errorText(error) };
          }

          emit({ type: 'tool_end', runId, id: call.id, ok: result.ok, preview: result.preview, isDiff: result.isDiff });
          const panel = buildPanel(call.function.name, args, result);
          if (panel) emit({ type: 'panel', runId, panel });
          this.messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result.content });
        }
      }
      emit({ type: 'done', runId });
    } catch (error) {
      await this.audit.write('agent_run_failed', 'error', errorText(error));
      emit({ type: 'error', runId, message: errorText(error) });
    } finally {
      this.running = false;
    }
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function describe(tool: ToolName, args: Record<string, unknown>): { title: string; command: string } {
  const p = typeof args.path === 'string' ? args.path : '';
  const base = p ? p.split(/[\\/]/).pop() ?? p : '';
  switch (tool) {
    case 'read_file': return { title: 'Lettura', command: `read · ${base}` };
    case 'list_dir': return { title: 'Elenco', command: `list · ${p || 'cartelle autorizzate'}` };
    case 'search_files': return { title: 'Ricerca', command: `search · "${String(args.query ?? '')}"` };
    case 'write_file': return { title: 'Scrittura', command: `write · ${base}` };
    case 'edit_file': return { title: 'Modifica', command: `edit · ${base}` };
    case 'create_file': return { title: 'Creazione', command: `create · ${base}` };
    case 'delete_file': return { title: 'Eliminazione', command: `delete · ${base}` };
    case 'run_shell': return { title: 'Shell', command: `run · ${String(args.command ?? '')}` };
    case 'onar_action': return { title: 'OnarSuite', command: `${String(args.action_type ?? 'azione')}` };
    case 'onar_upload': return { title: 'OnarSuite', command: `upload · ${base}` };
    default: return { title: 'Strumento', command: tool };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore imprevisto.';
}

/** Turn a tool result into a structured right-panel preview (only the cases
 *  worth a panel: a file Max read, or an object it created/touched in OnarSuite). */
function buildPanel(tool: string, args: Record<string, unknown>, result: { ok: boolean; content: string }): PanelData | null {
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

  if (tool === 'read_file') {
    const p = str(args.path);
    return { kind: 'file', title: p.split(/[\\/]/).pop() || p, subtitle: p, text: result.content.slice(0, 6000), ok: result.ok };
  }

  if (tool === 'onar_action') {
    const action = str(args.action_type);
    const data = (args.data ?? {}) as Record<string, unknown>;
    if (/customer|lead|user/.test(action)) {
      const fields: PanelField[] = [];
      if (data.email) fields.push({ label: 'Email', value: str(data.email) });
      if (data.phone || data.mobile_no) fields.push({ label: 'Telefono', value: str(data.phone ?? data.mobile_no) });
      if (data.role_id) fields.push({ label: 'Ruolo (ID)', value: str(data.role_id) });
      return { kind: 'customer', title: str(data.name) || 'Cliente', subtitle: result.content, ok: result.ok, fields };
    }
    if (/contract/.test(action)) {
      const fields: PanelField[] = [];
      if (data.amount) fields.push({ label: 'Importo', value: `${str(data.amount)} EUR` });
      return { kind: 'contract', title: str(data.title) || 'Contratto', subtitle: result.content, ok: result.ok, fields, text: str(data.description) };
    }
    return { kind: 'result', title: action || 'OnarSuite', text: result.content, ok: result.ok };
  }

  return null;
}
