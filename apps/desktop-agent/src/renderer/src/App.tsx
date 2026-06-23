import { createElement, useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { AgentStreamEvent, AppSnapshot, AuditEntry, ConsoleItem, ConversationMeta, FsEntry, LocalFile, PairingInput, PanelData, UpdateState } from '../../shared/types';
import { APP_VERSION, BLOCKED_SCOPES, MVP_SCOPES } from '../../shared/types';
import { AppLogo, BrandMark, Button, Card, EmptyState, Markdown, StatusPill, ToolCard } from './components';

type View = 'onarsuite' | 'clients' | 'agent' | 'explorer' | 'dashboard' | 'folders' | 'logs' | 'settings';
type Theme = 'light' | 'dark';

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
  { id: 'agent', label: 'Chat Max', icon: '◆' },
  { id: 'explorer', label: 'File locali', icon: '▤' },
  { id: 'folders', label: 'Cartelle autorizzate', icon: '▱' },
  { id: 'logs', label: 'Attività', icon: '≡' },
];

// Secondary "tools" - OnarSuite modules Max can also open, kept below the chat.
const toolItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'onarsuite', label: 'Moduli OnarSuite', icon: '◎' },
  { id: 'clients', label: 'Clienti', icon: '◈' },
];

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [startupError, setStartupError] = useState<string>();
  const [view, setView] = useState<View>('agent');
  const [chatKey, setChatKey] = useState(0);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConv, setActiveConv] = useState<{ id: string; items: ConsoleItem[] }>();
  const [convSearch, setConvSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string>();
  const [renameText, setRenameText] = useState('');

  const startRename = useCallback((id: string, title: string) => { setRenamingId(id); setRenameText(title); }, []);
  const commitRename = useCallback(async () => {
    const id = renamingId;
    const title = renameText.trim();
    setRenamingId(undefined);
    if (id && title) setConversations(await window.maxDesktop.renameConversation(id, title));
  }, [renamingId, renameText]);

  const loadConversations = useCallback(async () => {
    setConversations(await window.maxDesktop.listConversations().catch(() => []));
  }, []);

  const newChat = useCallback(async () => {
    const conv = await window.maxDesktop.newConversation();
    setActiveConv({ id: conv.id, items: [] });
    setChatKey((k) => k + 1);
    setView('agent');
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const conv = await window.maxDesktop.getConversation(id);
    if (!conv) return;
    await window.maxDesktop.selectConversation(id);
    setActiveConv({ id: conv.id, items: conv.items });
    setChatKey((k) => k + 1);
    setView('agent');
  }, []);

  const persistConversation = useCallback(async (id: string, items: ConsoleItem[]) => {
    setConversations(await window.maxDesktop.saveConversation({ id, items }));
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    setConversations(await window.maxDesktop.deleteConversation(id));
    if (activeConv?.id === id) await newChat();
  }, [activeConv, newChat]);

  const titleConversation = useCallback(async (id: string) => {
    setConversations(await window.maxDesktop.titleConversation(id).catch(() => []));
  }, []);

  const [lockMode, setLockMode] = useState<'closed' | 'preview' | 'web'>('closed');
  const [lockPanel, setLockPanel] = useState<PanelData>();
  const [lockWidth, setLockWidth] = useState(() => Number(localStorage.getItem('max-lock-w')) || 400);

  useEffect(() => { localStorage.setItem('max-lock-w', String(lockWidth)); }, [lockWidth]);

  const showPanel = useCallback((p: PanelData) => { setLockPanel(p); setLockMode('preview'); }, []);

  const startLockResize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    const onMove = (e: globalThis.MouseEvent) => setLockWidth(Math.min(900, Math.max(320, window.innerWidth - e.clientX)));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.removeProperty('cursor'); document.body.style.removeProperty('user-select'); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [attachments, setAttachments] = useState<LocalFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle', currentVersion: APP_VERSION });
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
    if (!window.maxDesktop) throw new Error('Il collegamento sicuro con Max Desktop non è disponibile. Riavvia l\'app.');
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
  useEffect(() => {
    void (async () => {
      await loadConversations();
      const conv = await window.maxDesktop.newConversation().catch(() => undefined);
      if (conv) setActiveConv({ id: conv.id, items: [] });
    })();
  }, [loadConversations]);
  useEffect(() => {
    let active = true;
    void window.maxDesktop.getUpdateState()
      .then((state) => { if (active) setUpdateState(state); })
      .catch(() => undefined);
    void window.maxDesktop.checkForUpdates().catch(() => undefined);
    const unsubscribe = window.maxDesktop.onUpdateStateChanged((state) => setUpdateState(state));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (updateState.status !== 'checking' && updateState.status !== 'downloading') setUpdateBusy(false);
  }, [updateState.status]);

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

  const handleUpdateAction = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    setNotice(undefined);
    try {
      if (updateState.status === 'downloaded') await window.maxDesktop.installUpdate();
      else if (updateState.status === 'available' || (updateState.status === 'error' && updateState.availableVersion)) await window.maxDesktop.downloadUpdate();
      else await window.maxDesktop.checkForUpdates();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setUpdateBusy(false);
    }
  };

  if (!snapshot) return <StartupScreen error={startupError} onRetry={() => void refresh().catch((error) => setStartupError(errorText(error)))} />;
  if (snapshot.connection === 'not_paired') return <PairingPage snapshot={snapshot} busy={busy} notice={notice} onPair={(input) => run(() => window.maxDesktop.pair(input))} />;

  return <div className="app-shell" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)${lockMode !== 'closed' ? ` ${lockWidth}px` : ''}` }}>
    <aside className="sidebar">
      <div className="brand"><AppLogo theme={theme} planName={snapshot.planName} /></div>
      <button className="new-chat" onClick={() => void newChat()}><span>+</span>Nuova chat</button>
      <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="conv-section">
        <div className="conv-search"><input value={convSearch} onChange={(e) => setConvSearch(e.target.value)} placeholder="Cerca chat..." /></div>
        <div className="conv-list">
          {conversations.filter((c) => c.title.toLowerCase().includes(convSearch.toLowerCase())).map((c) => (
            <div key={c.id} className={`conv-item ${activeConv?.id === c.id ? 'active' : ''}`} onClick={() => { if (renamingId !== c.id) void openConversation(c.id); }} onDoubleClick={() => startRename(c.id, c.title)}>
              {renamingId === c.id
                ? <input className="conv-rename" autoFocus value={renameText} onClick={(e) => e.stopPropagation()} onChange={(e) => setRenameText(e.target.value)} onBlur={() => void commitRename()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename(); } if (e.key === 'Escape') setRenamingId(undefined); }} />
                : <>
                    <span className="conv-title">{c.title}</span>
                    <button className="conv-act" title="Rinomina" onClick={(e) => { e.stopPropagation(); startRename(c.id, c.title); }}>✎</button>
                    <button className="conv-del" title="Elimina" onClick={(e) => { e.stopPropagation(); void removeConversation(c.id); }}>×</button>
                  </>}
            </div>
          ))}
          {conversations.length === 0 && <p className="conv-empty">Le tue chat appariranno qui.</p>}
        </div>
      </div>
      <div className="nav-divider">Strumenti</div>
      <nav>{toolItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><span>⚙</span>Impostazioni</button>
      </nav>
      <div className="sidebar-status">
        <StatusPill state={snapshot.connection} />
        <small>{snapshot.accountLabel || snapshot.deviceName}</small>
        <span className="sidebar-version">v{APP_VERSION}</span>
      </div>
      <div className="sidebar-resizer" onMouseDown={startResize} title="Trascina per regolare la larghezza" />
    </aside>
    <main className={`main-content view-${view}`}>
      <header className="topbar">
        <div className="topbar-title">{viewTitles[view]}</div>
        <div className="topbar-actions">
          {snapshot.pendingActions > 0 && <span className="queue-count">{snapshot.pendingActions} in coda</span>}
          <button className={`topbar-icon ${lockMode === 'web' ? 'active' : ''}`} title="OnarSuite web" onClick={() => setLockMode((m) => m === 'web' ? 'closed' : 'web')}>◎</button>
          <button className="topbar-icon" title="Tema chiaro/scuro" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="topbar-icon" title="Sincronizza" disabled={busy} onClick={() => run(() => window.maxDesktop.syncNow(), 'Sincronizzazione completata.')}>⟳</button>
        </div>
      </header>
      <UpdateBanner state={updateState} busy={updateBusy} onAction={handleUpdateAction} />
      {notice && <div className={`notice notice-${notice.tone}`}><span>{notice.text}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
      {view === 'onarsuite' && <OnarHome onNotice={setNotice} onGoClients={() => setView('clients')} />}
      {view === 'clients' && <ClientsView />}
      {view === 'agent' && activeConv && <AgentConsole key={chatKey} convId={activeConv.id} initialItems={activeConv.items} onPersist={(items) => void persistConversation(activeConv.id, items)} onPanel={showPanel} onTitle={(id) => void titleConversation(id)} attachments={attachments} onAttachmentsChange={setAttachments} onAfterRun={() => void refresh()} accountLabel={snapshot.accountLabel} />}
      {view === 'explorer' && <ExplorerView onNotice={setNotice} />}
      {view === 'dashboard' && <Dashboard snapshot={snapshot} files={files} logs={logs} onGoAgent={() => setView('agent')} onSync={() => run(() => window.maxDesktop.syncNow())} />}
      {view === 'folders' && <FoldersView snapshot={snapshot} busy={busy} onAdd={() => run(() => window.maxDesktop.addAuthorizedFolder())} onRemove={(folder) => run(() => window.maxDesktop.removeAuthorizedFolder(folder))} onDrop={importDrop} onChoose={() => run(() => window.maxDesktop.chooseFiles(), 'File aggiunti alla workspace.')} />}
      {view === 'logs' && <LogsView logs={logs} />}
      {view === 'settings' && <SettingsView snapshot={snapshot} busy={busy} onDisconnect={() => run(() => window.maxDesktop.disconnect())} onClear={() => run(() => window.maxDesktop.clearLocalData())} />}
    </main>
    {lockMode !== 'closed' && <Lock mode={lockMode === 'web' ? 'web' : 'preview'} panel={lockPanel} serverUrl={snapshot.serverUrl} onMode={setLockMode} onClose={() => setLockMode('closed')} onResize={startLockResize} onNotice={setNotice} />}
  </div>;
}

function StartupScreen({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return <div className="splash"><BrandMark size={72} /><h2>{error ? 'OnarSuite non è riuscito ad avviarsi' : 'Avvio di OnarSuite…'}</h2>{error && <><p className="startup-error">{error}</p><Button onClick={onRetry}>Riprova</Button></>}</div>;
}

const ONAR_SERVER = 'https://onarsuite.com';

function PairingPage({ snapshot, busy, notice, onPair }: { snapshot: AppSnapshot; busy: boolean; notice?: { tone: string; text: string }; onPair: (input: PairingInput) => void }) {
  const [pairingCode, setPairingCode] = useState('');
  // Server is fixed; device name is generated in the background (never shown).
  const deviceName = snapshot.deviceName || 'OnarSuite Desktop';
  return <div className="pairing-page">
    <section className="pairing-copy">
      <BrandMark size={64} />
      <span className="eyebrow">ONARSUITE · AGENTE MAX</span>
      <h1>Il tuo dipendente digitale,<br />sul tuo computer.</h1>
      <p>Max lavora con i dati di OnarSuite e con i file locali che autorizzi.</p>
      <div className="trust-list">
        <span>✓ Accesso solo alle cartelle autorizzate</span>
        <span>✓ Token protetto dal sistema operativo</span>
        <span>✓ Ogni azione importante viene registrata</span>
      </div>
    </section>
    <Card className="pairing-card" title="Collega questo computer">
      {notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}
      <Button className="web-login-btn" onClick={() => void window.maxDesktop.webLogin(ONAR_SERVER, APP_VERSION)}>Accedi con OnarSuite →</Button>
      <small className="form-note">Si apre il browser per il login, poi torni qui in automatico.</small>
      <div className="auth-divider"><span>oppure usa un codice di pairing</span></div>
      <form onSubmit={(event) => { event.preventDefault(); onPair({ serverUrl: ONAR_SERVER, deviceName, pairingCode: pairingCode || undefined }); }}>
        <label>Codice pairing<input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="es. 7F3A9C" autoFocus /></label>
        <Button variant="secondary" disabled={busy || !pairingCode.trim()}>{busy ? 'Collegamento…' : 'Collega con codice'}</Button>
      </form>
    </Card>
  </div>;
}

const SUGGESTIONS = [
  'Crea un nuovo cliente',
  'Genera uno script Python che…',
  'Crea una pagina HTML di esempio',
  'Mostrami le attività di oggi',
];

function AgentConsole({ convId, initialItems, onPersist, onPanel, onTitle, attachments, onAttachmentsChange, onAfterRun, accountLabel }: { convId: string; initialItems: ConsoleItem[]; onPersist: (items: ConsoleItem[]) => void; onPanel: (panel: PanelData) => void; onTitle: (id: string) => void; attachments: LocalFile[]; onAttachmentsChange: (files: LocalFile[]) => void; onAfterRun: () => void; accountLabel?: string }) {
  const [items, setItems] = useState<ConsoleItem[]>(initialItems);
  const [status, setStatus] = useState<string>();
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const titledRef = useRef(initialItems.length > 0);

  useEffect(() => {
    const unsubscribe = window.maxDesktop.onAgentEvent((event: AgentStreamEvent) => {
      setItems((prev) => reduceEvent(prev, event));
      if (event.type === 'status') setStatus(event.text);
      if (event.type === 'panel') onPanel(event.panel);
      if (event.type === 'done' || event.type === 'error') { setRunning(false); setStatus(undefined); }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [items, status]);

  // Persist the transcript once a turn settles (history survives restarts).
  useEffect(() => {
    if (items.length > 0 && !running) {
      onPersist(items);
      if (!titledRef.current && items.some((i) => i.kind === 'assistant')) { titledRef.current = true; onTitle(convId); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, running, convId]);

  const send = async (value: string) => {
    const message = value.trim() || (attachments.length > 0 ? 'Esamina i file allegati.' : '');
    if (!message || running) return;
    const filePaths = attachments.map((file) => file.path);
    setText('');
    setItems((prev) => [...prev, { kind: 'user', id: crypto.randomUUID(), text: message || '[allegati]' }]);
    setRunning(true); setStatus('Max sta pensando…');
    onAttachmentsChange([]);
    try { await window.maxDesktop.runAgent({ message, history: [], filePaths }); }
    catch (error) { setItems((prev) => [...prev, { kind: 'assistant', id: crypto.randomUUID(), text: `⚠ ${errorText(error)}` }]); setRunning(false); setStatus(undefined); }
    finally { onAfterRun(); }
  };

  const stop = () => { void window.maxDesktop.cancelAgent(); };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(text); };

  const grow = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px`; };
  const appendAttachments = (files: LocalFile[]) => {
    if (!files.length) return;
    const byPath = new Map(attachments.map((file) => [file.path, file]));
    for (const file of files) byPath.set(file.path, file);
    onAttachmentsChange(Array.from(byPath.values()));
  };
  const attach = async () => {
    const picked = await window.maxDesktop.chooseFiles();
    appendAttachments(picked);
    onAfterRun();
  };

  const removeAttachment = (path: string) => onAttachmentsChange(attachments.filter((file) => file.path !== path));

  const handleDrop = async (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragActive(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.maxDesktop.getPathForFile(file))
      .filter(Boolean);
    if (!paths.length) return;
    appendAttachments(await window.maxDesktop.importDroppedFiles(paths));
    onAfterRun();
  };

  const empty = items.length === 0 && !running;

  const composer = <form className={`composer ${dragActive ? 'is-drag-active' : ''}`} onSubmit={submit}
    onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
    onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
    onDragLeave={() => setDragActive(false)}
    onDrop={handleDrop}>
    {attachments.length > 0 && <div className="composer-context composer-attachments">
      {attachments.map((file) => (
        <span key={file.path} className="composer-chip">
          <span className="composer-chip-name" title={file.name}>{file.name}</span>
          <button type="button" onClick={() => removeAttachment(file.path)} title={`Rimuovi ${file.name}`}>×</button>
        </span>
      ))}
      <button type="button" className="composer-clear" onClick={() => onAttachmentsChange([])} title="Rimuovi tutti">Pulisci</button>
    </div>}
    <textarea value={text} rows={1}
      onChange={(event) => { setText(event.target.value); grow(event.target); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }}
      placeholder="Scrivi a Max…" />
    <div className="composer-toolbar">
      <button type="button" className="composer-attach" onClick={() => void attach()} title="Allega uno o più file">+</button>
      <span className="composer-mode" title="Max agisce in autonomia; ogni azione è registrata">Autonomo</span>
      {running
        ? <button type="button" className="composer-send stop" onClick={stop} title="Ferma">■</button>
        : <button type="submit" className="composer-send" disabled={!text.trim() && attachments.length === 0} title="Invia">↑</button>}
    </div>
  </form>;

  return <div className={`console ${empty ? 'is-empty' : ''}`}>
    {empty
      ? <div className="console-hero">
          <BrandMark size={46} />
          <h2 className="greeting">{greeting(accountLabel)}</h2>
          {composer}
          <div className="prompt-pills">{SUGGESTIONS.map((prompt) => <button key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
        </div>
      : <>
          <div className="console-stream" ref={streamRef}>
            <div className="console-thread">
              {items.map((item) => <ConsoleRow key={item.id} item={item} />)}
              {running && <div className="agent-indicator"><span className="dots"><i /><i /><i /></span>{status || 'Max sta lavorando…'}</div>}
            </div>
          </div>
          {composer}
        </>}
  </div>;
}

type LockMode = 'preview' | 'web';

/** The right column ("lock"): structured preview / file editor, or the logged-in
 *  OnarSuite web app for actions only available on the web. Resizable. */
function Lock({ mode, panel, serverUrl, onMode, onClose, onResize, onNotice }: { mode: LockMode; panel?: PanelData; serverUrl: string; onMode: (mode: LockMode) => void; onClose: () => void; onResize: (event: ReactMouseEvent) => void; onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  return <aside className="lock">
    <div className="lock-resizer" onMouseDown={onResize} title="Trascina per ridimensionare" />
    <header className="lock-head">
      <div className="lock-tabs">
        <button className={mode === 'preview' ? 'active' : ''} disabled={!panel} onClick={() => onMode('preview')}>Anteprima</button>
        <button className={mode === 'web' ? 'active' : ''} onClick={() => onMode('web')}>OnarSuite web</button>
      </div>
      <button className="lock-close" onClick={onClose} title="Chiudi">×</button>
    </header>
    <div className="lock-body">
      {mode === 'web'
        ? <LockWeb serverUrl={serverUrl} />
        : panel ? <LockPreview panel={panel} onNotice={onNotice} /> : <div className="lock-empty">Nessuna anteprima. Chiedi a Max di leggere o creare qualcosa.</div>}
    </div>
  </aside>;
}

function LockPreview({ panel, onNotice }: { panel: PanelData; onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(panel.text ?? '');
  useEffect(() => { setText(panel.text ?? ''); setEditing(false); }, [panel]);

  const save = async () => {
    if (!panel.path) return;
    try { await window.maxDesktop.writeFileText(panel.path, text); onNotice({ tone: 'success', text: 'File salvato.' }); setEditing(false); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
  };

  return <div className="lock-preview">
    <span className="side-panel-kind">{PANEL_LABELS[panel.kind]}</span>
    <div className="side-panel-title"><strong>{panel.title}</strong>{panel.ok !== undefined && <span className={`pill ${panel.ok ? 'ok' : 'err'}`}>{panel.ok ? '✓' : '✗'}</span>}</div>
    {panel.subtitle && <p className="side-panel-sub">{panel.subtitle}</p>}
    {panel.fields && panel.fields.length > 0 && <dl className="side-panel-fields">{panel.fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
    {panel.columns && panel.rows && <div className="side-panel-table"><div className="data-row head" style={{ gridTemplateColumns: panel.columns.map(() => 'minmax(0,1fr)').join(' ') }}>{panel.columns.map((c) => <span key={c}>{c}</span>)}</div>{panel.rows.map((row, i) => <div className="data-row" key={i} style={{ gridTemplateColumns: panel.columns!.map(() => 'minmax(0,1fr)').join(' ') }}>{row.map((cell, j) => <span key={j} title={cell}>{cell}</span>)}</div>)}</div>}
    {panel.kind === 'file' && panel.path && <div className="side-panel-actions">
      <button onClick={() => void window.maxDesktop.openFile(panel.path!)}>Apri</button>
      <button onClick={() => void window.maxDesktop.revealFile(panel.path!)}>Mostra cartella</button>
      <button onClick={() => editing ? void save() : setEditing(true)}>{editing ? 'Salva' : 'Modifica'}</button>
      {editing && <button onClick={() => { setText(panel.text ?? ''); setEditing(false); }}>Annulla</button>}
    </div>}
    {panel.kind === 'file'
      ? (editing
          ? <textarea className="lock-editor" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
          : (panel.text ? <Markdown content={`\`\`\`${panel.lang ?? ''}\n${text}\n\`\`\``} /> : null))
      : (panel.text ? <p className="side-panel-text">{panel.text}</p> : null)}
  </div>;
}

function LockWeb({ serverUrl }: { serverUrl: string }) {
  const ref = useRef<{ goBack(): void; goForward(): void; reload(): void; loadURL(u: string): void; getURL(): string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Load a token-authenticated URL so OnarSuite opens already logged in.
  const [sessionUrl, setSessionUrl] = useState<string>();
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    void window.maxDesktop.webSessionUrl()
      .then((url) => {
        if (!alive) return;
        setSessionUrl(url);
        setSrc(url);
      })
      .catch(() => {
        if (!alive) return;
        setSessionUrl(serverUrl);
        setSrc(serverUrl);
      });
    return () => { alive = false; };
  }, [serverUrl]);
  useEffect(() => {
    const wv = ref.current as unknown as { addEventListener: (e: string, cb: () => void) => void; removeEventListener: (e: string, cb: () => void) => void } | null;
    if (!wv) return;
    const on = () => setLoading(true); const off = () => setLoading(false);
    wv.addEventListener('did-start-loading', on); wv.addEventListener('did-stop-loading', off);
    return () => { wv.removeEventListener('did-start-loading', on); wv.removeEventListener('did-stop-loading', off); };
  }, [src]);
  return <div className="lock-web">
    <div className="lock-web-bar">
      <button onClick={() => ref.current?.goBack()} title="Indietro">‹</button>
      <button onClick={() => ref.current?.goForward()} title="Avanti">›</button>
      <button onClick={() => ref.current?.reload()} title="Ricarica">⟳</button>
      <button disabled={!sessionUrl} onClick={() => sessionUrl && ref.current?.loadURL(sessionUrl)} title="Account OnarSuite">⌂</button>
      <span className="lock-web-status">{loading ? 'Caricamento…' : 'OnarSuite'}</span>
      <button onClick={() => { const u = ref.current?.getURL(); if (u) void window.maxDesktop.openExternal(u); }} title="Apri nel browser">↗</button>
    </div>
    {src && createElement('webview', { ref, className: 'lock-web-frame', src, partition: 'persist:onarsuite-web', allowpopups: 'true' } as Record<string, unknown>)}
  </div>;
}

const PANEL_LABELS: Record<PanelData['kind'], string> = { customer: 'Cliente', contract: 'Contratto', file: 'File', table: 'Tabella', result: 'Risultato' };

function greeting(name?: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const who = name ? `, ${name.split(' ')[0]}` : '';
  return `${part}${who}`;
}

function ConsoleRow({ item }: { item: ConsoleItem }) {
  if (item.kind === 'tool') return <div className="turn turn-tool"><ToolCard tool={item.tool} title={item.title} command={item.command} status={item.status} preview={item.preview} isDiff={item.isDiff} /></div>;
  if (item.kind === 'user') return <div className="turn turn-user"><div className="bubble">{item.text}</div></div>;
  return <div className="turn turn-assistant"><Markdown content={item.text} /></div>;
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
      return [...prev, { kind: 'assistant', id: crypto.randomUUID(), text: `⚠ ${event.message}` }];
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
  { id: 'reminders', label: 'Promemoria', icon: '◌', hint: 'Scadenze e attività',
    listAction: 'list_reminders', listKey: 'reminders',
    columns: [{ key: 'title', label: 'Titolo' }, { key: 'date', label: 'Scadenza' }, { key: 'priority', label: 'Priorità' }],
    createAction: 'create_reminder', createLabel: 'Nuovo promemoria',
    fields: [{ key: 'title', label: 'Titolo', required: true }, { key: 'date', label: 'Scadenza', type: 'date' }, { key: 'priority', label: 'Priorità', placeholder: 'low · medium · high' }, { key: 'description', label: 'Note', type: 'textarea' }],
    rowActions: [{ label: '✓ Completa', action: 'complete_reminder' }] },
  { id: 'leads', label: 'Clienti', icon: '◎', hint: 'CRM e contatti',
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

function OnarHome({ onNotice, onGoClients }: { onNotice: (n: Notice) => void; onGoClients: () => void }) {
  const [moduleId, setModuleId] = useState<string>();
  const def = MODULES.find((m) => m.id === moduleId);
  if (def) return <ModuleScreen def={def} onBack={() => setModuleId(undefined)} onNotice={onNotice} />;
  return <div className="onar-home">
    <Card className="onar-banner"><div><span className="eyebrow">GESTIONALE NATIVO</span><h2>OnarSuite Desktop è autonomo</h2><p>Qui lavoriamo solo con schermate native, dati reali e azioni verso il backend. Nessun salto al web: costruiamo i moduli dentro l'app.</p><div className="hero-actions"><Button onClick={onGoClients}>Apri Clienti</Button></div></div></Card>
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

function Dashboard({ snapshot, files, logs, onGoAgent, onSync }: { snapshot: AppSnapshot; files: LocalFile[]; logs: AuditEntry[]; onGoAgent: () => void; onSync: () => void }) { return <div className="page-grid"><Card className="hero-card"><div className="hero-copy"><span className="eyebrow">DIPENDENTE DIGITALE</span><h2>{snapshot.connection === 'connected' ? 'Max è pronto a lavorare.' : 'Max è offline.'}</h2><p>Dai a Max un obiettivo: legge i file, esegue comandi e crea cose in OnarSuite, in autonomia e con audit completo.</p><div className="hero-actions"><Button onClick={onGoAgent}>Apri l'agente</Button><Button variant="secondary" onClick={onSync}>Controlla connessione</Button></div></div><div className="orb"><BrandMark size={84} /><StatusPill state={snapshot.connection} /></div></Card><div className="stats-grid"><Stat label="Documenti visibili" value={String(files.length)} detail="Workspace e cartelle autorizzate" /><Stat label="Cartelle autorizzate" value={String(snapshot.authorizedFolders.length)} detail="Ambito operativo di Max" /><Stat label="Ultimo sync" value={snapshot.lastSyncAt ? formatDate(snapshot.lastSyncAt) : 'Mai'} detail={`Versione ${snapshot.appVersion}`} /></div><Card title="Attività recenti">{logs.length ? <div className="activity-list">{logs.slice(0, 6).map((log) => <div key={log.id}><span className={`log-dot ${log.level}`} /><div><strong>{log.message}</strong><small>{formatDate(log.createdAt)} · {log.eventType}</small></div></div>)}</div> : <EmptyState icon="◎" title="Nessuna attività">Le azioni di Max appariranno qui.</EmptyState>}</Card></div>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></Card>; }

function FoldersView({ snapshot, busy, onAdd, onRemove, onDrop, onChoose }: { snapshot: AppSnapshot; busy: boolean; onAdd: () => void; onRemove: (folder: string) => void; onDrop: (event: DragEvent) => void; onChoose: () => void }) { return <div className="page-grid"><Card title="Ambito operativo di Max" action={<Button disabled={busy} onClick={onAdd}>Aggiungi cartella</Button>}><div className="permission-banner"><strong>Max lavora solo nelle cartelle qui sotto.</strong><span>Dentro l'allowlist può leggere, scrivere, modificare ed eseguire comandi. Fuori, è bloccato.</span></div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><span>+</span><div><strong>Trascina qui i documenti</strong><small>per copiarli nella OnarSuite Workspace</small></div><Button variant="secondary" onClick={onChoose}>Scegli file</Button></div><div className="folder-list"><div><span className="folder-icon">▰</span><div><strong>OnarSuite Workspace</strong><small>{snapshot.workspacePath}</small></div><span className="fixed-badge">Sempre attiva</span></div>{snapshot.authorizedFolders.map((folder) => <div key={folder}><span className="folder-icon">▰</span><div><strong>{folder.split(/[\\/]/).pop()}</strong><small>{folder}</small></div><Button variant="ghost" onClick={() => onRemove(folder)}>Rimuovi</Button></div>)}</div></Card><Card title="Permessi"><div className="scope-columns"><div><strong>Consentiti (in autonomia)</strong>{MVP_SCOPES.map((scope) => <span key={scope} className="scope allowed">✓ {scope}</span>)}</div><div><strong>Sempre bloccati</strong>{BLOCKED_SCOPES.map((scope) => <span key={scope} className="scope blocked">× {scope}</span>)}</div></div></Card></div>; }

function LogsView({ logs }: { logs: AuditEntry[] }) { return <Card title="Registro attività" eyebrow="AUDIT LOCALE"><div className="log-table"><div className="log-row head"><span>Data</span><span>Evento</span><span>Livello</span><span>Messaggio</span></div>{logs.map((log) => <div className="log-row" key={log.id}><span>{formatDate(log.createdAt)}</span><code>{log.eventType}</code><span><i className={`log-dot ${log.level}`} />{log.level}</span><strong>{log.message}</strong></div>)}</div>{!logs.length && <EmptyState icon="≡" title="Registro vuoto">Le azioni e gli errori compariranno qui.</EmptyState>}</Card>; }

function SettingsView({ snapshot, busy, onDisconnect, onClear }: { snapshot: AppSnapshot; busy: boolean; onDisconnect: () => void; onClear: () => void }) { return <div className="page-grid settings-grid"><Card title="Dispositivo"><dl><dt>Nome</dt><dd>{snapshot.deviceName}</dd><dt>ID dispositivo</dt><dd>{snapshot.deviceId}</dd><dt>Server</dt><dd>{snapshot.serverUrl}</dd><dt>Versione</dt><dd>{snapshot.appVersion}</dd><dt>Token locale</dt><dd>{snapshot.encryptionAvailable ? 'Cifrato con il sistema operativo' : 'Non persistito'}</dd></dl><Button variant="danger" disabled={busy} onClick={onDisconnect}>Disconnetti dispositivo</Button></Card><Card title="Privacy e dati locali"><p>Puoi cancellare configurazione, token, coda offline e audit locale. I documenti nelle cartelle autorizzate non vengono eliminati automaticamente.</p><Button variant="secondary" disabled={busy} onClick={onClear}>Cancella dati locali</Button></Card></div>; }

function UpdateBanner({ state, busy, onAction }: { state: UpdateState; busy: boolean; onAction: () => void }) {
  if (state.status === 'disabled' || state.status === 'idle') return null;

  const percent = Math.max(0, Math.min(100, state.percent ?? 0));
  const title = state.status === 'available'
    ? `Nuova versione ${state.availableVersion ?? ''} disponibile`
    : state.status === 'downloading'
      ? `Scaricamento aggiornamento ${state.availableVersion ?? ''}`
      : state.status === 'downloaded'
        ? `Aggiornamento ${state.availableVersion ?? ''} pronto`
        : state.status === 'checking'
          ? 'Controllo aggiornamenti in corso'
          : 'Aggiornamento non riuscito';
  const message = state.status === 'available'
    ? "Scarica l'update e riavvia l'app quando sei pronto."
    : state.status === 'downloading'
      ? `Download in corso${state.totalBytes ? ` · ${percent}%` : ''}`
      : state.status === 'downloaded'
        ? 'Riavvia per installare la nuova release.'
        : state.error || 'Riprova il controllo degli aggiornamenti.';
  const buttonLabel = state.status === 'downloaded'
    ? 'Riavvia e installa'
    : state.status === 'downloading'
      ? 'Scaricamento...'
      : state.status === 'checking'
        ? 'Controllo...'
        : state.status === 'error'
          ? 'Riprova'
          : 'Scarica aggiornamento';

  return (
    <div className={`update-banner update-${state.status}`}>
      <div className="update-banner-copy">
        <span className="eyebrow">AGGIORNAMENTO DISPONIBILE</span>
        <strong>{title}</strong>
        <span>{message}</span>
        {state.status === 'downloading' && (
          <div className="update-progress" aria-hidden="true">
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <Button variant={state.status === 'downloaded' ? 'primary' : 'secondary'} disabled={busy || state.status === 'checking' || state.status === 'downloading'} onClick={onAction}>
        {buttonLabel}
      </Button>
    </div>
  );
}

function ClientsView() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [leads, setLeads] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', type: '' });
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, leadsRes] = await Promise.all([
      window.maxDesktop.onar('list_users', { limit: 30 }),
      window.maxDesktop.onar('list_leads', { limit: 30 }),
    ]);
    if (usersRes.success) setUsers(((usersRes.data as { users?: Array<Record<string, unknown>> } | undefined)?.users) ?? []);
    if (leadsRes.success) setLeads(((leadsRes.data as { leads?: Array<Record<string, unknown>> } | undefined)?.leads) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitUser = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const res = await window.maxDesktop.onar('create_user', {
      name: userForm.name,
      email: userForm.email || undefined,
      type: userForm.type || undefined,
    });
    setBusy(false);
    if (res.success) {
      setUserForm({ name: '', email: '', type: '' });
      void load();
    }
  };

  const submitLead = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const res = await window.maxDesktop.onar('create_customer', {
      name: leadForm.name,
      email: leadForm.email || undefined,
      phone: leadForm.phone || undefined,
      notes: leadForm.notes || undefined,
    });
    setBusy(false);
    if (res.success) {
      setLeadForm({ name: '', email: '', phone: '', notes: '' });
      void load();
    }
  };

  return (
    <div className="page-grid clients-grid">
      <Card
        title="Clienti"
        eyebrow="HUB NATIVO"
      >
        <p>Qui stiamo portando il cuore CRM di OnarSuite in una versione nativa: utenti interni e clienti/lead, senza uscire dall'app.</p>
      </Card>
      <div className="stats-grid">
        <Card><span className="stat-label">Utenti</span><strong className="stat-value">{users.length}</strong><small>Team e accessi</small></Card>
        <Card><span className="stat-label">Lead</span><strong className="stat-value">{leads.length}</strong><small>Clienti potenziali</small></Card>
        <Card><span className="stat-label">Stato</span><strong className="stat-value">Live</strong><small>Dal backend di OnarSuite</small></Card>
      </div>
      <div className="clients-columns">
        <Card title="Utenti">
          {loading ? <p className="muted-line">Carico utenti...</p> : (
            <div className="data-table compact">
              {users.map((user) => (
                <div key={String(user.id)} className="data-row">
                  <strong>{String(user.name ?? '—')}</strong>
                  <span>{String(user.email ?? '—')}</span>
                  <span>{String(user.type ?? '—')}</span>
                </div>
              ))}
              {!users.length && <EmptyState icon="◌" title="Nessun utente">Non ci sono utenti da mostrare.</EmptyState>}
            </div>
          )}
          <form className="module-form" onSubmit={submitUser}>
            <label>Nome<input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} required /></label>
            <label>Email<input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></label>
            <label>Ruolo / tipo<input value={userForm.type} onChange={(e) => setUserForm({ ...userForm, type: e.target.value })} /></label>
            <Button disabled={busy}>{busy ? 'Salvataggio...' : 'Crea utente'}</Button>
          </form>
        </Card>
        <Card title="Lead / anagrafiche">
          {loading ? <p className="muted-line">Carico clienti...</p> : (
            <div className="data-table compact">
              {leads.map((lead) => (
                <div key={String(lead.id)} className="data-row">
                  <strong>{String(lead.name ?? '—')}</strong>
                  <span>{String(lead.email ?? '—')}</span>
                  <span>{String(lead.phone ?? '—')}</span>
                </div>
              ))}
              {!leads.length && <EmptyState icon="◉" title="Nessun lead">Non ci sono lead da mostrare.</EmptyState>}
            </div>
          )}
          <form className="module-form" onSubmit={submitLead}>
            <label>Nome<input value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} required /></label>
            <label>Email<input value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} /></label>
            <label>Telefono<input value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} /></label>
            <label>Note<textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} rows={3} /></label>
            <Button disabled={busy}>{busy ? 'Salvataggio...' : 'Crea lead'}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

const viewTitles: Record<View, string> = { onarsuite: 'OnarSuite', clients: 'Clienti', agent: 'Agente Max', explorer: 'Esplora file', dashboard: 'Panoramica', folders: 'Cartelle autorizzate', logs: 'Attività', settings: 'Impostazioni' };
function iconFor(ext?: string) { if (!ext) return '▢'; if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return '▤'; if (['xlsx', 'csv'].includes(ext)) return '▦'; if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return '▣'; return '◇'; }
function shortPath(value: string) { const parts = value.split(/[\\/]/); return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : value; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function errorText(error: unknown) {
  if (!(error instanceof Error)) return 'Errore imprevisto.';
  let msg = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  // Never surface raw JSON / HTTP status to the user - extract the message field.
  const jsonStart = msg.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(msg.slice(jsonStart));
      msg = parsed.message || parsed.error || msg.slice(0, jsonStart).trim();
    } catch { msg = msg.slice(0, jsonStart).trim() || msg; }
  }
  msg = msg.replace(/^OnarSuite ha risposto \d+:\s*/, '').trim();
  return msg || 'Si è verificato un errore.';
}
