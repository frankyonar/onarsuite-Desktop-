import type { AgentStreamEvent, AppSnapshot, AuditEntry, Conversation, FsEntry, LocalFile, MaxDesktopApi, UpdateState } from '../../shared/types';

let convs: Conversation[] = [];

const snapshot: AppSnapshot = {
  appVersion: '0.9.24', connection: 'connected', serverUrl: 'https://onarsuite.com', deviceId: 'dev_preview',
  deviceName: 'PC Francesco - Max Desktop', accountLabel: 'OnarSuite Demo', planName: 'PRO', workspacePath: 'C:\\Users\\franc\\Documents\\OnarSuite Workspace',
  authorizedFolders: ['C:\\Users\\franc\\Documents\\Clienti'],
  permissions: ['files:read', 'files:write', 'files:edit_existing', 'files:create', 'files:delete', 'files:upload', 'system:shell', 'crm:create_draft', 'quotes:create_draft', 'tasks:create'],
  lastSyncAt: new Date().toISOString(), encryptionAvailable: true, pendingActions: 0,
};

const files: LocalFile[] = [
  { id: '1', name: 'Preventivo Rossi.pdf', path: 'preview/Preventivo Rossi.pdf', extension: 'pdf', size: 248120, modifiedAt: new Date().toISOString(), source: 'workspace' },
  { id: '2', name: 'Lista clienti.xlsx', path: 'preview/Lista clienti.xlsx', extension: 'xlsx', size: 86420, modifiedAt: new Date(Date.now() - 7200000).toISOString(), source: 'authorized_folder' },
];

const logs: AuditEntry[] = [
  { id: '1', createdAt: new Date().toISOString(), eventType: 'agent_shell', level: 'security', message: 'Comando shell eseguito' },
  { id: '2', createdAt: new Date(Date.now() - 300000).toISOString(), eventType: 'agent_edit', level: 'security', message: 'File modificato' },
  { id: '3', createdAt: new Date(Date.now() - 600000).toISOString(), eventType: 'agent_read', level: 'info', message: 'File letto' },
];

const tree: Record<string, FsEntry[]> = {
  '': [
    { name: 'OnarSuite Workspace', path: 'preview/workspace', kind: 'dir', modifiedAt: new Date().toISOString() },
    { name: 'Clienti', path: 'preview/clienti', kind: 'dir', modifiedAt: new Date().toISOString() },
  ],
  'preview/workspace': [
    { name: 'preventivi', path: 'preview/workspace/preventivi', kind: 'dir' },
    { name: 'README.md', path: 'preview/workspace/README.md', kind: 'file', extension: 'md', size: 1240, modifiedAt: new Date().toISOString() },
    { name: 'contratto.html', path: 'preview/workspace/contratto.html', kind: 'file', extension: 'html', size: 5320, modifiedAt: new Date().toISOString() },
  ],
};

const fileText: Record<string, string> = {
  'preview/workspace/README.md': '# OnarSuite Workspace\n\nCartella di lavoro di Max.\n\n- preventivi/\n- contratto.html\n',
  'preview/workspace/contratto.html': '<h1>Contratto di servizio</h1>\n<p>Tra le partiâ€¦</p>\n',
};

const updateState: UpdateState = { status: 'disabled', currentVersion: snapshot.appVersion };

export function createPreviewApi(): MaxDesktopApi {
  const initialSnapshot = new URLSearchParams(location.search).has('unpaired')
    ? { ...snapshot, deviceId: undefined, connection: 'not_paired' as const }
    : snapshot;
  const listeners = new Set<(event: AgentStreamEvent) => void>();
  let canceled = false;

  const emit = (event: AgentStreamEvent) => listeners.forEach((cb) => cb(event));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    getSnapshot: async () => initialSnapshot,
    pair: async () => snapshot,
    disconnect: async () => ({ ...snapshot, deviceId: undefined, connection: 'not_paired' }),
    addAuthorizedFolder: async () => snapshot,
    removeAuthorizedFolder: async () => snapshot,
    chooseFiles: async () => files,
    importDroppedFiles: async () => files,
    getPathForFile: () => '',
    listFiles: async () => files,
    parseFile: async (filePath) => ({ path: filePath, type: 'pdf', text: 'Anteprima documento cliente Rossi.', summary: 'Proposta commerciale per il cliente Rossi.', metadata: { size: 248120 } }),
    openFile: async () => undefined,
    revealFile: async () => undefined,
    performFileAction: async () => ({ status: 'completed', message: 'Anteprima: operazione completata.' }),
    listAudit: async () => logs,
    syncNow: async () => snapshot,
    clearLocalData: async () => snapshot,
    getUpdateState: async () => updateState,
    checkForUpdates: async () => updateState,
    downloadUpdate: async () => updateState,
    installUpdate: async () => undefined,
    onUpdateStateChanged: () => () => undefined,
    sendChat: async () => ({ message: { id: crypto.randomUUID(), role: 'assistant', content: 'Ho analizzato il documento.', createdAt: new Date().toISOString() } }),
    runAgent: async (input) => {
      const runId = 'preview';
      canceled = false;
      emit({ type: 'status', runId, text: 'Max sta pensandoâ€¦' });
      await wait(700);
      if (canceled) return emit({ type: 'done', runId });
      emit({ type: 'tool_start', runId, id: 't1', tool: 'list_dir', title: 'Elenco', command: 'list Â· workspace' });
      await wait(600);
      emit({ type: 'tool_end', runId, id: 't1', ok: true, preview: 'FILE  README.md\nFILE  contratto.html\nDIR   preventivi' });
      emit({ type: 'tool_start', runId, id: 't2', tool: 'read_file', title: 'Lettura', command: 'read Â· contratto.html' });
      await wait(700);
      emit({ type: 'tool_end', runId, id: 't2', ok: true, preview: '<h1>Contratto di servizio</h1>\n<p>Tra le partiâ€¦</p>' });
      emit({ type: 'assistant', runId, text: `Ho letto il contratto. Aggiorno lâ€™intestazione e creo un task di follow-up.` });
      emit({ type: 'tool_start', runId, id: 't3', tool: 'edit_file', title: 'Modifica', command: 'edit Â· contratto.html' });
      await wait(700);
      emit({ type: 'tool_end', runId, id: 't3', ok: true, isDiff: true, preview: '- <h1>Contratto di servizio</h1>\n+ <h1>Contratto di servizio â€” OnarSuite</h1>' });
      emit({ type: 'tool_start', runId, id: 't4', tool: 'onar_action', title: 'OnarSuite', command: 'create_user' });
      await wait(800);
      emit({ type: 'tool_end', runId, id: 't4', ok: true, preview: "create_user Â· Utente 'Ferdinando Franzese' creato. Password temporanea: 7Kf9pQ2xL4mZ" });
      emit({ type: 'panel', runId, panel: { kind: 'customer', title: 'Ferdinando Franzese', subtitle: 'Utente creato. Password temporanea: 7Kf9pQ2xL4mZ', ok: true, fields: [{ label: 'Email', value: 'fra@example.com' }, { label: 'Ruolo (ID)', value: '126' }] } });
      emit({ type: 'assistant', runId, text: `Fatto âœ…\n\n- Letto il contratto e aggiornata l'intestazione\n- Creato l'utente Ferdinando Franzese in OnarSuite (ruolo Cliente)\n\nLa password temporanea Ã¨ nel risultato qui sopra.` });
      emit({ type: 'done', runId });
      void input;
    },
    cancelAgent: async () => { canceled = true; },
    resetAgent: async () => undefined,
    listConversations: async () => convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
    getConversation: async (id) => convs.find((c) => c.id === id) ?? null,
    saveConversation: async (input) => {
      const now = new Date().toISOString();
      const ex = convs.find((c) => c.id === input.id);
      if (ex) { ex.items = input.items as never[]; ex.updatedAt = now; if (input.title) ex.title = input.title; }
      else convs.unshift({ id: input.id, title: input.title || 'Nuova chat', createdAt: now, updatedAt: now, items: input.items as never[] });
      return convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
    },
    newConversation: async () => ({ id: crypto.randomUUID(), title: 'Nuova chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: [] }),
    selectConversation: async () => undefined,
    deleteConversation: async (id) => { convs = convs.filter((c) => c.id !== id); return convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })); },
    renameConversation: async (id, title) => { const c = convs.find((x) => x.id === id); if (c) c.title = title; return convs.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt })); },
    titleConversation: async () => convs.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt })),
    onAgentEvent: (callback) => { listeners.add(callback); return () => listeners.delete(callback); },
    explore: async (dirPath) => tree[dirPath ?? ''] ?? [],
    readFileText: async (filePath) => ({ path: filePath, text: fileText[filePath] ?? '// File non disponibile in anteprima.', truncated: false }),
    writeFileText: async () => undefined,
    openExternal: async () => undefined,
    webLogin: async () => undefined,
    webSessionUrl: async (nextPath?: string) => {
      const url = new URL('https://onarsuite.com/desktop/web-login');
      url.searchParams.set('token', 'preview');
      if (nextPath && nextPath.startsWith('/')) url.searchParams.set('next', nextPath);
      return url.toString();
    },
    onAuthChanged: () => () => undefined,
    onar: async (actionType) => {
      if (actionType === 'list_reminders') return { success: true, message: '2 promemoria', data: { reminders: [{ id: 1, title: 'Richiamare Rossi', date: '2026-06-25', priority: 'high' }, { id: 2, title: 'Inviare preventivo', date: '2026-06-28', priority: 'medium' }] } };
      if (actionType === 'list_leads') return { success: true, message: '1 cliente', data: { leads: [{ id: 1, name: 'Ferdinando Franzese', email: 'fra@example.com', phone: '333 1234567' }] } };
      if (actionType === 'contract_list') return { success: true, message: '1 contratto', data: { contracts: [{ id: 1, title: 'Pacchetto turistico', client: 'Franzese', status: 'draft', amount: 1200, currency: 'EUR' }] } };
      if (actionType === 'list_users') return { success: true, message: '1 utente', data: { users: [{ id: 1, name: 'Azienda Demo', email: 'company@example.com', type: 'company' }] } };
      return { success: true, message: 'Anteprima: azione eseguita su OnarSuite.' };
    },
  };
}

