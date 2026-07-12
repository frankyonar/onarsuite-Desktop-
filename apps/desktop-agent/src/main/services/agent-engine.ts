import { randomUUID } from 'node:crypto';
import type { AgentMessage, AgentRunMode, AgentStreamEvent, ChatMessage, PanelData, PanelField, ToolName } from '../../shared/types';
import type { AuditLog } from './audit-log';
import type { AgentSdk } from './agent-sdk';
import type { AgentTools } from './tools';

const MAX_ITERATIONS = 25;
const AUTO_MARKER_ACTIONS = new Set([
  'web_search',
  'web_fetch',
  'news',
  'library_search',
  'library_read_file',
  'contract_search',
  'contract_summarize',
  'list_reminders',
  'list_users',
  'list_leads',
  'calendar_list_events',
  'calendar_search_events',
  'drive_list_items',
  'drive_search_items',
  'ai_email_list',
  'ai_email_view_thread',
  'ai_email_read_full',
  'ai_email_search',
]);

const AGENT_SYSTEM = `Sei Max, un assistente AI autonomo in esecuzione dentro "Max Desktop" sul computer dell'utente.
Lavori come un dipendente esperto che aiuta l'utente con OnarSuite e con i file locali.

STRUMENTI (usa SOLO questi per agire — niente marcatori di testo):
- File locali: read_file, list_dir, search_files, write_file, edit_file, create_file, delete_file (solo nelle cartelle autorizzate).
- Memoria: search_memory(query) cerca nel Virtual Workspace (documenti già indicizzati: nomi, riassunti, argomenti, contenuti di PDF/DOCX/XLSX). USALO PER PRIMO quando l'utente chiede di un documento/cliente/argomento: trova i file rilevanti senza aprirli, poi apri con read_file solo quelli utili. workspace_context(query, level) costruisce un contesto compatto (schede OSMEM) rispettando un budget token: usalo per RISPONDERE su più documenti senza leggerli uno per uno.
- Shell: run_shell (npm, git, node, python, ecc.) con cwd in una cartella autorizzata.
- OnarSuite: onar_action(action_type, data) esegue azioni REALI sul gestionale — create_user {name,email,role_id,mobile_no?}, create_note, create_reminder, create_contract, create_ticket, create_product, calendar_create_event, drive_create_file/drive_list_items, library_search, contract_search, web_search, news, e altre. onar_upload(path) carica un file.
- Magic Panel: request_form(action, action_type, title, description, fields, prefill, confirmation_required) raccoglie dati strutturati e mostra una preview prima di un'azione reale. Usalo quando mancano più dati o l'utente deve verificare una scrittura.
  Per le NOTIZIE usa onar_action('news', {topic?}) — fonti giornalistiche verificate (Perplexity). topic vuoto = notizie principali di oggi.

NAVIGAZIONE NEL DOCK:
- open_onarsuite_page(path, title) apre DAVVERO qualsiasi pagina della piattaforma nel dock laterale. Usalo sempre quando l'utente dice apri, mostra o vai a una pagina o sezione OnarSuite. Accetta percorsi come "/settings" o URL OnarSuite completi.
- Per aprire pagine non usare testo, marcatori o JSON: esegui il tool e comunica l'esito solo dopo il risultato.

METODO DA DIPENDENTE DIGITALE:
- Per richieste aziendali ampie: raccogli prima i fatti con business_brief e/o gli strumenti OnarSuite, identifica priorità, dipendenze e rischi, poi esegui i passi sicuri in ordine.
- Non fermarti alla prima azione se l'obiettivo richiede più passaggi: continua fino a completamento, blocco reale o necessità di conferma.
- Dopo ogni scrittura verifica il risultato restituito; se fallisce, diagnostica e prova un'alternativa sicura. Non nascondere risultati parziali.
- Distingui sempre fatti osservati, deduzioni e suggerimenti. Evidenzia scadenze, incassi, clienti fermi e prossime azioni quando sono rilevanti.
- Le azioni distruttive, irreversibili, finanziarie o di invio esterno richiedono conferma esplicita nel Magic Panel.

GENERAZIONE FILE E CODICE:
- Sai scrivere codice in qualsiasi linguaggio (Python, JS/TS, HTML/CSS, PHP, SQL, shell, ecc.) e generare documenti.
- Quando l'utente chiede di generare/creare codice o un file, NON limitarti a incollarlo in chat: crealo come FILE REALE con create_file (o write_file se esiste già), poi indica il percorso. Mostra anche un breve estratto nel messaggio.
- Se non è indicata una cartella, usa la OnarSuite Workspace (sempre autorizzata). Scegli un nome file sensato con l'estensione giusta.
- Per progetti multi-file crea i file uno per uno; per eseguirli/testarli usa run_shell (es. "node app.js", "python main.py", "npm install").
- Prima di modificare un file esistente, leggilo con read_file, poi usa edit_file per modifiche mirate.

REGOLE TASSATIVE (la fiducia dell'utente dipende da queste):
1. NON dichiarare MAI di aver fatto qualcosa se non dopo che lo strumento corrispondente ha restituito esito positivo. Niente "fatto", "creato", "ho letto" senza la chiamata reale e il suo risultato.
2. Per agire su OnarSuite usa SEMPRE il tool onar_action. NON scrivere mai marcatori tipo <<<MAXAI>>> né JSON di "navigate": l'app NON li esegue, sarebbe una bugia.
3. Per conoscere il contenuto di un file LEGGILO con read_file (i PDF/DOCX vengono estratti). search_files cerca solo nei file di testo, NON nei PDF: per un PDF usa read_file. Non inventare mai contenuti o dati che non hai letto.
4. Se uno strumento torna vuoto o "nessun risultato", DILLO chiaramente e chiedi indicazioni; non riempire i vuoti con supposizioni.
5. Se mancano dati obbligatori per un'azione, usa request_form quando i campi sono più di uno; per una sola informazione semplice puoi chiederla in chat.
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

  /** Merge chat entries produced outside the tool loop, such as a confirmed form. */
  mergePlainHistory(history: ChatMessage[]): void {
    const incoming = history
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({ role: item.role, content: item.content.trim() }))
      .filter((item) => item.content);
    if (!incoming.length) return;

    const current = this.messages
      .filter((item) => item.role !== 'tool' && typeof item.content === 'string' && item.content.trim())
      .map((item) => ({ role: item.role, content: String(item.content).trim() }));
    let matched = 0;
    for (const item of current) {
      if (matched < incoming.length && item.role === incoming[matched].role && item.content === incoming[matched].content) matched++;
    }
    for (const item of incoming.slice(matched)) this.messages.push(item);
  }

  /** Record deterministic assistant workflows that bypass the model loop. */
  recordExchange(userMessage: string, assistantMessage: string): void {
    this.messages.push({ role: 'user', content: userMessage });
    this.messages.push({ role: 'assistant', content: assistantMessage });
  }

  cancel(): void {
    if (this.running) this.canceled = true;
  }

  async run(userMessage: string, fileContext: string | undefined, emit: (event: AgentStreamEvent) => void, mode: AgentRunMode = 'execute'): Promise<void> {
    const runId = randomUUID();
    this.canceled = false;
    this.running = true;

    const modeInstruction: Record<AgentRunMode, string> = {
      execute: 'MODALITÀ ESECUZIONE: porta avanti l’obiettivo in autonomia usando gli strumenti. Chiedi conferma soltanto per azioni sensibili, distruttive, finanziarie o di invio esterno.',
      plan: 'MODALITÀ PIANO: analizza e prepara un piano operativo dettagliato con priorità, dipendenze, dati mancanti e criteri di completamento. Non eseguire scritture e non modificare dati o file.',
      audit: 'MODALITÀ CONTROLLO: esegui solo letture, cerca anomalie, rischi, ritardi e opportunità, cita le evidenze disponibili e proponi correzioni. Non eseguire scritture.',
    };
    const baseContent = `${userMessage}\n\n[${modeInstruction[mode]}]`;
    const content = fileContext ? `${baseContent}\n\n[Contesto file selezionato]\n${fileContext}` : baseContent;
    this.messages.push({ role: 'user', content });

    const toolDefs = this.tools.definitions();

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (this.canceled) { emit({ type: 'status', runId, text: 'Interrotto.' }); break; }
        emit({ type: 'status', runId, text: i === 0 ? 'Max sta pensando…' : 'Max continua…' });

        const { message } = await this.sdk.agentStep(AGENT_SYSTEM, this.messages, toolDefs);
        const structured = extractStructuredMarker(message.content ?? '');
        this.messages.push({ ...message, content: structured.message || '' });
        if (structured.message.trim()) {
          emit({ type: 'assistant', runId, text: structured.message });
        }
        if (structured.action && AUTO_MARKER_ACTIONS.has(structured.action.type)) {
          const args = { action_type: structured.action.type, data: structured.action.data ?? {} };
          const autoId = randomUUID();
          const title = 'OnarSuite';
          emit({ type: 'tool_start', runId, id: autoId, tool: 'onar_action', title, command: structured.action.type });
          let result;
          try {
            result = await this.tools.execute('onar_action', args);
          } catch (error) {
            result = { ok: false, content: errorText(error), preview: errorText(error) };
          }
          emit({ type: 'tool_end', runId, id: autoId, ok: result.ok, preview: result.preview, isDiff: result.isDiff });
          const panel = buildPanel('onar_action', args, result);
          if (panel) emit({ type: 'panel', runId, panel });
          this.messages.push({ role: 'tool', tool_call_id: autoId, name: 'onar_action', content: result.content });
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
          if (mode !== 'execute' && !isReadOnlyTool(call.function.name, args)) {
            result = { ok: false, content: `Azione bloccata dalla modalità ${mode}: sono consentite solo letture.`, preview: 'Bloccata dalla modalità operativa' };
          } else try {
            result = await this.tools.execute(call.function.name, args);
          } catch (error) {
            result = { ok: false, content: errorText(error), preview: errorText(error) };
          }

          emit({ type: 'tool_end', runId, id: call.id, ok: result.ok, preview: result.preview, isDiff: result.isDiff });
          if (call.function.name === 'open_onarsuite_page' && result.ok) {
            const navigation = result.data as { url?: unknown; title?: unknown } | undefined;
            if (typeof navigation?.url === 'string') emit({ type: 'dock_navigation', runId, url: navigation.url, title: typeof navigation.title === 'string' ? navigation.title : 'OnarSuite' });
          }
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

const READ_ONLY_TOOLS = new Set(['read_file', 'list_dir', 'search_files', 'search_memory', 'workspace_context', 'business_brief', 'open_onarsuite_page']);
const READ_ONLY_ONAR_ACTIONS = new Set([
  'news', 'web_search', 'web_fetch', 'library_search', 'library_read_file',
  'contract_list', 'contract_search', 'contract_summarize', 'list_reminders', 'list_users', 'list_leads', 'list_unified_contacts',
  'calendar_list_events', 'calendar_search_events', 'drive_list_items', 'drive_search_items',
  'ai_email_list', 'ai_email_view_thread', 'ai_email_read_full', 'ai_email_search',
  'stripe_list_payments', 'stripe_list_customers', 'stripe_balance',
]);

export function isReadOnlyTool(name: string, args: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(name)) return true;
  if (name === 'onar_action') return READ_ONLY_ONAR_ACTIONS.has(String(args.action_type ?? ''));
  return READ_ONLY_ONAR_ACTIONS.has(name);
}

function describe(tool: ToolName, args: Record<string, unknown>): { title: string; command: string } {
  const p = typeof args.path === 'string' ? args.path : '';
  const base = p ? p.split(/[\\/]/).pop() ?? p : '';
  switch (tool) {
    case 'read_file': return { title: 'Lettura', command: `read · ${base}` };
    case 'list_dir': return { title: 'Elenco', command: `list · ${p || 'cartelle autorizzate'}` };
    case 'search_files': return { title: 'Ricerca', command: `search · "${String(args.query ?? '')}"` };
    case 'search_memory': return { title: 'Memoria', command: `memory · "${String(args.query ?? '')}"` };
    case 'workspace_context': return { title: 'Contesto', command: `context · "${String(args.query ?? '')}"` };
    case 'write_file': return { title: 'Scrittura', command: `write · ${base}` };
    case 'edit_file': return { title: 'Modifica', command: `edit · ${base}` };
    case 'create_file': return { title: 'Creazione', command: `create · ${base}` };
    case 'delete_file': return { title: 'Eliminazione', command: `delete · ${base}` };
    case 'run_shell': return { title: 'Shell', command: `run · ${String(args.command ?? '')}` };
    case 'open_onarsuite_page': return { title: 'Navigazione', command: `open · ${String(args.path ?? '/')}` };
    case 'business_brief': return { title: 'Cabina di regia', command: `brief · ${String(args.horizon_days ?? 7)} giorni` };
    case 'onar_action': return { title: 'OnarSuite', command: `${String(args.action_type ?? 'azione')}` };
    case 'onar_upload': return { title: 'OnarSuite', command: `upload · ${base}` };
    case 'request_form': return { title: 'Magic Panel', command: `form · ${String(args.title ?? args.action ?? 'dati')}` };
    default: return { title: 'Strumento', command: tool };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore imprevisto.';
}

const LANG_BY_EXT: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c', cpp: 'cpp',
  cs: 'csharp', sh: 'bash', bash: 'bash', ps1: 'powershell', sql: 'sql', html: 'xml', htm: 'xml', xml: 'xml',
  css: 'css', scss: 'scss', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', vue: 'xml', svelte: 'xml',
};

function langFor(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_BY_EXT[ext];
}

/** Turn a tool result into a structured right-panel preview (only the cases
 *  worth a panel: a file Max read/wrote, or an object it created in OnarSuite). */
export function buildPanel(tool: string, args: Record<string, unknown>, result: { ok: boolean; content: string; data?: unknown }): PanelData | null {
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const compact = (value: string, max = 240) => value.replace(/\s+/g, ' ').trim().slice(0, max);
  const stripTags = (value: string) => value.replace(/<[^>]*>/g, ' ');
  const looksLikeHtml = (value: string) => /<(?:h[1-6]|p|div|section|article|aside|ul|ol|li|table|thead|tbody|tr|td|th|br|strong|em|span|blockquote)\b/i.test(value);
  const buildSearchLinks = (): Array<{ title: string; url: string; excerpt?: string; source?: string }> => {
    const raw = result.data as { results?: Array<Record<string, unknown>>; answer?: unknown; data?: { results?: Array<Record<string, unknown>>; answer?: unknown } } | undefined;
    const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const results = Array.isArray(data?.results) ? data.results : [];
    const links: Array<{ title: string; url: string; excerpt?: string; source?: string }> = [];
    for (const entry of results) {
        const title = str(entry.title || entry.name || entry.url);
        const url = str(entry.url || entry.link);
        if (!url) continue;
        const excerpt = compact(str(entry.content || entry.snippet || entry.description), 180) || undefined;
        const source = str(entry.source || entry.domain || entry.site) || undefined;
        links.push({ title: title || url, url, excerpt, source });
    }
    return links;
  };

  if (tool === 'business_brief' && result.ok) {
    const brief = result.data as { generatedAt?: string; horizonDays?: number; focus?: string; sections?: Array<{ label?: string; ok?: boolean; count?: number; message?: string }> } | undefined;
    const sections = Array.isArray(brief?.sections) ? brief.sections : [];
    return {
      kind: 'table',
      title: 'Cabina di regia aziendale',
      subtitle: `Orizzonte ${brief?.horizonDays ?? 7} giorni · focus ${brief?.focus || 'generale'}`,
      ok: true,
      columns: ['Area', 'Stato', 'Elementi', 'Sintesi'],
      rows: sections.map((section) => [
        str(section.label) || 'Area',
        section.ok ? 'Disponibile' : 'Non disponibile',
        typeof section.count === 'number' ? String(section.count) : '—',
        compact(str(section.message), 120) || '—',
      ]),
    };
  }

  if (tool === 'request_form' && result.ok) {
    const data = (result.data ?? args) as Record<string, unknown>;
    return {
      kind: 'form', title: str(data.title) || 'Dati richiesti', subtitle: str(data.description) || undefined,
      action: str(data.action), actionType: str(data.action_type),
      schema: Array.isArray(data.fields) ? data.fields as NonNullable<PanelData['schema']> : [],
      values: data.prefill && typeof data.prefill === 'object' ? data.prefill as Record<string, unknown> : {},
      confirmationRequired: data.confirmation_required !== false, dangerous: Boolean(data.dangerous),
    };
  }

  if (tool === 'read_file') {
    const p = str(args.path);
    return { kind: 'file', title: p.split(/[\\/]/).pop() || p, subtitle: p, path: p, lang: langFor(p), text: result.content.slice(0, 8000), ok: result.ok };
  }

  if ((tool === 'write_file' || tool === 'create_file') && result.ok) {
    const p = str(args.path);
    return { kind: 'file', title: p.split(/[\\/]/).pop() || p, subtitle: p, path: p, lang: langFor(p), text: str(args.content).slice(0, 8000), ok: true };
  }

  // Some models call an OnarSuite read-only action as a bare top-level tool
  // (e.g. `news`/`web_search`) instead of via onar_action. Render it the same.
  if (tool !== 'onar_action' && AUTO_MARKER_ACTIONS.has(tool)) {
    return buildPanel('onar_action', { action_type: tool, data: args }, result);
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
      if (data.title) fields.push({ label: 'Titolo', value: str(data.title) });
      if (data.client_name || data.client_email) fields.push({ label: 'Cliente', value: str(data.client_name || data.client_email) });
      if (data.amount) fields.push({ label: 'Importo', value: `${str(data.amount)} EUR` });
      if (data.payment_terms) fields.push({ label: 'Termini', value: str(data.payment_terms) });
      if (data.start_date || data.end_date) fields.push({ label: 'Periodo', value: [str(data.start_date), str(data.end_date)].filter(Boolean).join(' → ') });
      const html = looksLikeHtml(result.content) ? result.content : undefined;
      const summary = html ? compact(stripTags(result.content)) : compact(result.content);
      return { kind: 'contract', title: str(data.title) || 'Contratto', subtitle: summary || undefined, ok: result.ok, fields, html, text: html ? undefined : result.content };
    }
    if (action === 'web_search' || action === 'news') {
      const links = buildSearchLinks();
      const raw = result.data as { answer?: unknown; data?: { answer?: unknown } } | undefined;
      const answer = str(raw?.data?.answer ?? raw?.answer);
      const summary = compact(answer || result.content, 320);
      const fallbackTitle = action === 'news' ? 'Notizie' : 'Risultati web';
      return {
        kind: 'result',
        title: str(data.query) || str(data.topic) || fallbackTitle,
        subtitle: summary || undefined,
        ok: result.ok,
        links: links.length ? links : undefined,
        text: links.length ? undefined : result.content,
      };
    }
    if (/reminder/.test(action)) {
      const fields: PanelField[] = [];
      if (data.name || data.title) fields.push({ label: 'Titolo', value: str(data.name ?? data.title) });
      if (data.reminder_date) fields.push({ label: 'Data', value: str(data.reminder_date) });
      if (data.send_time) fields.push({ label: 'Ora', value: str(data.send_time) });
      if (data.priority) fields.push({ label: 'Priorita', value: str(data.priority) });
      return { kind: 'reminder', title: str(data.name ?? data.title) || 'Promemoria', subtitle: compact(result.content), ok: result.ok, fields };
    }
    return { kind: 'result', title: action || 'OnarSuite', text: result.content, ok: result.ok };
  }

  return null;
}

function extractStructuredMarker(text: string): { message: string; action?: { type: string; data?: Record<string, unknown> }; navigate?: { url: string; label?: string } } {
  const trimmed = text.trim();
  if (!trimmed) return { message: '' };
  const marker = /<{2,}\s*MAX\s*[_\- ]?\s*AI\s*>{2,}/i;
  const match = marker.exec(trimmed);
  if (!match) return { message: trimmed };
  const message = trimmed.slice(0, match.index).trim();
  const jsonText = trimmed.slice(match.index + match[0].length).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch {
    decoded = undefined;
  }
  if (!decoded || typeof decoded !== 'object') return { message };
  const value = decoded as Record<string, unknown>;
  const action = value.action && typeof value.action === 'object' ? value.action as Record<string, unknown> : undefined;
  const navigate = value.navigate && typeof value.navigate === 'object' ? value.navigate as Record<string, unknown> : undefined;
  return {
    message,
    action: action && typeof action.type === 'string' ? { type: action.type, data: (action.data as Record<string, unknown>) ?? {} } : undefined,
    navigate: navigate && typeof navigate.url === 'string' ? { url: navigate.url, label: typeof navigate.label === 'string' ? navigate.label : undefined } : undefined,
  };
}
