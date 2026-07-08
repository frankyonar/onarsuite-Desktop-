import { createElement, useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { AgentStreamEvent, AppSnapshot, AuditEntry, ChatMessage, ConsoleItem, ConversationMeta, FsEntry, LocalFile, PairingInput, PanelData, UpdateState } from '../../shared/types';
import { APP_VERSION, BLOCKED_SCOPES, MVP_SCOPES } from '../../shared/types';
import type { MemoryGraph, MemoryGraphNode, MemorySnapshotMeta } from '../../shared/types';
import type { ProviderDescriptor, WorkspaceSearchResult } from '../../shared/workspace';
import { AppLogo, BrandMark, Button, Card, EmptyState, Markdown, StatusPill, ToolCard } from './components';
import { ActionFormRenderer } from './MagicPanel';
import { getUpdatePresentation } from './update-ui';

type View = 'onarsuite' | 'clients' | 'agent' | 'explorer' | 'workspace' | 'graph' | 'dashboard' | 'folders' | 'logs' | 'settings';
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
  { id: 'workspace', label: 'Workspace', icon: '❖' },
  { id: 'graph', label: 'Grafo entità', icon: '⧉' },
  { id: 'explorer', label: 'File locali', icon: '▤' },
  { id: 'folders', label: 'Cartelle autorizzate', icon: '▱' },
  { id: 'logs', label: 'Attività', icon: '≡' },
];

// Secondary "tools" - OnarSuite modules Max can also open, kept below the chat.
const toolItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'onarsuite', label: 'Skills di Max', icon: '◎' },
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

  const [dockView, setDockView] = useState<DockView>(() => (localStorage.getItem('max-dock-view') as DockView) || 'closed');
  const [dockTab, setDockTab] = useState<DockTab>(() => (localStorage.getItem('max-dock-tab') as DockTab) || 'anteprima');
  const [lockWebPath, setLockWebPath] = useState<string>();
  const [outputs, setOutputs] = useState<PanelData[]>([]);
  const [selectedOutput, setSelectedOutput] = useState(0);
  const [actionMessages, setActionMessages] = useState<Array<{ conversationId: string; item: ConsoleItem }>>([]);
  const [winW, setWinW] = useState(() => window.innerWidth);
  const [lockWidth, setLockWidth] = useState(() => Number(localStorage.getItem('max-lock-w')) || 440);

  useEffect(() => { localStorage.setItem('max-lock-w', String(lockWidth)); }, [lockWidth]);
  useEffect(() => { localStorage.setItem('max-dock-view', dockView); }, [dockView]);
  useEffect(() => { localStorage.setItem('max-dock-tab', dockTab); }, [dockTab]);
  useEffect(() => { const on = () => setWinW(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);

  const showPanel = useCallback((p: PanelData) => {
    setOutputs((prev) => {
      const last = prev[prev.length - 1];
      const next = last && last.title === p.title && last.kind === p.kind ? prev.slice(0, -1).concat(p) : prev.concat(p);
      setSelectedOutput(next.length - 1);
      return next;
    });
    if (p.kind === 'form') setLockWidth((width) => Math.max(width, 420));
    setDockTab('output');
    setDockView((view) => (view === 'expanded' ? view : 'normal'));
  }, []);
  const recordActionCompletion = useCallback((message: string) => {
    if (!activeConv) return;
    setActionMessages((current) => current.concat({
      conversationId: activeConv.id,
      item: { kind: 'assistant', id: crypto.randomUUID(), text: message },
    }));
  }, [activeConv]);
  const openWebDock = useCallback((nextPath?: string) => {
    setLockWebPath(nextPath);
    setDockTab('anteprima');
    setDockView((v) => (v === 'closed' ? 'normal' : v));
  }, []);
  const openDockTab = useCallback((t: DockTab) => { setDockTab(t); setDockView((v) => (v === 'normal' || v === 'expanded' ? v : 'normal')); }, []);

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

  const dockW = dockView === 'closed' ? 0 : dockView === 'rail' ? 52 : dockView === 'expanded' ? Math.max(420, Math.min(Math.round(winW * 0.62), winW - sidebarWidth - 380)) : lockWidth;
  return <div className="app-shell" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)${dockView !== 'closed' ? ` ${dockW}px` : ''}` }}>
    <aside className="sidebar">
      <div className="brand"><AppLogo theme="dark" planName={snapshot.planName} /></div>
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
          <button className={`topbar-icon ${dockView !== 'closed' && dockTab === 'output' ? 'active' : ''}`} title="Magic Panel" aria-label="Magic Panel" onClick={() => {
            if (dockView !== 'closed' && dockTab === 'output') setDockView('closed');
            else openDockTab('output');
          }}>✦</button>
          <button className={`topbar-icon ${dockView !== 'closed' && dockTab === 'anteprima' ? 'active' : ''}`} title="OnarSuite web" onClick={() => {
            if (dockView !== 'closed' && dockTab === 'anteprima') { setDockView('closed'); }
            else { setLockWebPath(undefined); openWebDock(undefined); }
          }}>◎</button>
          <button className="topbar-icon" title="Tema chiaro/scuro" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="topbar-icon" title="Sincronizza" disabled={busy} onClick={() => run(() => window.maxDesktop.syncNow(), 'Sincronizzazione completata.')}>⟳</button>
        </div>
      </header>
      <UpdateBanner state={updateState} busy={updateBusy} onAction={handleUpdateAction} />
      {notice && <div className={`notice notice-${notice.tone}`}><span>{notice.text}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
      {view === 'onarsuite' && <OnarHome onNotice={setNotice} onGoClients={() => setView('clients')} />}
      {view === 'clients' && <ClientsView />}
      {view === 'agent' && activeConv && <AgentConsole key={chatKey} convId={activeConv.id} initialItems={activeConv.items} externalItems={actionMessages.filter((entry) => entry.conversationId === activeConv.id).map((entry) => entry.item)} onPersist={(items) => void persistConversation(activeConv.id, items)} onPanel={showPanel} onAssistantAction={(openUrl) => { const nextPath = openUrl ? new URL(openUrl).pathname + new URL(openUrl).search : undefined; openWebDock(nextPath); setNotice({ tone: 'success', text: 'Max ha preparato questa operazione nel pannello laterale.' }); }} onTitle={(id) => void titleConversation(id)} attachments={attachments} onAttachmentsChange={setAttachments} onAfterRun={() => void refresh()} accountLabel={snapshot.accountLabel} />}
      {view === 'explorer' && <ExplorerView onNotice={setNotice} />}
      {view === 'workspace' && <WorkspaceView onNotice={setNotice} />}
      {view === 'graph' && <GraphView onNotice={setNotice} />}
      {view === 'dashboard' && <Dashboard snapshot={snapshot} files={files} logs={logs} onGoAgent={() => setView('agent')} onSync={() => run(() => window.maxDesktop.syncNow())} />}
      {view === 'folders' && <FoldersView snapshot={snapshot} busy={busy} onAdd={() => run(() => window.maxDesktop.addAuthorizedFolder())} onRemove={(folder) => run(() => window.maxDesktop.removeAuthorizedFolder(folder))} onDrop={importDrop} onChoose={() => run(() => window.maxDesktop.chooseFiles(), 'File aggiunti alla workspace.')} />}
      {view === 'logs' && <LogsView logs={logs} />}
      {view === 'settings' && <SettingsView snapshot={snapshot} busy={busy} onDisconnect={() => run(() => window.maxDesktop.disconnect())} onClear={() => run(() => window.maxDesktop.clearLocalData())} />}
    </main>
    {dockView !== 'closed' && <WorkspaceDock view={dockView} tab={dockTab} snapshot={snapshot} files={files} logs={logs} serverUrl={snapshot.serverUrl} webPath={lockWebPath} outputs={outputs} selectedOutput={selectedOutput} onTab={openDockTab} onSelectOutput={setSelectedOutput} onRail={() => setDockView('rail')} onToggleExpand={() => setDockView((v) => (v === 'expanded' ? 'normal' : 'expanded'))} onClose={() => { setDockView('closed'); setLockWebPath(undefined); }} onResize={startLockResize} onAddFolder={() => run(() => window.maxDesktop.addAuthorizedFolder())} onRemoveFolder={(f) => run(() => window.maxDesktop.removeAuthorizedFolder(f))} onAnalyze={(f) => { setAttachments((a) => a.some((x) => x.path === f.path) ? a : a.concat(f)); setView('agent'); setNotice({ tone: 'success', text: `${f.name} pronto: scrivi a Max cosa farne.` }); }} onOpenLink={(url) => openWebDock(url)} onNotice={setNotice} onActionCompleted={recordActionCompletion} />}
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

function AgentConsole({ convId, initialItems, externalItems, onPersist, onPanel, onAssistantAction, onTitle, attachments, onAttachmentsChange, onAfterRun, accountLabel }: { convId: string; initialItems: ConsoleItem[]; externalItems: ConsoleItem[]; onPersist: (items: ConsoleItem[]) => void; onPanel: (panel: PanelData) => void; onAssistantAction: (openUrl: string) => void; onTitle: (id: string) => void; attachments: LocalFile[]; onAttachmentsChange: (files: LocalFile[]) => void; onAfterRun: () => void; accountLabel?: string }) {
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
      if (event.type === 'form') onPanel(event.panel);
      if (event.type === 'assistant_action') onAssistantAction(event.openUrl);
      if (event.type === 'done' || event.type === 'error') { setRunning(false); setStatus(undefined); }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [items, status]);

  useEffect(() => {
    setItems((current) => {
      const known = new Set(current.map((item) => item.id));
      const additions = externalItems.filter((item) => !known.has(item.id));
      return additions.length ? current.concat(additions) : current;
    });
  }, [externalItems]);

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
    const history: ChatMessage[] = items
      .filter((item): item is Extract<ConsoleItem, { kind: 'user' | 'assistant' }> => item.kind === 'user' || item.kind === 'assistant')
      .map((item) => ({ id: item.id, role: item.kind, content: item.text, createdAt: new Date().toISOString() }));
    try { await window.maxDesktop.runAgent({ message, history, filePaths, conversationId: convId }); }
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

  const composerDock = <div className="console-dock">{composer}</div>;

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
          {composerDock}
        </>}
  </div>;
}

type DockTab = 'anteprima' | 'contesto' | 'file' | 'attivita' | 'output';
type DockView = 'closed' | 'rail' | 'normal' | 'expanded';

const DOCK_TABS: Array<{ id: DockTab; label: string; icon: string }> = [
  { id: 'anteprima', label: 'Anteprima', icon: '◫' },
  { id: 'contesto', label: 'Contesto', icon: '◎' },
  { id: 'file', label: 'File', icon: '▤' },
  { id: 'attivita', label: 'Attività', icon: '≡' },
  { id: 'output', label: 'Output', icon: '◆' },
];
const OUT_ICONS: Record<PanelData['kind'], string> = { customer: '◉', contract: '▤', reminder: '⏰', file: '◇', table: '▦', result: '◆', form: '✦', confirmation: '✓', html: '◫', checklist: '☷' };

/** The right "Workspace Dock": a Codex-style multi-tab side panel (web preview,
 *  Max context, files, activity, generated outputs). Resizable / rail / expanded. */
function WorkspaceDock(props: {
  view: DockView; tab: DockTab; snapshot: AppSnapshot; files: LocalFile[]; logs: AuditEntry[];
  serverUrl: string; webPath?: string; outputs: PanelData[]; selectedOutput: number;
  onTab: (t: DockTab) => void; onSelectOutput: (i: number) => void;
  onRail: () => void; onToggleExpand: () => void; onClose: () => void; onResize: (e: ReactMouseEvent) => void;
  onAddFolder: () => void; onRemoveFolder: (f: string) => void; onAnalyze: (f: LocalFile) => void; onOpenLink: (url: string) => void; onNotice: (n: Notice) => void; onActionCompleted: (message: string) => void;
}) {
  const { view, tab, snapshot, files, logs, serverUrl, webPath, outputs, selectedOutput } = props;
  if (view === 'rail') {
    return <aside className="dock dock-rail">
      <button className="dock-rail-btn open" title="Apri Workspace" aria-label="Apri Workspace" onClick={() => props.onTab(tab)}>‹</button>
      {DOCK_TABS.map((t) => <button key={t.id} className={`dock-rail-btn ${tab === t.id ? 'active' : ''}`} title={t.label} aria-label={t.label} onClick={() => props.onTab(t.id)}>{t.icon}</button>)}
    </aside>;
  }
  const activeOutput = outputs[Math.min(selectedOutput, Math.max(0, outputs.length - 1))];
  const tabLabel = tab === 'output' && activeOutput ? activeOutput.title : DOCK_TABS.find((t) => t.id === tab)?.label ?? '';
  return <aside className="dock">
    <div className="dock-resizer" onMouseDown={props.onResize} title="Trascina per ridimensionare" />
    <header className="dock-head">
      <div className="dock-id"><strong>Magic Panel</strong><span>{tabLabel}</span></div>
      <DockStatus connection={snapshot.connection} />
      <div className="dock-tools">
        <button title="Espandi / riduci" aria-label="Espandi" onClick={props.onToggleExpand}>{view === 'expanded' ? '⤡' : '⤢'}</button>
        <button title="Riduci a barra" aria-label="Riduci a barra" onClick={props.onRail}>‒</button>
        <button title="Chiudi pannello" aria-label="Chiudi pannello" onClick={props.onClose}>×</button>
      </div>
    </header>
    <nav className="dock-tabs" role="tablist">
      {DOCK_TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => props.onTab(t.id)}><span>{t.icon}</span>{t.label}</button>)}
    </nav>
    <div className="dock-content">
      {tab === 'anteprima' && <LockWeb serverUrl={serverUrl} nextPath={webPath} onHome={() => undefined} />}
      {tab === 'contesto' && <DockContext snapshot={snapshot} files={files} />}
      {tab === 'file' && <DockFiles snapshot={snapshot} files={files} onAddFolder={props.onAddFolder} onRemoveFolder={props.onRemoveFolder} onAnalyze={props.onAnalyze} />}
      {tab === 'attivita' && <DockActivity logs={logs} />}
      {tab === 'output' && <DockOutput outputs={outputs} selected={selectedOutput} onSelect={props.onSelectOutput} permissions={snapshot.permissions} onNotice={props.onNotice} onOpenLink={props.onOpenLink} onActionCompleted={props.onActionCompleted} />}
    </div>
  </aside>;
}

function DockStatus({ connection }: { connection: AppSnapshot['connection'] }) {
  const map: Record<AppSnapshot['connection'], [string, string]> = { connected: ['Connesso', 'ok'], offline: ['Offline', 'warn'], error: ['Errore', 'err'], revoked: ['Revocato', 'err'], not_paired: ['Non collegato', 'warn'] };
  const [label, tone] = map[connection] ?? ['—', 'warn'];
  return <span className={`dock-status ${tone}`} aria-label={`Stato: ${label}`}><i />{label}</span>;
}

function DockContext({ snapshot, files }: { snapshot: AppSnapshot; files: LocalFile[] }) {
  return <div className="dock-pane">
    <section className="dock-block">
      <h4>Workspace attivo</h4>
      <p className="dock-strong">{snapshot.accountLabel || snapshot.deviceName}</p>
      <p className="dock-dim">{snapshot.deviceName}</p>
    </section>
    <section className="dock-block">
      <h4>Max può accedere a</h4>
      <ul className="dock-list">
        <li>File locali autorizzati ({snapshot.authorizedFolders.length + 1} cartelle)</li>
        <li>Moduli OnarSuite</li>
        <li>Anteprima web</li>
      </ul>
    </section>
    <section className="dock-block">
      <h4>Modalità Max</h4>
      <span className="dock-chip">Autonomo</span>
    </section>
    <section className="dock-block">
      <h4>Permessi attuali</h4>
      <div className="dock-perms">{snapshot.permissions.map((p) => <span key={p} className="dock-perm">{p}</span>)}</div>
    </section>
    <section className="dock-block">
      <h4>File visibili</h4>
      <p className="dock-dim">{files.length} documenti nelle cartelle autorizzate</p>
    </section>
  </div>;
}

function DockFiles({ snapshot, files, onAddFolder, onRemoveFolder, onAnalyze }: { snapshot: AppSnapshot; files: LocalFile[]; onAddFolder: () => void; onRemoveFolder: (f: string) => void; onAnalyze: (f: LocalFile) => void }) {
  const [q, setQ] = useState('');
  const recent = files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 14);
  return <div className="dock-pane">
    <div className="dock-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca file…" /></div>
    <section className="dock-block">
      <div className="dock-block-head"><h4>Cartelle autorizzate</h4><button className="dock-mini" onClick={onAddFolder}>+ Autorizza</button></div>
      <div className="dock-folders">
        <div className="dock-folder"><span className="dock-folder-name">OnarSuite Workspace</span><span className="dock-badge">sempre</span></div>
        {snapshot.authorizedFolders.map((f) => <div key={f} className="dock-folder"><span className="dock-folder-name" title={f}>{f.split(/[\\/]/).pop()}</span><button className="dock-mini ghost" onClick={() => onRemoveFolder(f)}>Rimuovi</button></div>)}
      </div>
    </section>
    <section className="dock-block">
      <h4>File recenti</h4>
      {recent.length === 0
        ? <EmptyState icon="▤" title="Nessun file">Autorizza una cartella o trascina file nella chat.</EmptyState>
        : <div className="dock-files">{recent.map((f) => <div key={f.path} className="dock-file"><span className="dock-file-name" title={f.name}>{f.name}</span><div className="dock-file-acts"><button className="dock-mini ghost" onClick={() => void window.maxDesktop.openFile(f.path)}>Apri</button><button className="dock-mini" onClick={() => onAnalyze(f)}>Analizza</button></div></div>)}</div>}
    </section>
  </div>;
}

function DockActivity({ logs }: { logs: AuditEntry[] }) {
  if (!logs.length) return <div className="dock-pane"><EmptyState icon="≡" title="Nessuna attività">Le azioni di Max appariranno qui in ordine cronologico.</EmptyState></div>;
  return <div className="dock-pane"><div className="dock-timeline">{logs.slice(0, 50).map((l) => <div key={l.id} className="dock-event"><span className={`dock-dot ${l.level}`} /><div className="dock-event-body"><strong>{l.message}</strong><small>{formatDate(l.createdAt)} · {l.eventType}</small></div></div>)}</div></div>;
}

function DockOutput({ outputs, selected, onSelect, permissions, onNotice, onOpenLink, onActionCompleted }: { outputs: PanelData[]; selected: number; onSelect: (i: number) => void; permissions: string[]; onNotice: (n: Notice) => void; onOpenLink: (url: string) => void; onActionCompleted: (message: string) => void }) {
  if (!outputs.length) return <div className="dock-pane"><EmptyState icon="◆" title="Nessun output generato">Quando Max crea preventivi, PDF, documenti o codice, appariranno qui.</EmptyState></div>;
  const current = outputs[Math.min(selected, outputs.length - 1)];
  return <div className="dock-output">
    <div className="dock-output-list">{outputs.map((o, i) => <button key={i} className={i === selected ? 'active' : ''} onClick={() => onSelect(i)}><span className="dock-out-icon">{OUT_ICONS[o.kind] ?? '◆'}</span><span className="dock-out-title" title={o.title}>{o.title}</span></button>)}</div>
    <div className="dock-output-view"><LockPreview panel={current} permissions={permissions} onNotice={onNotice} onOpenLink={onOpenLink} onActionCompleted={onActionCompleted} /></div>
  </div>;
}

function LockPreview({ panel, permissions, onNotice, onOpenLink, onActionCompleted }: { panel: PanelData; permissions: string[]; onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void; onOpenLink: (url: string) => void; onActionCompleted: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(panel.text ?? '');
  useEffect(() => { setText(panel.text ?? ''); setEditing(false); }, [panel]);

  const save = async () => {
    if (!panel.path) return;
    try { await window.maxDesktop.writeFileText(panel.path, text); onNotice({ tone: 'success', text: 'File salvato.' }); setEditing(false); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
  };

  return <div className={`lock-preview panel-${panel.kind}`}>
    {panel.kind !== 'form' && <span className="side-panel-kind">{PANEL_LABELS[panel.kind]}</span>}
    <div className="side-panel-title"><strong>{panel.title}</strong>{panel.ok !== undefined && <span className={`pill ${panel.ok ? 'ok' : 'err'}`}>{panel.ok ? '✓' : '✗'}</span>}</div>
    {panel.subtitle && <p className="side-panel-sub">{panel.subtitle}</p>}
    {panel.kind === 'form' && <ActionFormRenderer panel={panel} grantedPermissions={permissions} onNotice={onNotice} onCompleted={onActionCompleted} />}
    {panel.fields && panel.fields.length > 0 && <dl className="side-panel-fields">{panel.fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
    {panel.columns && panel.rows && <div className="side-panel-table"><div className="data-row head" style={{ gridTemplateColumns: panel.columns.map(() => 'minmax(0,1fr)').join(' ') }}>{panel.columns.map((c) => <span key={c}>{c}</span>)}</div>{panel.rows.map((row, i) => <div className="data-row" key={i} style={{ gridTemplateColumns: panel.columns!.map(() => 'minmax(0,1fr)').join(' ') }}>{row.map((cell, j) => <span key={j} title={cell}>{cell}</span>)}</div>)}</div>}
    {panel.links && panel.links.length > 0 && <div className="result-carousel" role="list">
      {panel.links.map((link) => (
        <button key={link.url} type="button" className="result-card" onClick={() => onOpenLink(link.url)} title={link.url}>
          <span className="result-card-domain">{link.source || hostFromUrl(link.url)}</span>
          <strong className="result-card-title">{link.title}</strong>
          {link.excerpt && <span className="result-card-excerpt">{link.excerpt}</span>}
          <span className="result-card-arrow">Apri nel dock →</span>
        </button>
      ))}
    </div>}
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

function LockWeb({ serverUrl, nextPath, onHome }: { serverUrl: string; nextPath?: string; onHome: () => void }) {
  const ref = useRef<{ goBack(): void; goForward(): void; reload(): void; loadURL(u: string): void; getURL(): string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Load a token-authenticated URL so OnarSuite opens already logged in.
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async () => {
      const target = nextPath?.trim();
      if (target && /^https?:\/\//i.test(target)) return target;
      return window.maxDesktop.webSessionUrl(target || undefined);
    };
    void load().then((url) => { if (alive) setSrc(url); }).catch(() => { if (alive) setSrc(serverUrl); });
    return () => { alive = false; };
  }, [nextPath, serverUrl]);
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
      <button onClick={() => { onHome(); void window.maxDesktop.webSessionUrl().then((url) => ref.current?.loadURL(url)); }} title="Account OnarSuite">⌂</button>
      <span className="lock-web-status">{loading ? 'Caricamento…' : 'OnarSuite'}</span>
      <button onClick={() => { const u = ref.current?.getURL(); if (u) void window.maxDesktop.openExternal(u); }} title="Apri nel browser">↗</button>
    </div>
    {src && createElement('webview', { ref, className: 'lock-web-frame', src, partition: 'persist:onarsuite-web', allowpopups: 'true' } as Record<string, unknown>)}
  </div>;
}

const PANEL_LABELS: Record<PanelData['kind'], string> = { customer: 'Cliente', contract: 'Contratto', reminder: 'Promemoria', file: 'File', table: 'Tabella', result: 'Risultato', form: 'Magic Form', confirmation: 'Conferma', html: 'HTML', checklist: 'Procedura' };

function hostFromUrl(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

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
    listAction: 'list_unified_contacts', listKey: 'contacts',
    columns: [{ key: 'display_name', label: 'Nome' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Telefono' }],
    createAction: 'create_unified_contact', createLabel: 'Nuovo cliente',
    fields: [{ key: 'name', label: 'Nome completo', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'phone', label: 'Telefono' }, { key: 'notes', label: 'Note', type: 'textarea' }] },
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
    <Card className="onar-banner"><div><span className="eyebrow">SKILLS DI MAX</span><h2>Max sceglie il formato più adatto.</h2><p>Chat, form nativi, file e pagine OnarSuite autenticate lavorano insieme nel Magic Panel. Parti dall’obiettivo: Max apre lo strumento giusto.</p><div className="hero-actions"><Button onClick={onGoClients}>Apri Clienti</Button></div></div></Card>
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
    if (def.createAction === 'create_unified_contact') payload.functions = ['customer'];
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

const PROVIDER_STATE_LABELS: Record<string, string> = {
  ready: 'Attivo', scanning: 'Scansione…', not_configured: 'Da configurare', not_connected: 'Non collegato', error: 'Errore',
};

function WorkspaceView({ onNotice }: { onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [selected, setSelected] = useState<{ id: string; provider: string }>();
  const [card, setCard] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const loadProviders = useCallback(async () => {
    try { setProviders(await window.maxDesktop.listWorkspaceProviders()); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
  }, [onNotice]);

  useEffect(() => { void loadProviders(); }, [loadProviders]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true); setSelected(undefined); setCard('');
    try {
      setResults(await window.maxDesktop.searchWorkspace(query, { limit: 20 }));
      setSearched(true);
    } catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const openCard = async (result: WorkspaceSearchResult) => {
    const { id, provider } = result.resource;
    setSelected({ id, provider });
    try { setCard(await window.maxDesktop.getWorkspaceCard(id, provider)); }
    catch (error) { setCard(''); onNotice({ tone: 'error', text: errorText(error) }); }
  };

  return <div className="explorer">
    <Card className="explorer-tree" title="Workspace" eyebrow="LIVELLO AI UNIFICATO" action={<Button variant="ghost" onClick={() => void loadProviders()}>↻</Button>}>
      <div className="ws-providers">
        {providers.map((p) => <div key={p.key} className="ws-provider">
          <span className={`log-dot ${p.status.state === 'ready' ? 'info' : p.status.state === 'error' ? 'error' : 'warning'}`} />
          <div><strong>{p.label}</strong><small>{p.source} · {PROVIDER_STATE_LABELS[p.status.state] ?? p.status.state}{p.status.resourceCount !== undefined ? ` · ${p.status.resourceCount} risorse` : ''}</small></div>
        </div>)}
        {!providers.length && <p className="muted-line">Carico provider…</p>}
      </div>
      <form className="ws-search" onSubmit={search}>
        <input value={query} placeholder="Cerca in tutto il Workspace…" onChange={(event) => setQuery(event.target.value)} />
        <Button disabled={busy || !query.trim()}>{busy ? '…' : 'Cerca'}</Button>
      </form>
      <div className="entry-list">
        {results.map((result) => <button key={`${result.resource.provider}:${result.resource.id}`} className={`entry ${selected?.id === result.resource.id ? 'selected' : ''}`} onClick={() => void openCard(result)}>
          <span className="entry-icon">{result.resource.source === 'local' ? '▤' : result.resource.source === 'cloud' ? '☁' : '🔌'}</span>
          <span className="entry-name">{result.resource.name}<small className="muted-line">{result.snippet ?? result.resource.virtualPath}</small></span>
          <time>{result.scores.final.toFixed(2)}</time>
        </button>)}
        {searched && !results.length && <EmptyState icon="❖" title="Nessun risultato">Prova un altro termine o avvia una scansione dalle cartelle autorizzate.</EmptyState>}
        {!searched && <p className="muted-line">Cerca per nome, contenuto, argomento o entità (email, importi, date…).</p>}
      </div>
    </Card>
    <Card className="editor" eyebrow="SCHEDA OSMEM" title={selected ? selected.id : 'Nessuna risorsa selezionata'}>
      {card ? <pre className="code-editor ws-card" style={{ whiteSpace: 'pre-wrap' }}>{card}</pre> : <EmptyState icon="←" title="Seleziona un risultato">La scheda di memoria (OSMEM) della risorsa apparirà qui.</EmptyState>}
    </Card>
  </div>;
}

const ENTITY_COLORS: Record<string, string> = {
  email: '#3b82f6', money: '#16a34a', date: '#a855f7', phone: '#f59e0b', vat: '#ef4444', iban: '#0891b2', url: '#6366f1', ref: '#db2777',
};
const GRAPH_W = 720;
const GRAPH_H = 520;

type GraphPos = Map<string, { x: number; y: number }>;

// Deterministic force-directed layout (Fruchterman-Reingold-ish). Seeded from a
// circle by index, no randomness, so the graph is stable across renders.
function layoutGraph(graph: MemoryGraph): GraphPos {
  const nodes = graph.nodes;
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    return { x: GRAPH_W / 2 + Math.cos(a) * GRAPH_W * 0.32, y: GRAPH_H / 2 + Math.sin(a) * GRAPH_H * 0.32, vx: 0, vy: 0 };
  });
  const idx = new Map(nodes.map((node, i) => [node.id, i]));
  const k = Math.sqrt((GRAPH_W * GRAPH_H) / Math.max(1, n)) * 0.55;
  const iterations = 220;
  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    for (let i = 0; i < n; i++) { pos[i].vx = 0; pos[i].vy = 0; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      const d = Math.hypot(dx, dy) || 0.01; const rep = (k * k) / d;
      dx = dx / d * rep; dy = dy / d * rep;
      pos[i].vx += dx; pos[i].vy += dy; pos[j].vx -= dx; pos[j].vy -= dy;
    }
    for (const e of graph.edges) {
      const a = idx.get(e.source), b = idx.get(e.target);
      if (a === undefined || b === undefined) continue;
      let dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.hypot(dx, dy) || 0.01; const att = (d * d) / k;
      dx = dx / d * att; dy = dy / d * att;
      pos[a].vx -= dx; pos[a].vy -= dy; pos[b].vx += dx; pos[b].vy += dy;
    }
    const maxStep = k * 2 * cool;
    for (let i = 0; i < n; i++) {
      const p = pos[i]; const disp = Math.hypot(p.vx, p.vy) || 0.01;
      p.x += (p.vx / disp) * Math.min(disp, maxStep);
      p.y += (p.vy / disp) * Math.min(disp, maxStep);
      p.x += (GRAPH_W / 2 - p.x) * 0.012; p.y += (GRAPH_H / 2 - p.y) * 0.012;
      p.x = Math.max(24, Math.min(GRAPH_W - 24, p.x)); p.y = Math.max(24, Math.min(GRAPH_H - 24, p.y));
    }
  }
  return new Map(nodes.map((node, i) => [node.id, { x: pos[i].x, y: pos[i].y }]));
}

function GraphView({ onNotice }: { onNotice: (notice: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [graph, setGraph] = useState<MemoryGraph>();
  const [sharedOnly, setSharedOnly] = useState(true);
  const [selected, setSelected] = useState<MemoryGraphNode>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (minFiles: number) => {
    setBusy(true); setSelected(undefined);
    try { setGraph(await window.maxDesktop.getMemoryGraph({ minFiles, limit: 60 })); }
    catch (error) { onNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  }, [onNotice]);

  useEffect(() => { void load(sharedOnly ? 2 : 1); }, [load, sharedOnly]);

  const positions = graph ? layoutGraph(graph) : undefined;
  const neighbours = (id: string) => graph ? graph.edges.filter((e) => e.source === id || e.target === id).map((e) => (e.source === id ? e.target : e.source)) : [];
  const highlighted = selected ? new Set([selected.id, ...neighbours(selected.id)]) : undefined;

  return <div className="explorer graph-layout">
    <Card className="graph-canvas" title="Grafo entità" eyebrow={graph ? `${graph.sharedEntities} ENTITÀ CONDIVISE` : 'KNOWLEDGE GRAPH'} action={<label className="graph-toggle"><input type="checkbox" checked={sharedOnly} onChange={(event) => setSharedOnly(event.target.checked)} /> Solo collegamenti tra file</label>}>
      {graph && positions && graph.nodes.length > 0 ? <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="graph-svg" role="img" aria-label="Grafo delle entità">
        {graph.edges.map((edge, i) => {
          const a = positions.get(edge.source), b = positions.get(edge.target);
          if (!a || !b) return null;
          const dim = highlighted && !(highlighted.has(edge.source) && highlighted.has(edge.target));
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeOpacity={dim ? 0.06 : 0.22} strokeWidth={1} />;
        })}
        {graph.nodes.map((node) => {
          const p = positions.get(node.id); if (!p) return null;
          const isEntity = node.kind === 'entity';
          const r = isEntity ? 5 + Math.min(node.weight, 6) * 2 : 4;
          const color = isEntity ? (ENTITY_COLORS[node.entityType ?? ''] ?? '#64748b') : 'var(--muted)';
          const dim = highlighted && !highlighted.has(node.id);
          return <g key={node.id} className="graph-node" transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.25 : 1} onClick={() => setSelected(node)} style={{ cursor: 'pointer' }}>
            {isEntity ? <circle r={r} fill={color} /> : <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill={color} />}
            {(isEntity || selected?.id === node.id) && <text x={r + 3} y={4} fontSize={isEntity ? 11 : 10} fill="currentColor">{node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label}</text>}
          </g>;
        })}
      </svg> : <EmptyState icon="⧉" title={busy ? 'Costruisco il grafo…' : 'Nessun collegamento'}>{busy ? 'Analizzo le entità dei documenti indicizzati.' : 'Scansiona cartelle con documenti (email, importi, date ricorrenti) per far emergere i collegamenti. Togli il filtro per vedere anche le entità singole.'}</EmptyState>}
    </Card>
    <Card className="editor" eyebrow="DETTAGLIO" title={selected ? selected.label : 'Legenda'}>
      {selected ? <div className="graph-detail">
        <p><strong>{selected.kind === 'entity' ? `Entità · ${selected.entityType}` : 'File'}</strong></p>
        {selected.kind === 'entity' && <p className="muted-line">Presente in {selected.weight} file:</p>}
        <div className="entry-list">{neighbours(selected.id).map((nid) => {
          const nn = graph?.nodes.find((x) => x.id === nid);
          return nn ? <div key={nid} className="entry"><span className="entry-icon">{nn.kind === 'file' ? '▤' : '●'}</span><span className="entry-name">{nn.label}</span></div> : null;
        })}</div>
      </div> : <div className="graph-legend">{Object.entries(ENTITY_COLORS).map(([type, color]) => <span key={type}><i style={{ background: color }} />{type}</span>)}<span><i style={{ background: 'var(--muted)', borderRadius: 2 }} />file</span></div>}
    </Card>
  </div>;
}

function Dashboard({ snapshot, files, logs, onGoAgent, onSync }: { snapshot: AppSnapshot; files: LocalFile[]; logs: AuditEntry[]; onGoAgent: () => void; onSync: () => void }) { return <div className="page-grid"><Card className="hero-card"><div className="hero-copy"><span className="eyebrow">DIPENDENTE DIGITALE</span><h2>{snapshot.connection === 'connected' ? 'Max è pronto a lavorare.' : 'Max è offline.'}</h2><p>Dai a Max un obiettivo: legge i file, esegue comandi e crea cose in OnarSuite, in autonomia e con audit completo.</p><div className="hero-actions"><Button onClick={onGoAgent}>Apri l'agente</Button><Button variant="secondary" onClick={onSync}>Controlla connessione</Button></div></div><div className="orb"><BrandMark size={84} /><StatusPill state={snapshot.connection} /></div></Card><div className="stats-grid"><Stat label="Documenti visibili" value={String(files.length)} detail="Workspace e cartelle autorizzate" /><Stat label="Cartelle autorizzate" value={String(snapshot.authorizedFolders.length)} detail="Ambito operativo di Max" /><Stat label="Ultimo sync" value={snapshot.lastSyncAt ? formatDate(snapshot.lastSyncAt) : 'Mai'} detail={`Versione ${snapshot.appVersion}`} /></div><Card title="Attività recenti">{logs.length ? <div className="activity-list">{logs.slice(0, 6).map((log) => <div key={log.id}><span className={`log-dot ${log.level}`} /><div><strong>{log.message}</strong><small>{formatDate(log.createdAt)} · {log.eventType}</small></div></div>)}</div> : <EmptyState icon="◎" title="Nessuna attività">Le azioni di Max appariranno qui.</EmptyState>}</Card></div>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></Card>; }

function FoldersView({ snapshot, busy, onAdd, onRemove, onDrop, onChoose }: { snapshot: AppSnapshot; busy: boolean; onAdd: () => void; onRemove: (folder: string) => void; onDrop: (event: DragEvent) => void; onChoose: () => void }) { return <div className="page-grid"><Card title="Ambito operativo di Max" action={<Button disabled={busy} onClick={onAdd}>Aggiungi cartella</Button>}><div className="permission-banner"><strong>Max lavora solo nelle cartelle qui sotto.</strong><span>Dentro l'allowlist può leggere, scrivere, modificare ed eseguire comandi. Fuori, è bloccato.</span></div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><span>+</span><div><strong>Trascina qui i documenti</strong><small>per copiarli nella OnarSuite Workspace</small></div><Button variant="secondary" onClick={onChoose}>Scegli file</Button></div><div className="folder-list"><div><span className="folder-icon">▰</span><div><strong>OnarSuite Workspace</strong><small>{snapshot.workspacePath}</small></div><span className="fixed-badge">Sempre attiva</span></div>{snapshot.authorizedFolders.map((folder) => <div key={folder}><span className="folder-icon">▰</span><div><strong>{folder.split(/[\\/]/).pop()}</strong><small>{folder}</small></div><Button variant="ghost" onClick={() => onRemove(folder)}>Rimuovi</Button></div>)}</div></Card><Card title="Permessi"><div className="scope-columns"><div><strong>Consentiti (in autonomia)</strong>{MVP_SCOPES.map((scope) => <span key={scope} className="scope allowed">✓ {scope}</span>)}</div><div><strong>Sempre bloccati</strong>{BLOCKED_SCOPES.map((scope) => <span key={scope} className="scope blocked">× {scope}</span>)}</div></div></Card></div>; }

function LogsView({ logs }: { logs: AuditEntry[] }) { return <Card title="Registro attività" eyebrow="AUDIT LOCALE"><div className="log-table"><div className="log-row head"><span>Data</span><span>Evento</span><span>Livello</span><span>Messaggio</span></div>{logs.map((log) => <div className="log-row" key={log.id}><span>{formatDate(log.createdAt)}</span><code>{log.eventType}</code><span><i className={`log-dot ${log.level}`} />{log.level}</span><strong>{log.message}</strong></div>)}</div>{!logs.length && <EmptyState icon="≡" title="Registro vuoto">Le azioni e gli errori compariranno qui.</EmptyState>}</Card>; }

function SettingsView({ snapshot, busy, onDisconnect, onClear }: { snapshot: AppSnapshot; busy: boolean; onDisconnect: () => void; onClear: () => void }) { return <div className="page-grid settings-grid"><Card title="Dispositivo"><dl><dt>Nome</dt><dd>{snapshot.deviceName}</dd><dt>ID dispositivo</dt><dd>{snapshot.deviceId}</dd><dt>Server</dt><dd>{snapshot.serverUrl}</dd><dt>Versione</dt><dd>{snapshot.appVersion}</dd><dt>Token locale</dt><dd>{snapshot.encryptionAvailable ? 'Cifrato con il sistema operativo' : 'Non persistito'}</dd></dl><Button variant="danger" disabled={busy} onClick={onDisconnect}>Disconnetti dispositivo</Button></Card><MemorySnapshots /><Card title="Privacy e dati locali"><p>Puoi cancellare configurazione, token, coda offline e audit locale. I documenti nelle cartelle autorizzate non vengono eliminati automaticamente.</p><Button variant="secondary" disabled={busy} onClick={onClear}>Cancella dati locali</Button></Card></div>; }

function MemorySnapshots() {
  const [snaps, setSnaps] = useState<MemorySnapshotMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const refresh = useCallback(async () => {
    try { setSnaps(await window.maxDesktop.listMemorySnapshots()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const wrap = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(undefined);
    try { await fn(); await refresh(); setMsg(done); }
    catch (error) { setMsg(errorText(error)); }
    finally { setBusy(false); }
  };

  return <Card title="Snapshot memoria" eyebrow="ROLLBACK LOCALE" action={<Button disabled={busy} onClick={() => void wrap(() => window.maxDesktop.snapshotMemory(), 'Snapshot creato.')}>Crea snapshot</Button>}>
    <p className="muted-line">Salva lo stato dell'indice della memoria locale e ripristinalo in caso di scansioni indesiderate. I file non vengono toccati.</p>
    <div className="snap-list">
      {snaps.map((snap) => <div key={snap.id} className="snap-row">
        <div><strong>{snap.label ?? 'Snapshot'}</strong><small>{formatDate(snap.createdAt)} · {snap.records} file</small></div>
        <div className="snap-actions">
          <Button variant="secondary" disabled={busy} onClick={() => void wrap(() => window.maxDesktop.restoreMemorySnapshot(snap.id), 'Memoria ripristinata.')}>Ripristina</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void wrap(() => window.maxDesktop.deleteMemorySnapshot(snap.id), 'Snapshot eliminato.')}>×</Button>
        </div>
      </div>)}
      {!snaps.length && <p className="muted-line">Nessuno snapshot. Creane uno prima di una scansione importante.</p>}
    </div>
    {msg && <small className="snap-msg">{msg}</small>}
  </Card>;
}

function UpdateBanner({ state, busy, onAction }: { state: UpdateState; busy: boolean; onAction: () => void }) {
  if (state.status === 'disabled' || state.status === 'idle') return null;

  const percent = Math.max(0, Math.min(100, state.percent ?? 0));
  const presentation = getUpdatePresentation(state);

  return (
    <div className={`update-banner update-${state.status}`} role="status" aria-live="polite">
      <div className="update-banner-icon" aria-hidden="true">
        {state.status === 'downloaded' ? '✓' : state.status === 'error' ? '!' : '↓'}
      </div>
      <div className="update-banner-copy">
        <span className="eyebrow">AGGIORNAMENTO APP</span>
        <strong>{presentation.title}</strong>
        <span>{presentation.message}</span>
        {state.status === 'downloading' && (
          <div className="update-progress" role="progressbar" aria-label="Download aggiornamento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      {presentation.buttonLabel && (
        <Button variant={state.status === 'downloaded' ? 'primary' : 'secondary'} disabled={busy} onClick={onAction}>
          {busy ? 'Attendi…' : presentation.buttonLabel}
        </Button>
      )}
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
      window.maxDesktop.onar('list_unified_contacts', { limit: 30 }),
    ]);
    if (usersRes.success) setUsers(((usersRes.data as { users?: Array<Record<string, unknown>> } | undefined)?.users) ?? []);
    if (leadsRes.success) setLeads(((leadsRes.data as { contacts?: Array<Record<string, unknown>> } | undefined)?.contacts) ?? []);
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
    const res = await window.maxDesktop.onar('create_unified_contact', {
      name: leadForm.name,
      email: leadForm.email || undefined,
      phone: leadForm.phone || undefined,
      notes: leadForm.notes || undefined,
      functions: ['customer'],
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
        <Card><span className="stat-label">Clienti</span><strong className="stat-value">{leads.length}</strong><small>Anagrafiche cliente</small></Card>
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
        <Card title="Anagrafiche clienti">
          {loading ? <p className="muted-line">Carico clienti...</p> : (
            <div className="data-table compact">
              {leads.map((lead) => (
                <div key={String(lead.id)} className="data-row">
                  <strong>{String(lead.display_name ?? '—')}</strong>
                  <span>{String(lead.email ?? '—')}</span>
                  <span>{String(lead.phone ?? '—')}</span>
                </div>
              ))}
              {!leads.length && <EmptyState icon="◉" title="Nessun cliente">Non ci sono clienti da mostrare.</EmptyState>}
            </div>
          )}
          <form className="module-form" onSubmit={submitLead}>
            <label>Nome<input value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} required /></label>
            <label>Telefono<input value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} /></label>
            <label>Note<textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} rows={3} /></label>
            <Button disabled={busy}>{busy ? 'Salvataggio...' : 'Crea cliente'}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

const viewTitles: Record<View, string> = { onarsuite: 'Skills di Max', clients: 'Clienti', agent: 'Agente Max', explorer: 'Esplora file', workspace: 'Virtual Workspace', graph: 'Grafo entità', dashboard: 'Panoramica', folders: 'Cartelle autorizzate', logs: 'Attività', settings: 'Impostazioni' };
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



