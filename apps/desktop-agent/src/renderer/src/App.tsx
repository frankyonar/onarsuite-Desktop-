import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { AgentStreamEvent, AppSnapshot, AuditEntry, ChatMessage, FsEntry, LocalFile, PairingInput, ToolName } from '../../shared/types';
import { APP_VERSION, BLOCKED_SCOPES, MVP_SCOPES } from '../../shared/types';
import { BrandMark, Button, Card, EmptyState, Markdown, StatusPill, ToolCard, Wordmark } from './components';

type View = 'onarsuite' | 'agent' | 'explorer' | 'dashboard' | 'folders' | 'logs' | 'settings';
type Theme = 'light' | 'dark';

type ConsoleItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: ToolName; title: string; command: string; status: 'running' | 'done' | 'error'; preview?: string; isDiff?: boolean };

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('max-theme') as Theme | null;
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('max-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'onarsuite', label: 'OnarSuite', icon: '◎' },
  { id: 'agent', label: 'Agente Max', icon: '◆' },
  { id: 'explorer', label: 'Esplora file', icon: '▤' },
  { id: 'dashboard', label: 'Panoramica', icon: '⌂' },
  { id: 'folders', label: 'Cartelle autorizzate', icon: '▱' },
  { id: 'logs', label: 'Attività', icon: '≡' },
  { id: 'settings', label: 'Impostazioni', icon: '⚙' },
];

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [startupError, setStartupError] = useState<string>();
  const [view, setView] = useState<View>('onarsuite');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<LocalFile>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warning'; text: string }>();
  const [theme, toggleTheme] = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('max-sidebar-w')) || 244);

  useEffect(() => { localStorage.setItem('max-sidebar-w', String(sidebarWidth)); }, [sidebarWidth]);

  const startResize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    const onMove = (e: globalThis.MouseEvent) => setSidebarWidth(Math.min(460, Math.max(184, e.clientX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const refresh = useCallback(async () => {
    if (!window.maxDesktop) throw new Error('Il collegamento sicuro con Max Desktop non è disponibile. Riavvia l’app.');
    const [nextSnapshot, nextFiles, nextLogs] = await Promise.all([
      window.maxDesktop.getSnapshot(), window.maxDesktop.listFiles(), window.maxDesktop.listAudit(),
    ]);
    setSnapshot(nextSnapshot); setFiles(nextFiles); setLogs(nextLogs); setStartupError(undefined);
  }, []);

  useEffect(() => { void refresh().catch((error) => setStartupError(errorText(error))); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => window.maxDesktop.onAuthChanged(() => void refresh().catch(() => undefined)), [refresh]);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    setBusy(true); setNotice(undefined);
    try { await task(); if (success) setNotice({ tone: 'success', text: success }); await refresh(); }
    catch (error) { setNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const importDrop = async (event: DragEvent) => {
    event.preventDefault();
    const paths = Array.from(event.dataTransfer.files).map((file) => window.maxDesktop.getPathForFile(file)).filter(Boolean);
    if (paths.length) await run(() => window.maxDesktop.importDroppedFiles(paths), 'File aggiunti alla workspace.');
  };

  if (!snapshot) return <StartupScreen error={startupError} onRetry={() => void refresh().catch((error) => setStartupError(errorText(error)))} />;
  if (snapshot.connection === 'not_paired') return <PairingPage snapshot={snapshot} busy={busy} notice={notice} onPair={(input) => run(() => window.maxDesktop.pair(input))} />;

  return <div className="app-shell" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}>
    <aside className="sidebar">
      <div className="brand"><BrandMark size={34} /><div><Wordmark /><span>Agente Max AI</span></div></div>
      <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-status"><StatusPill state={snapshot.connection} /><small>{snapshot.accountLabel || snapshot.deviceName}</small></div>
      <div className="sidebar-resizer" onMouseDown={startResize} title="Trascina per regolare la larghezza" />
    </aside>
    <main className="main-content">
      <header className="topbar">
        <div><span className="eyebrow">ONARSUITE · AGENTE MAX</span><h1>{viewTitles[view]}</h1></div>
        <div className="topbar-actions">
          {snapshot.pendingActions > 0 && <span className="queue-count">{snapshot.pendingActions} in coda</span>}
          <button className="theme-toggle" title="Tema chiaro/scuro" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => window.maxDesktop.syncNow(), 'Sincronizzazione completata.')}>Sincronizza</Button>
        </div>
      </header>
      {notice && <div className={`notice notice-${notice.tone}`}><span>{notice.text}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
      {view === 'onarsuite' && <OnarHome onNotice={setNotice} onOpenExternal={() => window.maxDesktop.openExternal(snapshot.serverUrl)} />}
      {view === 'agent' && <AgentConsole files={files} selected={selected} onSelectFile={setSelected} onAfterRun={() => void refresh()} />}
      {view === 'explorer' && <ExplorerView onNotice={setNotice} />}
      {view === 'dashboard' && <Dashboard snapshot={snapshot} files={files} logs={logs} onGoAgent={() => setView('agent')} onSync={() => run(() => window.maxDesktop.syncNow())} />}
      {view === 'folders' && <FoldersView snapshot={snapshot} busy={busy} onAdd={() => run(() => window.maxDesktop.addAuthorizedFolder())} onRemove={(folder) => run(() => window.maxDesktop.removeAuthorizedFolder(folder))} onDrop={importDrop} onChoose={() => run(() => window.maxDesktop.chooseFiles(), 'File aggiunti alla workspace.')} />}
      {view === 'logs' && <LogsView logs={logs} />}
      {view === 'settings' && <SettingsView snapshot={snapshot} busy={busy} onDisconnect={() => run(() => window.maxDesktop.disconnect())} onClear={() => run(() => window.maxDesktop.clearLocalData())} />}
    </main>
  </div>;
}

function StartupScreen({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return <div className="splash"><BrandMark size={72} /><h2>{error ? 'OnarSuite non è riuscito ad avviarsi' : 'Avvio di OnarSuite…'}</h2>{error && <><p className="startup-error">{error}</p><Button onClick={onRetry}>Riprova</Button></>}</div>;
}

function PairingPage({ snapshot, busy, notice, onPair }: { snapshot: AppSnapshot; busy: boolean; notice?: { tone: string; text: string }; onPair: (input: PairingInput) => void }) {
  const [serverUrl, setServerUrl] = useState(snapshot.serverUrl || 'https://onarsuite.com');
  const [deviceName, setDeviceName] = useState(snapshot.deviceName);
  const [pairingCode, setPairingCode] = useState('');
  return <div className="pairing-page"><section className="pairing-copy"><BrandMark size={64} /><span className="eyebrow">ONARSUITE · AGENTE MAX</span><h1>Il tuo dipendente digitale,<br />sul tuo computer.</h1><p>Max legge, scrive e modifica i file nelle cartelle che autorizzi, esegue comandi e crea cose in OnarSuite. In autonomia, con ogni azione registrata.</p><div className="trust-list"><span>✓ Accesso solo alle cartelle autorizzate</span><span>✓ Token cifrato dal sistema operativo</span><span>✓ Audit log completo di ogni azione</span></div></section><Card className="pairing-card" eyebrow="PRIMO ACCESSO" title="Collega questo computer">{notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}<label className="pairing-server">Server OnarSuite<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required /></label><Button className="web-login-btn" onClick={() => void window.maxDesktop.webLogin(serverUrl, APP_VERSION)}>Accedi con OnarSuite →</Button><small className="form-note">Si apre il browser per il login, poi torni qui in automatico.</small><div className="auth-divider"><span>oppure usa un codice di pairing</span></div><form onSubmit={(event) => { event.preventDefault(); onPair({ serverUrl, deviceName, pairingCode: pairingCode || undefined }); }}><label>Nome dispositivo<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required /></label><label>Codice pairing<input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} /></label><Button variant="secondary" disabled={busy}>{busy ? 'Collegamento…' : 'Collega con codice'}</Button></form></Card></div>;
}

const SUGGESTIONS = [
  'Riordina e rinomina i file nella workspace',
  'Leggi l’ultimo contratto e crea un task di follow-up',
  'Cerca “scadenza” nei documenti e riassumi',
  'Genera un README per questa cartella',
];

function AgentConsole({ files, selected, onSelectFile, onAfterRun }: { files: LocalFile[]; selected?: LocalFile; onSelectFile: (file?: LocalFile) => void; onAfterRun: () => void }) {
  const [items, setItems] = useState<ConsoleItem[]>([]);
  const [status, setStatus] = useState<string>();
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = window.maxDesktop.onAgentEvent((event: AgentStreamEvent) => {
      setItems((prev) => reduceEvent(prev, event));
      if (event.type === 'status') setStatus(event.text);
      if (event.type === 'done' || event.type === 'error') { setRunning(false); setStatus(undefined); }
    });
    return unsubscribe;
  }, []);

  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [items, status]);

  const send = async (value: string) => {
    const message = value.trim();
    if (!message || running) return;
    setText('');
    setItems((prev) => [...prev, { kind: 'user', id: crypto.randomUUID(), text: message }]);
    setRunning(true); setStatus('Max sta pensando…');
    try { await window.maxDesktop.runAgent({ message, history: [], filePath: selected?.path }); }
    catch (error) { setItems((prev) => [...prev, { kind: 'assistant', id: crypto.randomUUID(), text: `⚠️ ${errorText(error)}` }]); setRunning(false); setStatus(undefined); }
    finally { onAfterRun(); }
  };

  const stop = () => { void window.maxDesktop.cancelAgent(); };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(text); };

  return <div className="console">
    <div className="console-stream" ref={streamRef}>
      {items.length === 0 && !running ? <div className="chat-welcome">
        <BrandMark size={64} />
        <span className="eyebrow">AGENTE AUTONOMO · MAX AI</span>
        <h2>Cosa faccio per te oggi?</h2>
        <p>Dammi un obiettivo. Leggo i file, eseguo comandi e creo cose in OnarSuite per portarlo a termine — da solo.</p>
        <div className="prompt-grid">{SUGGESTIONS.map((prompt) => <button key={prompt} onClick={() => void send(prompt)}>{prompt}<span>→</span></button>)}</div>
      </div> : items.map((item) => <ConsoleRow key={item.id} item={item} />)}
      {running && <div className="agent-indicator"><span className="dots"><i /><i /><i /></span>{status || 'Max sta lavorando…'}</div>}
    </div>
    <form className="composer" onSubmit={submit}>
      <div className="composer-meta">
        <div className="context-picker">
          <span>Contesto</span>
          <select value={selected?.path || ''} onChange={(event) => onSelectFile(files.find((file) => file.path === event.target.value))}>
            <option value="">Nessun documento</option>
            {files.map((file) => <option key={file.id} value={file.path}>{file.name}</option>)}
          </select>
        </div>
        <span className="autonomous-pill" title="Max agisce senza chiedere conferma; ogni azione è nell’audit log">● Modalità autonoma</span>
      </div>
      <div className="composer-row">
        <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }} placeholder="Chiedi a Max di fare qualcosa…  (Invio per inviare · Shift+Invio per andare a capo)" rows={3} />
        {running ? <Button variant="danger" type="button" onClick={stop}>Ferma</Button> : <Button type="submit" disabled={!text.trim()}>Invia ↑</Button>}
      </div>
      <small>Max opera solo nelle cartelle autorizzate. Comandi shell e modifiche ai file sono registrati nell’audit log.</small>
    </form>
  </div>;
}

function ConsoleRow({ item }: { item: ConsoleItem }) {
  if (item.kind === 'tool') return <ToolCard tool={item.tool} title={item.title} command={item.command} status={item.status} preview={item.preview} isDiff={item.isDiff} />;
  if (item.kind === 'user') return <div className="msg user"><div className="msg-avatar">Tu</div><div className="msg-body"><p>{item.text}</p></div></div>;
  return <div className="msg assistant"><div className="msg-avatar">M</div><div className="msg-body"><Markdown content={item.text} /></div></div>;
}

function reduceEvent(prev: ConsoleItem[], event: AgentStreamEvent): ConsoleItem[] {
  switch (event.type) {
    case 'assistant':
      return [...prev, { kind: 'assistant', id: crypto.randomUUID(), text: event.text }];
    case 'tool_start':
      return [...prev, { kind: 'tool', id: event.id, tool: event.tool, title: event.title, command: event.command, status: 'running' }];
    case 'tool_end':
      return prev.map((item) => item.kind === 'tool' && item.id === event.id
        ? { ...item, status: event.ok ? 'done' : 'error', preview: event.preview, isDiff: event.isDiff }
        : item);
    case 'error':
      return [...prev, { kind: 'assistant', id: crypto.randomUUID(), text: `⚠️ ${event.message}` }];
    default:
      return prev;
  }
}

type Notice = { tone: 'success' | 'error' | 'warning'; text: string };
type Field = { key: string; label: string; type?: 'text' | 'email' | 'date' | 'number' | 'textarea'; required?: boolean; placeholder?: string };
type ModuleDef = {
  id: string; label: string; icon: string; hint: string;
  listAction?: string; listKey?: string;
  columns: Array<{ key: string; label: string; kind?: 'amount' }>;
  createAction?: string; createLabel?: string; fields?: Field[];
  rowActions?: Array<{ label: string; action: string }>;
};

const MODULES: ModuleDef[] = [
  { id: 'reminders', label: 'Promemoria', icon: '◷', hint: 'Scadenze e attività',
    listAction: 'list_reminders', listKey: 'reminders',
    columns: [{ key: 'title', label: 'Titolo' }, { key: 'date', label: 'Scadenza' }, { key: 'priority', label: 'Priorità' }],
    createAction: 'create_reminder', createLabel: 'Nuovo promemoria',
    fields: [{ key: 'title', label: 'Titolo', required: true }, { key: 'date', label: 'Scadenza', type: 'date' }, { key: 'priority', label: 'Priorità', placeholder: 'low · medium · high' }, { key: 'description', label: 'Note', type: 'textarea' }],
    rowActions: [{ label: '✓ Completa', action: 'complete_reminder' }] },
  { id: 'leads', label: 'Clienti', icon: '◉', hint: 'CRM e contatti',
    listAction: 'list_leads', listKey: 'leads',
    columns: [{ key: 'name', label: 'Nome' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Telefono' }],
    createAction: 'create_customer', createLabel: 'Nuovo cliente',
    fields: [{ key: 'name', label: 'Nome', required: true }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Telefono' }, { key: 'notes', label: 'Note', type: 'textarea' }] },
  { id: 'contracts', label: 'Contratti', icon: '▤', hint: 'Contratti e bozze',
    listAction: 'contract_list', listKey: 'contracts',
    columns: [{ key: 'title', label: 'Titolo' }, { key: 'client', label: 'Cliente' }, { key: 'status', label: 'Stato' }, { key: 'amount', label: 'Importo', kind: 'amount' }],
    createAction: 'create_contract', createLabel: 'Nuovo contratto',
    fields: [{ key: 'title', label: 'Titolo', required: true }, { key: 'description', label: 'Descrizione', type: 'textarea' }, { key: 'amount', label: 'Importo (EUR)', type: 'number' }] },
  { id: 'users', label: 'Utenti', icon: '◍', hint: 'Team e accessi',
    listAction: 'list_users', listKey: 'users',
    columns: [{ key: 'name', label: 'Nome' }, { key: 'email', label: 'Email' }, { key: 'type', label: 'Ruolo' }],
    createAction: 'create_user', createLabel: 'Nuovo utente',
    fields: [{ key: 'name', label: 'Nome', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'role_id', label: 'ID ruolo', type: 'number', placeholder: 'es. 126 = Cliente' }, { key: 'mobile_no', label: 'Telefono' }] },
];

const COMING: Array<{ label: string; icon: string; hint: string }> = [
  { label: 'Calendario', icon: '▥', hint: 'Eventi e appuntamenti' },
  { label: 'Prodotti', icon: '▦', hint: 'Catalogo e magazzino' },
  { label: 'Preventivi', icon: '▣', hint: 'Offerte commerciali' },
  { label: 'Fatture', icon: '€', hint: 'Fatturazione' },
  { label: 'Email', icon: '✉', hint: 'Posta Max AI' },
  { label: 'Ticket', icon: '◫', hint: 'Assistenza' },
];

function OnarHome({ onNotice, onOpenExternal }: { onNotice: (n: Notice) => void; onOpenExternal: () => void }) {
  const [moduleId, setModuleId] = useState<string>();
  const def = MODULES.find((m) => m.id === moduleId);
  if (def) return <ModuleScreen def={def} onBack={() => setModuleId(undefined)} onNotice={onNotice} />;
  return <div className="onar-home">
    <Card className="onar-banner"><div><span className="eyebrow">GESTIONALE NATIVO</span><h2>Gestisci OnarSuite dall’app</h2><p>Moduli nativi collegati al tuo OnarSuite. Apri un modulo per vedere i dati reali e crearne di nuovi.</p></div><Button variant="secondary" onClick={onOpenExternal}>Apri OnarSuite web ↗</Button></Card>
    <div className="module-grid">
      {MODULES.map((m) => <button key={m.id} className="module-card" onClick={() => setModuleId(m.id)}><span className="module-icon">{m.icon}</span><strong>{m.label}</strong><small>{m.hint}</small></button>)}
      {COMING.map((m) => <div key={m.label} className="module-card disabled"><span className="module-icon">{m.icon}</span><strong>{m.label}</strong><small>{m.hint}</small><span className="soon">in arrivo</span></div>)}
    </div>
  </div>;
}

function ModuleScreen({ def, onBack, onNotice }: { def: ModuleDef; onBack: () => void; onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!def.listAction) { setLoading(false); return; }
    setLoading(true);
    const res = await window.maxDesktop.onar(def.listAction, {});
    if (res.success) {
      const payload = res.data as Record<string, unknown> | undefined;
      setRows((payload?.[def.listKey ?? ''] as Array<Record<string, unknown>>) ?? []);
    } else { onNotice({ tone: 'error', text: res.message }); setRows([]); }
    setLoading(false);
  }, [def, onNotice]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!def.createAction) return;
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const f of def.fields ?? []) {
      const v = (form[f.key] ?? '').trim();
      if (v) payload[f.key] = f.type === 'number' ? Number(v) : v;
    }
    const res = await window.maxDesktop.onar(def.createAction, payload);
    setBusy(false);
    if (res.success) { onNotice({ tone: 'success', text: res.message }); setShowForm(false); setForm({}); void load(); }
    else onNotice({ tone: 'error', text: res.message });
  };

  const runRowAction = async (action: string, row: Record<string, unknown>) => {
    setBusy(true);
    const res = await window.maxDesktop.onar(action, { id: row.id });
    setBusy(false);
    onNotice({ tone: res.success ? 'success' : 'error', text: res.message });
    if (res.success) void load();
  };

  const gridCols = { gridTemplateColumns: [...def.columns.map(() => 'minmax(0, 1fr)'), ...(def.rowActions ? ['150px'] : [])].join(' ') };

  return <Card className="module-screen" eyebrow={def.hint} title={def.label}
    action={<div className="module-actions"><Button variant="ghost" onClick={onBack}>← Moduli</Button>{def.createAction && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Annulla' : (def.createLabel ?? 'Nuovo')}</Button>}</div>}>
    {showForm && def.fields && <form className="module-form" onSubmit={submit}>
      {def.fields.map((f) => <label key={f.key}>{f.label}{f.required && ' *'}
        {f.type === 'textarea'
          ? <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={3} placeholder={f.placeholder} />
          : <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required} placeholder={f.placeholder} />}
      </label>)}
      <Button disabled={busy}>{busy ? 'Salvataggio…' : 'Salva su OnarSuite'}</Button>
    </form>}
    {!showForm && (loading
      ? <p className="muted-line">Carico i dati da OnarSuite…</p>
      : rows.length === 0
        ? <EmptyState icon={def.icon} title="Nessun dato">{def.createAction ? 'Crea il primo elemento con il pulsante in alto.' : 'Niente da mostrare.'}</EmptyState>
        : <div className="data-table">
            <div className="data-row head" style={gridCols}>{def.columns.map((c) => <span key={c.key}>{c.label}</span>)}{def.rowActions && <span />}</div>
            {rows.map((row, i) => <div className="data-row" key={String(row.id ?? i)} style={gridCols}>
              {def.columns.map((c) => <span key={c.key} title={fmtCell(row[c.key], c.kind, row)}>{fmtCell(row[c.key], c.kind, row)}</span>)}
              {def.rowActions && <span className="row-actions">{def.rowActions.map((a) => <button key={a.action} disabled={busy} onClick={() => void runRowAction(a.action, row)}>{a.label}</button>)}</span>}
            </div>)}
          </div>)}
  </Card>;
}

function fmtCell(value: unknown, kind: string | undefined, row: Record<string, unknown>): string {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'amount') { const cur = (row.currency as string) || 'EUR'; return `${Number(value).toLocaleString('it-IT')} ${cur}`; }
  return String(value);
}

function ExplorerView({ onNotice }: { onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [stack, setStack] = useState<string[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [openPath, setOpenPath] = useState<string>();
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = stack[stack.length - 1];

  const load = useCallback(async (dir?: string) => {
    setBusy(true);
    try { setEntries(await window.maxDesktop.explore(dir)); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  }, [onNotice]);

  useEffect(() => { void load(current); }, [load, current]);

  const openEntry = async (entry: FsEntry) => {
    if (entry.kind === 'dir') { setStack((s) => [...s, entry.path]); return; }
    setBusy(true);
    try {
      const file = await window.maxDesktop.readFileText(entry.path);
      setOpenPath(entry.path); setContent(file.text); setTruncated(file.truncated); setDirty(false);
    } catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!openPath) return;
    try { await window.maxDesktop.writeFileText(openPath, content); setDirty(false); onNotice({ tone: 'success', text: 'File salvato.' }); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
  };

  return <div className="explorer">
    <Card className="explorer-tree" title="File" eyebrow={current ? shortPath(current) : 'CARTELLE AUTORIZZATE'} action={stack.length > 0 ? <Button variant="ghost" onClick={() => { setStack((s) => s.slice(0, -1)); }}>↑ Su</Button> : undefined}>
      <div className="entry-list">
        {busy && entries.length === 0 && <p className="muted-line">Carico…</p>}
        {entries.map((entry) => <button key={entry.path} className={`entry ${openPath === entry.path ? 'selected' : ''}`} onClick={() => void openEntry(entry)}>
          <span className="entry-icon">{entry.kind === 'dir' ? '▸' : iconFor(entry.extension)}</span>
          <span className="entry-name">{entry.name}</span>
          {entry.kind === 'file' && entry.size !== undefined && <time>{formatBytes(entry.size)}</time>}
        </button>)}
        {!busy && entries.length === 0 && <EmptyState icon="▱" title="Cartella vuota">Nessun file qui.</EmptyState>}
      </div>
    </Card>
    <Card className="editor" eyebrow={truncated ? 'ANTEPRIMA (TRONCATA)' : 'EDITOR'} title={openPath ? shortPath(openPath) : 'Nessun file aperto'} action={openPath ? <Button disabled={!dirty} onClick={() => void save()}>{dirty ? 'Salva' : 'Salvato'}</Button> : undefined}>
      {openPath ? <textarea className="code-editor" value={content} spellCheck={false} onChange={(event) => { setContent(event.target.value); setDirty(true); }} /> : <EmptyState icon="←" title="Apri un file">Naviga e seleziona un file per leggerlo o modificarlo.</EmptyState>}
    </Card>
  </div>;
}

function Dashboard({ snapshot, files, logs, onGoAgent, onSync }: { snapshot: AppSnapshot; files: LocalFile[]; logs: AuditEntry[]; onGoAgent: () => void; onSync: () => void }) { return <div className="page-grid"><Card className="hero-card"><div className="hero-copy"><span className="eyebrow">DIPENDENTE DIGITALE</span><h2>{snapshot.connection === 'connected' ? 'Max è pronto a lavorare.' : 'Max è offline.'}</h2><p>Dai a Max un obiettivo: legge i file, esegue comandi e crea cose in OnarSuite, in autonomia e con audit completo.</p><div className="hero-actions"><Button onClick={onGoAgent}>Apri l’agente</Button><Button variant="secondary" onClick={onSync}>Controlla connessione</Button></div></div><div className="orb"><BrandMark size={84} /><StatusPill state={snapshot.connection} /></div></Card><div className="stats-grid"><Stat label="Documenti visibili" value={String(files.length)} detail="Workspace e cartelle autorizzate" /><Stat label="Cartelle autorizzate" value={String(snapshot.authorizedFolders.length)} detail="Ambito operativo di Max" /><Stat label="Ultimo sync" value={snapshot.lastSyncAt ? formatDate(snapshot.lastSyncAt) : 'Mai'} detail={`Versione ${snapshot.appVersion}`} /></div><Card title="Attività recenti">{logs.length ? <div className="activity-list">{logs.slice(0, 6).map((log) => <div key={log.id}><span className={`log-dot ${log.level}`} /><div><strong>{log.message}</strong><small>{formatDate(log.createdAt)} · {log.eventType}</small></div></div>)}</div> : <EmptyState icon="◎" title="Nessuna attività">Le azioni di Max appariranno qui.</EmptyState>}</Card></div>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></Card>; }

function FoldersView({ snapshot, busy, onAdd, onRemove, onDrop, onChoose }: { snapshot: AppSnapshot; busy: boolean; onAdd: () => void; onRemove: (folder: string) => void; onDrop: (event: DragEvent) => void; onChoose: () => void }) { return <div className="page-grid"><Card title="Ambito operativo di Max" action={<Button disabled={busy} onClick={onAdd}>Aggiungi cartella</Button>}><div className="permission-banner"><strong>Max lavora solo nelle cartelle qui sotto.</strong><span>Dentro l’allowlist può leggere, scrivere, modificare ed eseguire comandi. Fuori, è bloccato.</span></div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><span>＋</span><div><strong>Trascina qui i documenti</strong><small>per copiarli nella OnarSuite Workspace</small></div><Button variant="secondary" onClick={onChoose}>Scegli file</Button></div><div className="folder-list"><div><span className="folder-icon">▰</span><div><strong>OnarSuite Workspace</strong><small>{snapshot.workspacePath}</small></div><span className="fixed-badge">Sempre attiva</span></div>{snapshot.authorizedFolders.map((folder) => <div key={folder}><span className="folder-icon">▰</span><div><strong>{folder.split(/[\\/]/).pop()}</strong><small>{folder}</small></div><Button variant="ghost" onClick={() => onRemove(folder)}>Rimuovi</Button></div>)}</div></Card><Card title="Permessi"><div className="scope-columns"><div><strong>Consentiti (in autonomia)</strong>{MVP_SCOPES.map((scope) => <span key={scope} className="scope allowed">✓ {scope}</span>)}</div><div><strong>Sempre bloccati</strong>{BLOCKED_SCOPES.map((scope) => <span key={scope} className="scope blocked">× {scope}</span>)}</div></div></Card></div>; }

function LogsView({ logs }: { logs: AuditEntry[] }) { return <Card title="Registro attività" eyebrow="AUDIT LOCALE"><div className="log-table"><div className="log-row head"><span>Data</span><span>Evento</span><span>Livello</span><span>Messaggio</span></div>{logs.map((log) => <div className="log-row" key={log.id}><span>{formatDate(log.createdAt)}</span><code>{log.eventType}</code><span><i className={`log-dot ${log.level}`} />{log.level}</span><strong>{log.message}</strong></div>)}</div>{!logs.length && <EmptyState icon="≡" title="Registro vuoto">Le azioni e gli errori compariranno qui.</EmptyState>}</Card>; }

function SettingsView({ snapshot, busy, onDisconnect, onClear }: { snapshot: AppSnapshot; busy: boolean; onDisconnect: () => void; onClear: () => void }) { return <div className="page-grid settings-grid"><Card title="Dispositivo"><dl><dt>Nome</dt><dd>{snapshot.deviceName}</dd><dt>ID dispositivo</dt><dd>{snapshot.deviceId}</dd><dt>Server</dt><dd>{snapshot.serverUrl}</dd><dt>Versione</dt><dd>{snapshot.appVersion}</dd><dt>Token locale</dt><dd>{snapshot.encryptionAvailable ? 'Cifrato con il sistema operativo' : 'Non persistito'}</dd></dl><Button variant="danger" disabled={busy} onClick={onDisconnect}>Disconnetti dispositivo</Button></Card><Card title="Privacy e dati locali"><p>Puoi cancellare configurazione, token, coda offline e audit locale. I documenti nelle cartelle autorizzate non vengono eliminati automaticamente.</p><Button variant="secondary" disabled={busy} onClick={onClear}>Cancella dati locali</Button></Card></div>; }

const viewTitles: Record<View, string> = { onarsuite: 'OnarSuite', agent: 'Agente Max', explorer: 'Esplora file', dashboard: 'Panoramica', folders: 'Cartelle autorizzate', logs: 'Attività', settings: 'Impostazioni' };
function iconFor(ext?: string) { if (!ext) return '▢'; if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return '▤'; if (['xlsx', 'csv'].includes(ext)) return '▦'; if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return '▣'; return '◇'; }
function shortPath(value: string) { const parts = value.split(/[\\/]/); return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : value; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function errorText(error: unknown) { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Errore imprevisto.'; }
