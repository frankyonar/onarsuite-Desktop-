import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssistantActionMode } from '../../shared/types';
import type { AgentSdk } from './agent-sdk';
import type { AuditLog } from './audit-log';

export interface AssistantActionDefinition {
  action: string;
  route: string;
  mode: AssistantActionMode;
  requiredFields: string[];
  optionalFields: string[];
  confirmationRequired: boolean;
  dockTitle: string;
  permissions: string[];
  aliases: string[];
}

export interface AssistantIntentResult {
  action: string;
  route: string;
  mode: AssistantActionMode;
  dockTitle: string;
  extractedFields: Record<string, string>;
  missingFields: string[];
  shouldOpenDock: boolean;
  confirmationRequired: boolean;
}

export interface PreparedAssistantAction {
  actionId: string;
  action: string;
  route: string;
  mode: AssistantActionMode;
  title: string;
  openUrl: string;
  prefill: Record<string, unknown>;
}

interface PendingActionState {
  action: string;
  collectedFields: Record<string, string>;
  missingFields: string[];
  status: 'collecting_fields';
  updatedAt: string;
}

const REGISTRY: Record<string, AssistantActionDefinition> = {
  'clients.create': {
    action: 'clients.create',
    route: '/bookings/customers',
    mode: 'create',
    requiredFields: ['first_name', 'last_name', 'email'],
    optionalFields: ['phone', 'company', 'notes'],
    confirmationRequired: true,
    dockTitle: 'Nuovo cliente',
    permissions: ['create-booking-customers'],
    aliases: ['crea cliente', 'nuovo cliente', 'aggiungi cliente', 'create customer'],
  },
  'clients.list': {
    action: 'clients.list',
    route: '/bookings/customers',
    mode: 'view',
    requiredFields: [],
    optionalFields: [],
    confirmationRequired: false,
    dockTitle: 'Clienti',
    permissions: ['manage-booking-customers'],
    aliases: ['mostrami i clienti', 'apri clienti', 'vai ai clienti', 'elenca clienti', 'lista clienti'],
  },
  'contracts.create': {
    action: 'contracts.create',
    route: '/onar-contracts/create',
    mode: 'create',
    requiredFields: ['title'],
    optionalFields: ['client_name', 'client_email', 'amount', 'payment_terms', 'start_date', 'end_date', 'description', 'internal_notes'],
    confirmationRequired: true,
    dockTitle: 'Nuovo contratto',
    permissions: ['create-contracts'],
    aliases: ['crea contratto', 'nuovo contratto', 'prepara contratto', 'bozza contratto'],
  },
  'reminders.create': {
    action: 'reminders.create',
    route: '/reminder',
    mode: 'create',
    requiredFields: ['name', 'reminder_date'],
    optionalFields: ['send_time', 'description', 'priority', 'kind', 'client_id', 'channels'],
    confirmationRequired: true,
    dockTitle: 'Nuovo promemoria',
    permissions: ['create-reminder'],
    aliases: ['crea promemoria', 'nuovo promemoria', 'ricordami', 'metti promemoria'],
  },
  'calendar.open': {
    action: 'calendar.open',
    route: '/calendar',
    mode: 'view',
    requiredFields: [],
    optionalFields: [],
    confirmationRequired: false,
    dockTitle: 'Calendario',
    permissions: ['view-booking-appointments'],
    aliases: ['apri calendario', 'mostrami calendario', 'vai al calendario'],
  },
  'calendar.create': {
    action: 'calendar.create',
    route: '/calendar/create',
    mode: 'create',
    requiredFields: ['title', 'date', 'start_time', 'end_time'],
    optionalFields: ['client', 'location', 'description'],
    confirmationRequired: true,
    dockTitle: 'Nuovo appuntamento',
    permissions: ['create-booking-appointments'],
    aliases: ['nuovo appuntamento', 'crea appuntamento', 'metti appuntamento'],
  },
  'vouchers.create': {
    action: 'vouchers.create',
    route: '/vouchers/create',
    mode: 'create',
    requiredFields: ['recipient_name', 'service_description'],
    optionalFields: ['sender_name', 'expiration_date', 'notes', 'price_hidden'],
    confirmationRequired: true,
    dockTitle: 'Nuovo voucher',
    permissions: ['create-vouchers'],
    aliases: ['crea voucher', 'voucher regalo'],
  },
  'quotes.create': {
    action: 'quotes.create',
    route: '/quotes/create',
    mode: 'create',
    requiredFields: ['client', 'title'],
    optionalFields: ['items', 'amount', 'notes', 'attachments'],
    confirmationRequired: true,
    dockTitle: 'Nuovo preventivo',
    permissions: ['create-sales-quotes'],
    aliases: ['crea preventivo', 'nuovo preventivo'],
  },
};

export class AssistantActionOrchestrator {
  private readonly stateFile: string;

  constructor(
    private readonly sdk: AgentSdk,
    private readonly audit: AuditLog,
    dataDirectory: string,
    private readonly getServerUrl: () => Promise<string>,
  ) {
    this.stateFile = path.join(dataDirectory, 'assistant-actions.json');
  }

  async handleMessage(conversationId: string | undefined, message: string): Promise<{ text: string; action?: PreparedAssistantAction } | null> {
    const text = message.trim();
    if (!text) return null;

    const key = this.stateKey(conversationId);
    const pending = await this.readPending(key);
    if (pending && /(annulla|cancella|lascia perdere|stop|ferma)/i.test(text)) {
      await this.clearPending(key);
      return { text: 'Operazione annullata. Non ho creato nulla.' };
    }
    const detected = detectIntent(text, pending);
    if (!detected) return null;

    const action = REGISTRY[detected.action];
    if (!action) return null;

    const missingFields = action.requiredFields.filter((field) => !detected.extractedFields[field]);
    const collectedFields = { ...(pending?.collectedFields ?? {}), ...detected.extractedFields };

    if (missingFields.length > 0) {
      await this.writePending(key, {
        action: detected.action,
        collectedFields,
        missingFields,
        status: 'collecting_fields',
        updatedAt: new Date().toISOString(),
      });

      return {
        text: buildMissingFieldsPrompt(detected.action, missingFields),
      };
    }

    await this.clearPending(key);

    const payload = sanitizePrefill(detected.action, collectedFields);
    const serverUrl = await this.getServerUrl();
    const created = await this.sdk.createAssistantAction({
      action: detected.action,
      route: action.route,
      mode: action.mode,
      prefill: payload,
    });

    await this.audit.write('assistant_action_created', 'info', 'Assistant action creata', {
      action: detected.action,
      route: action.route,
      actionId: created.action_id,
    });

    return {
      text: buildReadyMessage(detected.action),
      action: {
        actionId: created.action_id,
        action: detected.action,
        route: action.route,
        mode: action.mode,
        title: action.dockTitle,
        openUrl: resolveOpenUrl(serverUrl, created.open_url),
        prefill: payload,
      },
    };
  }

  async get(actionId: string) {
    return this.sdk.getAssistantAction(actionId);
  }

  private stateKey(conversationId?: string): string {
    return conversationId?.trim() || 'default';
  }

  private async readPending(key: string): Promise<PendingActionState | undefined> {
    const all = await this.readAll();
    return all[key];
  }

  private async writePending(key: string, value: PendingActionState): Promise<void> {
    const all = await this.readAll();
    all[key] = value;
    await this.writeAll(all);
  }

  private async clearPending(key: string): Promise<void> {
    const all = await this.readAll();
    if (all[key]) {
      delete all[key];
      await this.writeAll(all);
    }
  }

  private async readAll(): Promise<Record<string, PendingActionState>> {
    await mkdir(path.dirname(this.stateFile), { recursive: true });
    try {
      return JSON.parse(await readFile(this.stateFile, 'utf8')) as Record<string, PendingActionState>;
    } catch {
      return {};
    }
  }

  private async writeAll(value: Record<string, PendingActionState>): Promise<void> {
    const temp = `${this.stateFile}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rm(this.stateFile, { force: true });
    await writeFile(this.stateFile, await readFile(temp));
    await rm(temp, { force: true });
  }
}

function detectIntent(message: string, pending?: PendingActionState): AssistantIntentResult | null {
  const lower = message.toLowerCase();
  const explicit = findExplicitIntent(lower);
  const action = explicit || pending?.action;
  if (!action) return null;

  const extractedFields = action === 'clients.create'
    ? extractClientFields(message, pending?.collectedFields)
    : action === 'contracts.create'
      ? extractContractFields(message, pending?.collectedFields)
      : action === 'reminders.create'
        ? extractReminderFields(message, pending?.collectedFields)
        : {};

  const definition = REGISTRY[action];
  const merged = { ...(pending?.collectedFields ?? {}), ...extractedFields };
  const missingFields = definition.requiredFields.filter((field) => !merged[field]);

  return {
    action,
    route: definition.route,
    mode: definition.mode,
    dockTitle: definition.dockTitle,
    extractedFields: merged,
    missingFields,
    shouldOpenDock: missingFields.length === 0,
    confirmationRequired: definition.confirmationRequired,
  };
}

function findExplicitIntent(lowerMessage: string): string | undefined {
  for (const [action, definition] of Object.entries(REGISTRY)) {
    if (definition.aliases.some((alias) => lowerMessage.includes(alias))) return action;
  }
  if (/(cliente|clienti)/.test(lowerMessage) && /mostra|apri|vai|elenca|lista/.test(lowerMessage)) return 'clients.list';
  if (/(cliente|clienti)/.test(lowerMessage) && /crea|nuovo|aggiungi/.test(lowerMessage)) return 'clients.create';
  if (/(contratto|contratti|preventivo)/.test(lowerMessage) && /crea|nuovo|aggiungi|prepara/.test(lowerMessage)) return 'contracts.create';
  if (/(promemoria|ricorda|ricordami|memo)/.test(lowerMessage) && /crea|nuovo|aggiungi|metti|fissa/.test(lowerMessage)) return 'reminders.create';
  return undefined;
}

function extractClientFields(message: string, previous?: Record<string, string>): Record<string, string> {
  const extracted: Record<string, string> = { ...(previous ?? {}) };
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) extracted.email = email.trim();

  const phone = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0];
  if (phone) extracted.phone = normalizePhone(phone);

  const nameChunk = extractNameChunk(message, extracted);
  const parts = nameChunk.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    extracted.first_name = extracted.first_name || parts[0];
    extracted.last_name = extracted.last_name || parts.slice(1).join(' ');
  } else if (parts.length === 1) {
    if (!extracted.first_name) extracted.first_name = parts[0];
    else if (!extracted.last_name) extracted.last_name = parts[0];
  }

  const company = extractAfterLabel(message, ['azienda', 'company', 'ragione sociale']);
  if (company) extracted.company = company;

  const notes = extractAfterLabel(message, ['note', 'note:', 'nota', 'descrizione']);
  if (notes) extracted.notes = notes;

  return extracted;
}

function extractContractFields(message: string, previous?: Record<string, string>): Record<string, string> {
  const extracted: Record<string, string> = { ...(previous ?? {}) };
  const title = extractAfterLabel(message, ['titolo', 'oggetto', 'subject', 'contratto']);
  if (title) extracted.title = title;

  const clientEmail = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (clientEmail) extracted.client_email = clientEmail.trim();

  const clientName = extractAfterLabel(message, ['cliente', 'committente', 'destinatario']);
  if (clientName) extracted.client_name = clientName;

  const amount = message.match(/(?:â‚¬|eur|euro)\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(?:â‚¬|eur|euro)/i);
  if (amount) extracted.amount = normalizeAmount(amount[1] ?? amount[2]);

  const paymentTerms = extractAfterLabel(message, ['termini di pagamento', 'pagamento', 'payment terms']);
  if (paymentTerms) extracted.payment_terms = paymentTerms;

  const dates = extractDates(message);
  if (dates[0]) extracted.start_date = dates[0];
  if (dates[1]) extracted.end_date = dates[1];

  const description = extractAfterLabel(message, ['descrizione', 'oggetto', 'note']);
  if (description) extracted.description = description;

  const internalNotes = extractAfterLabel(message, ['note interne', 'interno', 'internal notes']);
  if (internalNotes) extracted.internal_notes = internalNotes;

  return extracted;
}

function extractReminderFields(message: string, previous?: Record<string, string>): Record<string, string> {
  const extracted: Record<string, string> = { ...(previous ?? {}) };
  const title = extractAfterLabel(message, ['titolo', 'promemoria', 'name', 'oggetto']);
  if (title) extracted.name = title;

  const dates = extractDates(message);
  if (dates[0]) extracted.reminder_date = dates[0];

  const time = message.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0];
  if (time) extracted.send_time = time;

  const priority = message.match(/\b(low|medium|high|bassa|media|alta)\b/i)?.[0]?.toLowerCase();
  if (priority) extracted.priority = priority === 'bassa' ? 'low' : priority === 'alta' ? 'high' : 'medium';

  const kind = message.match(/\b(client|cliente|personal|personale|automation|automazione)\b/i)?.[0]?.toLowerCase();
  if (kind) extracted.kind = kind === 'cliente' || kind === 'client' ? 'client' : kind === 'automazione' || kind === 'automation' ? 'automation' : 'personal';

  const description = extractAfterLabel(message, ['descrizione', 'note', 'dettagli']);
  if (description) extracted.description = description;

  const clientId = message.match(/\bclient[_\s-]?id[:\s]*([0-9]+)\b/i)?.[1];
  if (clientId) extracted.client_id = clientId;

  const channels = extractChannels(message);
  if (channels.length > 0) extracted.channels = channels.join(',');

  return extracted;
}

function extractNameChunk(message: string, collected: Record<string, string>): string {
  let chunk = message;
  chunk = chunk.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
  chunk = chunk.replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, ' ');
  chunk = chunk.replace(/\b(crea|creare|nuovo|nuova|cliente|clienti|aggiungi|email|telefono|tel|mobile|cellulare|per|un|una)\b/gi, ' ');
  chunk = chunk.replace(/[:;,|]/g, ' ');
  chunk = chunk.replace(/\s+/g, ' ').trim();

  if (!chunk && (collected.first_name || collected.last_name)) {
    return [collected.first_name, collected.last_name].filter(Boolean).join(' ');
  }

  return chunk;
}

function extractAfterLabel(message: string, labels: string[]): string | undefined {
  const lower = message.toLowerCase();
  for (const label of labels) {
    const idx = lower.indexOf(label);
    if (idx === -1) continue;
    const tail = message.slice(idx + label.length).replace(/^[:\s-]+/, '').trim();
    if (tail) return tail.split(/[\n.;]/)[0].trim();
  }
  return undefined;
}

function extractDates(message: string): string[] {
  const matches = message.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/g) ?? [];
  return matches.map((value) => normalizeDate(value)).filter((value): value is string => Boolean(value));
}

function extractChannels(message: string): string[] {
  const channels = new Set<string>();
  if (/\bemail\b/i.test(message)) channels.add('email');
  if (/\bsms\b/i.test(message)) channels.add('sms');
  if (/\bwhatsapp\b/i.test(message)) channels.add('whatsapp');
  return [...channels];
}

function normalizeDate(value: string): string | undefined {
  const parts = value.includes('-') ? value.split('-') : value.split(/[\/.]/);
  if (parts.length !== 3) return undefined;
  if (value.includes('-') && parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  const [a, b, c] = parts;
  const year = c.length === 2 ? `20${c}` : c;
  const day = a.padStart(2, '0');
  const month = b.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeAmount(value: string): string {
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  return cleaned;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').replace(/^\+?00/, '+');
}

function sanitizePrefill(action: string, fields: Record<string, string>): Record<string, unknown> {
  const prefill: Record<string, unknown> = {};
  switch (action) {
    case 'clients.create':
      if (fields.first_name) prefill.first_name = fields.first_name.trim();
      if (fields.last_name) prefill.last_name = fields.last_name.trim();
      if (fields.email) prefill.email = fields.email.trim();
      if (fields.phone) prefill.phone = fields.phone.trim();
      if (fields.company) prefill.company = fields.company.trim();
      if (fields.notes) prefill.notes = fields.notes.trim();
      break;
    case 'contracts.create':
      if (fields.title) prefill.title = fields.title.trim();
      if (fields.client_name) prefill.client_name = fields.client_name.trim();
      if (fields.client_email) prefill.client_email = fields.client_email.trim();
      if (fields.amount) prefill.amount = fields.amount.trim();
      if (fields.payment_terms) prefill.payment_terms = fields.payment_terms.trim();
      if (fields.start_date) prefill.start_date = fields.start_date.trim();
      if (fields.end_date) prefill.end_date = fields.end_date.trim();
      if (fields.description) prefill.description = fields.description.trim();
      if (fields.internal_notes) prefill.internal_notes = fields.internal_notes.trim();
      break;
    case 'reminders.create':
      if (fields.name) prefill.name = fields.name.trim();
      if (fields.reminder_date) prefill.reminder_date = fields.reminder_date.trim();
      if (fields.send_time) prefill.send_time = fields.send_time.trim();
      if (fields.description) prefill.description = fields.description.trim();
      if (fields.priority) prefill.priority = fields.priority.trim();
      if (fields.kind) prefill.kind = fields.kind.trim();
      if (fields.client_id) prefill.client_id = fields.client_id.trim();
      if (fields.channels) prefill.channels = fields.channels.split(',').map((channel) => channel.trim()).filter(Boolean);
      break;
    default:
      break;
  }
  return prefill;
}

function buildMissingFieldsPrompt(action: string, missingFields: string[]): string {
  if (action === 'clients.create') {
    const labels: Record<string, string> = {
      first_name: 'nome',
      last_name: 'cognome',
      email: 'email',
      phone: 'telefono',
    };
    const required = missingFields.filter((field) => ['first_name', 'last_name', 'email'].includes(field)).map((field) => labels[field]).filter(Boolean);
    const optional = missingFields.includes('phone') ? 'Puoi aggiungere anche il telefono.' : '';
    const missingText = required.length > 0 ? `${joinItalian(required)}${optional ? '.' : ''}` : 'i dati mancanti.';
    return `Certo. Per creare il cliente mi servono ${missingText} ${optional}`.trim();
  }
  if (action === 'contracts.create') {
    if (missingFields.includes('title')) return 'Mi serve il titolo del contratto per prepararlo nel lock web.';
    return 'Mi servono ancora alcuni dati per preparare il contratto.';
  }
  if (action === 'reminders.create') {
    if (missingFields.includes('name') && missingFields.includes('reminder_date')) return 'Mi servono il titolo e la data del promemoria.';
    if (missingFields.includes('name')) return 'Mi serve il titolo del promemoria.';
    if (missingFields.includes('reminder_date')) return 'Mi serve la data del promemoria.';
    return 'Mi servono ancora alcuni dati per preparare il promemoria.';
  }
  if (action === 'clients.list') return 'Apro la lista clienti nel pannello laterale.';
  return 'Mi servono ancora alcuni dati per continuare.';
}

function buildReadyMessage(action: string): string {
  if (action === 'clients.create') return 'Perfetto, preparo la scheda cliente nel pannello laterale. Controlla i dati e conferma la creazione.';
  if (action === 'clients.list') return 'Ho aperto i clienti nel pannello laterale.';
  if (action === 'contracts.create') return 'Perfetto, preparo il contratto nel lock web.';
  if (action === 'reminders.create') return 'Perfetto, preparo il promemoria nel lock web.';
  return 'Perfetto, preparo l\'operazione nel pannello laterale.';
}

function joinItalian(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ed ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

function resolveOpenUrl(serverUrl: string, openUrl: string): string {
  return new URL(openUrl, serverUrl).toString();
}

