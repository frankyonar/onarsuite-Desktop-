import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import type { ActionResult, AppSnapshot, AuditEntry, ChatMessage, FileAction, LocalFile, PairingInput, ParsedDocument } from '../../shared/types';
import { BLOCKED_SCOPES, MVP_SCOPES } from '../../shared/types';
import { Button, Card, EmptyState, Markdown, StatusPill } from './components';

type View = 'chat' | 'dashboard' | 'files' | 'folders' | 'logs' | 'settings';
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
  { id: 'chat', label: 'Parla con Max', icon: 'M' },
  { id: 'dashboard', label: 'Panoramica', icon: '⌂' },
  { id: 'files', label: 'File Workspace', icon: '▤' },
  { id: 'folders', label: 'Cartelle autorizzate', icon: '▱' },
  { id: 'logs', label: 'Registro attività', icon: '≡' },
  { id: 'settings', label: 'Impostazioni', icon: '⚙' },
];

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [startupError, setStartupError] = useState<string>();
  const [view, setView] = useState<View>('chat');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<LocalFile>();
  const [preview, setPreview] = useState<ParsedDocument>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warning'; text: string }>();
  const [theme, toggleTheme] = useTheme();

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

  const run = async (task: () => Promise<unknown>, success?: string) => {
    setBusy(true); setNotice(undefined);
    try { await task(); if (success) setNotice({ tone: 'success', text: success }); await refresh(); }
    catch (error) { setNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const selectFile = async (file: LocalFile) => {
    setSelected(file); setPreview(undefined); setBusy(true);
    try { setPreview(await window.maxDesktop.parseFile(file.path)); }
    catch (error) { setNotice({ tone: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const performAction = async (action: FileAction) => {
    if (!selected) return;
    if (!window.confirm(`${actionLabels[action]} per “${selected.name}”?\n\nIl file o i dati estratti saranno inviati a OnarSuite.`)) return;
    await run(async () => {
      const result: ActionResult = await window.maxDesktop.performFileAction(selected.path, action);
      setNotice({ tone: result.status === 'queued' ? 'warning' : 'success', text: result.message });
    });
  };

  const importDrop = async (event: DragEvent) => {
    event.preventDefault();
    const paths = Array.from(event.dataTransfer.files).map((file) => window.maxDesktop.getPathForFile(file)).filter(Boolean);
    if (paths.length) await run(() => window.maxDesktop.importDroppedFiles(paths), 'File aggiunti alla workspace.');
  };

  if (!snapshot) return <StartupScreen error={startupError} onRetry={() => void refresh().catch((error) => setStartupError(errorText(error)))} />;
  if (snapshot.connection === 'not_paired') return <PairingPage snapshot={snapshot} busy={busy} notice={notice} onPair={(input) => run(() => window.maxDesktop.pair(input))} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="max-mark small">M</div><div><strong>Max Desktop</strong><span>per OnarSuite</span></div></div>
      <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-status"><StatusPill state={snapshot.connection} /><small>{snapshot.accountLabel || snapshot.deviceName}</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">ONARSUITE / MAX DESKTOP</span><h1>{viewTitles[view]}</h1></div><div className="topbar-actions">{snapshot.pendingActions > 0 && <span className="queue-count">{snapshot.pendingActions} in coda</span>}<button className="theme-toggle" title="Tema chiaro/scuro" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button><Button variant="secondary" disabled={busy} onClick={() => run(() => window.maxDesktop.syncNow(), 'Sincronizzazione completata.')}>Sincronizza</Button></div></header>
      {notice && <div className={`notice notice-${notice.tone}`}><span>{notice.text}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
      {view === 'chat' && <ChatView messages={messages} files={files} selected={selected} busy={busy} onSelectFile={setSelected} onSend={async (text) => {
        const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() };
        const history = [...messages, user]; setMessages(history); setBusy(true);
        try { const result = await window.maxDesktop.sendChat({ message: text, history: messages, filePath: selected?.path }); setMessages([...history, result.message]); await refresh(); }
        catch (error) { setNotice({ tone: 'error', text: errorText(error) }); }
        finally { setBusy(false); }
      }} />}
      {view === 'dashboard' && <Dashboard snapshot={snapshot} files={files} logs={logs} onGoFiles={() => setView('files')} onSync={() => run(() => window.maxDesktop.syncNow())} />}
      {view === 'files' && <FilesView files={files} selected={selected} preview={preview} busy={busy} onSelect={selectFile} onChoose={() => run(() => window.maxDesktop.chooseFiles(), 'File aggiunti alla workspace.')} onDrop={importDrop} onOpen={(file) => run(() => window.maxDesktop.openFile(file.path))} onAction={performAction} />}
      {view === 'folders' && <FoldersView snapshot={snapshot} busy={busy} onAdd={() => run(() => window.maxDesktop.addAuthorizedFolder())} onRemove={(folder) => run(() => window.maxDesktop.removeAuthorizedFolder(folder))} />}
      {view === 'logs' && <LogsView logs={logs} />}
      {view === 'settings' && <SettingsView snapshot={snapshot} busy={busy} onDisconnect={() => run(() => window.maxDesktop.disconnect())} onClear={() => run(() => window.maxDesktop.clearLocalData())} />}
    </main>
  </div>;
}

function StartupScreen({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return <div className="splash"><div className="max-mark">M</div><h2>{error ? 'Max Desktop non è riuscito ad avviarsi' : 'Avvio di Max Desktop…'}</h2>{error && <><p className="startup-error">{error}</p><Button onClick={onRetry}>Riprova</Button></>}</div>;
}

function PairingPage({ snapshot, busy, notice, onPair }: { snapshot: AppSnapshot; busy: boolean; notice?: { tone: string; text: string }; onPair: (input: PairingInput) => void }) {
  const [serverUrl, setServerUrl] = useState(snapshot.serverUrl || 'https://onarsuite.com');
  const [deviceName, setDeviceName] = useState(snapshot.deviceName);
  const [pairingCode, setPairingCode] = useState('');
  return <div className="pairing-page"><section className="pairing-copy"><div className="max-mark">M</div><span className="eyebrow">MAX DESKTOP PER ONARSUITE</span><h1>Il tuo lavoro locale,<br />collegato a Max.</h1><p>Lavora sui documenti del computer in una workspace sicura. Ogni invio verso OnarSuite resta esplicito, controllato e registrato.</p><div className="trust-list"><span>✓ Accesso solo alle cartelle autorizzate</span><span>✓ Token cifrato dal sistema operativo</span><span>✓ Nessuna shell libera o cancellazione automatica</span></div></section><Card className="pairing-card" eyebrow="PRIMO ACCESSO" title="Collega questo computer">{notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}<form onSubmit={(event) => { event.preventDefault(); onPair({ serverUrl, deviceName, pairingCode: pairingCode || undefined }); }}><label>Server OnarSuite<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required /></label><label>Nome dispositivo<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required /></label><label>Codice pairing <span>(se richiesto)</span><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} /></label><Button disabled={busy}>{busy ? 'Collegamento…' : 'Collega a OnarSuite'}</Button><small className="form-note">La connessione usa HTTPS e può essere revocata da OnarSuite.</small></form></Card></div>;
}

function ChatView({ messages, files, selected, busy, onSelectFile, onSend }: { messages: ChatMessage[]; files: LocalFile[]; selected?: LocalFile; busy: boolean; onSelectFile: (file?: LocalFile) => void; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value || busy) return; setText(''); onSend(value); };
  return <div className="chat-shell"><div className="chat-stream">{messages.length === 0 ? <div className="chat-welcome"><div className="max-mark">M</div><span className="eyebrow">MAX AI + ONARSUITE</span><h2>Cosa facciamo oggi?</h2><p>Puoi chiedere a Max di analizzare un documento, preparare una bozza o trasformare il contenuto in un’attività OnarSuite.</p><div className="prompt-grid">{['Riassumi il documento selezionato', 'Estrai i dati del cliente', 'Prepara una bozza di preventivo', 'Suggerisci le prossime attività'].map((prompt) => <button key={prompt} onClick={() => onSend(prompt)}>{prompt}<span>→</span></button>)}</div></div> : messages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}><div className="chat-avatar">{message.role === 'assistant' ? 'M' : 'Tu'}</div><div><strong>{message.role === 'assistant' ? 'Max' : 'Tu'}</strong>{message.role === 'assistant' ? <Markdown content={message.content} /> : <p>{message.content}</p>}</div></div>)}{busy && <div className="chat-message assistant"><div className="chat-avatar">M</div><div><strong>Max</strong><p>Sto lavorando…</p></div></div>}</div><form className="composer" onSubmit={submit}><div className="context-picker"><span>Contesto:</span><select value={selected?.path || ''} onChange={(event) => onSelectFile(files.find((file) => file.path === event.target.value))}><option value="">Nessun documento</option>{files.map((file) => <option key={file.id} value={file.path}>{file.name}</option>)}</select></div><div className="composer-row"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Scrivi a Max…" rows={3} /><Button disabled={busy || !text.trim()}>Invia</Button></div><small>I file vengono inviati a OnarSuite solo quando confermi un’azione o li usi esplicitamente come contesto.</small></form></div>;
}

function Dashboard({ snapshot, files, logs, onGoFiles, onSync }: { snapshot: AppSnapshot; files: LocalFile[]; logs: AuditEntry[]; onGoFiles: () => void; onSync: () => void }) { return <div className="page-grid"><Card className="hero-card"><div className="hero-copy"><span className="eyebrow">WORKSPACE SICURA</span><h2>{snapshot.connection === 'connected' ? 'Max è pronto a lavorare.' : 'Max sta lavorando in modalità offline.'}</h2><p>I file restano sul computer finché non confermi un’azione verso OnarSuite.</p><div className="hero-actions"><Button onClick={onGoFiles}>Aggiungi un documento</Button><Button variant="secondary" onClick={onSync}>Controlla connessione</Button></div></div><div className="orb"><div className="max-mark">M</div><StatusPill state={snapshot.connection} /></div></Card><div className="stats-grid"><Stat label="Documenti visibili" value={String(files.length)} detail="Workspace e cartelle autorizzate" /><Stat label="Azioni in coda" value={String(snapshot.pendingActions)} detail="Sincronizzazione automatica" /><Stat label="Ultimo sync" value={snapshot.lastSyncAt ? formatDate(snapshot.lastSyncAt) : 'Mai'} detail={`Versione ${snapshot.appVersion}`} /></div><Card title="Attività recenti">{logs.length ? <div className="activity-list">{logs.slice(0, 5).map((log) => <div key={log.id}><span className={`log-dot ${log.level}`} /><div><strong>{log.message}</strong><small>{formatDate(log.createdAt)} · {log.eventType}</small></div></div>)}</div> : <EmptyState icon="◎" title="Nessuna attività">Le azioni di Max appariranno qui.</EmptyState>}</Card></div>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{detail}</small></Card>; }

function FilesView({ files, selected, preview, busy, onSelect, onChoose, onDrop, onOpen, onAction }: { files: LocalFile[]; selected?: LocalFile; preview?: ParsedDocument; busy: boolean; onSelect: (file: LocalFile) => void; onChoose: () => void; onDrop: (event: DragEvent) => void; onOpen: (file: LocalFile) => void; onAction: (action: FileAction) => void }) { return <div className="files-layout"><div><div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><span>＋</span><div><strong>Trascina qui i documenti</strong><small>PDF, DOCX, XLSX, CSV, TXT o MD · massimo 50 MB</small></div><Button variant="secondary" onClick={onChoose}>Scegli file</Button></div><Card title="Documenti"><div className="file-list">{files.map((file) => <button key={file.id} className={selected?.path === file.path ? 'selected' : ''} onClick={() => onSelect(file)}><span className={`file-type type-${file.extension}`}>{file.extension.toUpperCase()}</span><span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {file.source === 'workspace' ? 'Workspace' : 'Cartella autorizzata'}</small></span><time>{formatDate(file.modifiedAt)}</time></button>)}</div>{!files.length && <EmptyState icon="▤" title="La workspace è vuota" action={<Button onClick={onChoose}>Aggiungi documento</Button>}>Aggiungi un file per iniziare a lavorare con Max.</EmptyState>}</Card></div><Card className="file-detail" eyebrow="DOCUMENTO" title={selected?.name || 'Seleziona un file'}>{selected ? <><div className="detail-meta"><span>{selected.extension.toUpperCase()}</span><span>{formatBytes(selected.size)}</span><button onClick={() => onOpen(selected)}>Apri file ↗</button></div><div className="preview-box"><strong>Anteprima estratta</strong>{busy && !preview ? <p>Analisi locale in corso…</p> : <p>{preview?.summary || 'Nessun testo disponibile.'}</p>}</div><div className="action-stack"><Button disabled={busy} onClick={() => onAction('upload')}>Carica su OnarSuite</Button><Button variant="secondary" disabled={busy} onClick={() => onAction('create_task')}>Crea task da file</Button><Button variant="secondary" disabled={busy} onClick={() => onAction('create_customer_draft')}>Crea cliente in bozza</Button><Button variant="secondary" disabled={busy} onClick={() => onAction('create_quote_draft')}>Crea preventivo in bozza</Button></div><p className="safety-note">Ogni invio richiede conferma e viene registrato nell’audit log.</p></> : <EmptyState icon="←" title="Scegli un documento">Vedrai anteprima e azioni disponibili.</EmptyState>}</Card></div>; }

function FoldersView({ snapshot, busy, onAdd, onRemove }: { snapshot: AppSnapshot; busy: boolean; onAdd: () => void; onRemove: (folder: string) => void }) { return <div className="page-grid"><Card title="Accesso locale controllato" action={<Button disabled={busy} onClick={onAdd}>Aggiungi cartella</Button>}><div className="permission-banner"><strong>Max può leggere solo le cartelle qui sotto.</strong><span>Non indicizza il disco e non può cancellare file.</span></div><div className="folder-list"><div><span className="folder-icon">▰</span><div><strong>OnarSuite Workspace</strong><small>{snapshot.workspacePath}</small></div><span className="fixed-badge">Sempre attiva</span></div>{snapshot.authorizedFolders.map((folder) => <div key={folder}><span className="folder-icon">▰</span><div><strong>{folder.split(/[\\/]/).pop()}</strong><small>{folder}</small></div><Button variant="ghost" onClick={() => onRemove(folder)}>Rimuovi</Button></div>)}</div></Card><Card title="Permessi MVP"><div className="scope-columns"><div><strong>Consentiti</strong>{MVP_SCOPES.map((scope) => <span key={scope} className="scope allowed">✓ {scope}</span>)}</div><div><strong>Bloccati</strong>{BLOCKED_SCOPES.map((scope) => <span key={scope} className="scope blocked">× {scope}</span>)}</div></div></Card></div>; }
function LogsView({ logs }: { logs: AuditEntry[] }) { return <Card title="Registro attività" eyebrow="AUDIT LOCALE"><div className="log-table"><div className="log-row head"><span>Data</span><span>Evento</span><span>Livello</span><span>Messaggio</span></div>{logs.map((log) => <div className="log-row" key={log.id}><span>{formatDate(log.createdAt)}</span><code>{log.eventType}</code><span><i className={`log-dot ${log.level}`} />{log.level}</span><strong>{log.message}</strong></div>)}</div>{!logs.length && <EmptyState icon="≡" title="Registro vuoto">Le azioni e gli errori compariranno qui.</EmptyState>}</Card>; }
function SettingsView({ snapshot, busy, onDisconnect, onClear }: { snapshot: AppSnapshot; busy: boolean; onDisconnect: () => void; onClear: () => void }) { return <div className="page-grid settings-grid"><Card title="Dispositivo"><dl><dt>Nome</dt><dd>{snapshot.deviceName}</dd><dt>ID dispositivo</dt><dd>{snapshot.deviceId}</dd><dt>Server</dt><dd>{snapshot.serverUrl}</dd><dt>Versione</dt><dd>{snapshot.appVersion}</dd><dt>Token locale</dt><dd>{snapshot.encryptionAvailable ? 'Cifrato con il sistema operativo' : 'Non persistito'}</dd></dl><Button variant="danger" disabled={busy} onClick={onDisconnect}>Disconnetti dispositivo</Button></Card><Card title="Privacy e dati locali"><p>Puoi cancellare configurazione, token, coda offline e audit locale. I documenti nella OnarSuite Workspace non vengono eliminati automaticamente.</p><Button variant="secondary" disabled={busy} onClick={onClear}>Cancella dati locali</Button></Card></div>; }

const viewTitles: Record<View, string> = { chat: 'Parla con Max', dashboard: 'Panoramica', files: 'File Workspace', folders: 'Cartelle autorizzate', logs: 'Registro attività', settings: 'Impostazioni' };
const actionLabels: Record<FileAction, string> = { upload: 'Caricare su OnarSuite', create_task: 'Creare un task', create_customer_draft: 'Creare un cliente in bozza', create_quote_draft: 'Creare un preventivo in bozza' };
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function errorText(error: unknown) { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Errore imprevisto.'; }
