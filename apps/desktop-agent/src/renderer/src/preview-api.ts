import type { AppSnapshot, AuditEntry, LocalFile, MaxDesktopApi } from '../../shared/types';

const snapshot: AppSnapshot = {
  appVersion: '0.2.0', connection: 'connected', serverUrl: 'https://onarsuite.com', deviceId: 'dev_preview',
  deviceName: 'PC Francesco - Max Desktop', accountLabel: 'OnarSuite Demo', workspacePath: 'C:\\Users\\franc\\Documents\\OnarSuite Workspace',
  authorizedFolders: ['C:\\Users\\franc\\Documents\\Clienti'], permissions: ['files:read', 'files:write_workspace', 'files:upload', 'crm:create_draft', 'quotes:create_draft', 'tasks:create'],
  lastSyncAt: new Date().toISOString(), encryptionAvailable: true, pendingActions: 0,
};

const files: LocalFile[] = [
  { id: '1', name: 'Preventivo Rossi.pdf', path: 'preview/Preventivo Rossi.pdf', extension: 'pdf', size: 248120, modifiedAt: new Date().toISOString(), source: 'workspace' },
  { id: '2', name: 'Lista clienti.xlsx', path: 'preview/Lista clienti.xlsx', extension: 'xlsx', size: 86420, modifiedAt: new Date(Date.now() - 7200000).toISOString(), source: 'authorized_folder' },
];

const logs: AuditEntry[] = [
  { id: '1', createdAt: new Date().toISOString(), eventType: 'heartbeat_received', level: 'info', message: 'Connessione OnarSuite verificata' },
  { id: '2', createdAt: new Date(Date.now() - 600000).toISOString(), eventType: 'file_selected', level: 'info', message: 'File copiato nella workspace' },
];

export function createPreviewApi(): MaxDesktopApi {
  const initialSnapshot = new URLSearchParams(location.search).has('unpaired')
    ? { ...snapshot, deviceId: undefined, connection: 'not_paired' as const }
    : snapshot;
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
    parseFile: async (filePath) => ({ path: filePath, type: 'pdf', text: 'Anteprima documento cliente Rossi.', summary: 'Proposta commerciale per il cliente Rossi con servizi, quantità e condizioni economiche.', metadata: { size: 248120 } }),
    openFile: async () => undefined,
    performFileAction: async () => ({ status: 'completed', message: 'Anteprima: operazione completata.' }),
    listAudit: async () => logs,
    syncNow: async () => snapshot,
    clearLocalData: async () => snapshot,
    sendChat: async () => ({ message: { id: crypto.randomUUID(), role: 'assistant', content: 'Ho analizzato il documento. Posso preparare una bozza di preventivo OnarSuite.', createdAt: new Date().toISOString() } }),
  };
}
