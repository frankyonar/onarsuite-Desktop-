import { cloneElement, Fragment, isValidElement } from 'react';
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ConnectionState, ToolName } from '../../shared/types';
import { splitLocalFilePathSegments } from './local-file-links';

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents = {
  p: ({ children, ...props }: ComponentPropsWithoutRef<'p'>) => <p {...props}>{renderLocalFilePathLinks(children)}</p>,
  li: ({ children, ...props }: ComponentPropsWithoutRef<'li'>) => <li {...props}>{renderLocalFilePathLinks(children)}</li>,
  td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => <td {...props}>{renderLocalFilePathLinks(children)}</td>,
  th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => <th {...props}>{renderLocalFilePathLinks(children)}</th>,
};

function renderLocalFilePathLinks(node: ReactNode, keyPrefix = 'file-path'): ReactNode {
  if (typeof node === 'string') {
    return splitLocalFilePathSegments(node).map((segment, index) => (
      typeof segment === 'string'
        ? <Fragment key={`${keyPrefix}-text-${index}`}>{segment}</Fragment>
        : <LocalFilePathLink key={`${keyPrefix}-path-${index}`} path={segment.path} />
    ));
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={`${keyPrefix}-node-${index}`}>{renderLocalFilePathLinks(child, `${keyPrefix}-${index}`)}</Fragment>
    ));
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const tagName = typeof node.type === 'string' ? node.type : '';
    if (tagName === 'a' || tagName === 'button' || tagName === 'code' || tagName === 'pre') return node;
    if (!node.props.children) return node;
    return cloneElement(node, undefined, renderLocalFilePathLinks(node.props.children, `${keyPrefix}-child`));
  }

  return node;
}

function LocalFilePathLink({ path }: { path: string }) {
  const open = async () => {
    try {
      await window.maxDesktop.openFile(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore imprevisto.';
      window.alert(`Non riesco ad aprire il file:\n${path}\n\n${message}`);
    }
  };

  return (
    <button type="button" className="local-file-link" title={`Apri ${path}`} onClick={() => void open()}>
      {path}
    </button>
  );
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export function Card({ title, eyebrow, action, children, className = '' }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || eyebrow || action) && (
        <header className="card-header">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}{title && <h2>{title}</h2>}</div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const ONAR_ICON = new URL('./assets/onar-icon.png', import.meta.url).href;
const ONAR_LOGO_LIGHT = new URL('./assets/onarsuite-logo-light.png', import.meta.url).href;
const ONAR_LOGO_DARK = new URL('./assets/onarsuite-logo-dark.png', import.meta.url).href;

export function BrandMark({ size = 40 }: { size?: number }) {
  return <img className="brand-icon" src={ONAR_ICON} alt="OnarSuite" width={size} height={size} style={{ width: size, height: size }} />;
}

export function Wordmark() {
  return <span className="wordmark"><strong>onar</strong>suite</span>;
}

export function AppLogo({ theme, planName }: { theme: 'light' | 'dark'; planName?: string }) {
  return (
    <div className="app-logo">
      <img
        className="app-logo-mark"
        src={theme === 'dark' ? ONAR_LOGO_DARK : ONAR_LOGO_LIGHT}
        alt="OnarSuite"
        width={188}
        height={42}
      />
      <span className="plan-badge">{(planName || 'PRO').toUpperCase()}</span>
    </div>
  );
}

const connectionLabels: Record<ConnectionState, string> = {
  connected: 'Connesso', offline: 'Offline', not_paired: 'Non collegato', revoked: 'Revocato', error: 'Errore',
};

export function StatusPill({ state }: { state: ConnectionState }) {
  return <span className={`status status-${state}`}><i />{connectionLabels[state]}</span>;
}

export type GlassIconName =
  | 'agent' | 'workspace' | 'graph' | 'files' | 'folders' | 'activity' | 'skills' | 'clients' | 'settings'
  | 'magic' | 'web' | 'theme' | 'sync' | 'plus' | 'search' | 'edit' | 'trash' | 'close' | 'back' | 'expand' | 'collapse'
  | 'preview' | 'context' | 'output' | 'customer' | 'contract' | 'reminder' | 'table' | 'form' | 'checklist'
  | 'calendar' | 'products' | 'quotes' | 'invoice' | 'email' | 'ticket' | 'folder' | 'file' | 'image' | 'terminal'
  | 'upload' | 'download' | 'success' | 'error' | 'warning' | 'user';

const iconTones: Record<GlassIconName, string> = {
  agent: 'blue', workspace: 'violet', graph: 'mint', files: 'sky', folders: 'amber', activity: 'coral', skills: 'violet', clients: 'mint', settings: 'slate',
  magic: 'coral', web: 'blue', theme: 'amber', sync: 'sky', plus: 'mint', search: 'blue', edit: 'violet', trash: 'coral', close: 'slate', back: 'sky', expand: 'violet', collapse: 'slate',
  preview: 'blue', context: 'mint', output: 'coral', customer: 'mint', contract: 'blue', reminder: 'coral', table: 'violet', form: 'violet', checklist: 'amber',
  calendar: 'coral', products: 'mint', quotes: 'sky', invoice: 'amber', email: 'violet', ticket: 'blue', folder: 'amber', file: 'blue', image: 'coral', terminal: 'slate',
  upload: 'mint', download: 'sky', success: 'mint', error: 'coral', warning: 'amber', user: 'mint',
};

export function GlassIcon({ name, className = '', bare = false }: { name: GlassIconName; className?: string; bare?: boolean }) {
  return (
    <span className={`${bare ? 'glass-icon-bare' : 'glass-icon'} glass-icon-${iconTones[name]} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {iconShape(name)}
      </svg>
    </span>
  );
}

function iconShape(name: GlassIconName) {
  switch (name) {
    case 'agent': return <><path d="M12 3.75c4.55 0 7.75 2.95 7.75 7.15 0 4.05-3.02 7.02-7.32 7.02h-.78l-3.3 2.3a.8.8 0 0 1-1.25-.66v-2.35c-2.08-1.17-2.85-3.32-2.85-6.31C4.25 6.7 7.45 3.75 12 3.75Z" /><path d="M8.5 10.8h.02M12 10.8h.02M15.5 10.8h.02" /></>;
    case 'workspace': return <><path d="M5.3 6.2 12 3.35l6.7 2.85v7.88L12 20.65l-6.7-6.57Z" /><path d="m5.8 6.65 6.2 3.08 6.2-3.08M12 9.75v10.1" /></>;
    case 'graph': return <><circle cx="6.4" cy="7" r="2.35" /><circle cx="17.6" cy="7" r="2.35" /><circle cx="12" cy="17" r="2.35" /><path d="m8.5 8.95 2.55 5.7M15.5 8.95l-2.55 5.7M8.75 7h6.5" /></>;
    case 'files': case 'file': return <><path d="M6.4 3.8h7l4.2 4.2v12.2H6.4Z" /><path d="M13.2 4.05v4.2h4.05M9 12h6M9 15.4h6M9 18.8h3.2" /></>;
    case 'folders': case 'folder': return <><path d="M3.8 7.25c0-1.1.9-2 2-2h4.15l1.62 1.75h6.63c1.1 0 2 .9 2 2v8.55c0 1.1-.9 2-2 2H5.8c-1.1 0-2-.9-2-2Z" /><path d="M4.3 9.4h15.4" /></>;
    case 'activity': return <><path d="M5 7h14M5 12h14M5 17h14" /><path d="M7.4 7h.02M10.2 12h.02M8.6 17h.02" /></>;
    case 'skills': case 'magic': return <><path d="M12 3.7 13.7 9l5.15 1.85-5.15 1.9L12 18.3l-1.7-5.55-5.15-1.9L10.3 9Z" /><path d="M18.1 3.9v3.2M19.7 5.5h-3.2M5.7 16.3v2.5M7 17.55H4.45" /></>;
    case 'clients': case 'customer': case 'user': return <><circle cx="12" cy="8" r="3.25" /><path d="M5.7 19.2c.7-3.35 3-5.1 6.3-5.1s5.6 1.75 6.3 5.1" /></>;
    case 'settings': return <><path d="M12 8.55a3.45 3.45 0 1 0 0 6.9 3.45 3.45 0 0 0 0-6.9Z" /><path d="m12 3.6 1.35 2.05 2.45.35.85 2.3 2.15 1.15-.3 2.45 1.35 2.05-1.7 1.78-.3 2.44-2.38.58-1.7 1.78L12 19.45l-2.27 1.08-1.7-1.78-2.38-.58-.3-2.44-1.7-1.78L5 11.9l-.3-2.45L6.85 8.3 7.7 6l2.45-.35Z" /></>;
    case 'web': case 'preview': return <><rect x="3.8" y="5.25" width="16.4" height="13.5" rx="2.35" /><path d="M4.25 9.2h15.5M8.2 14.2h7.6" /></>;
    case 'theme': return <><path d="M12.4 3.95a7.7 7.7 0 1 0 7.15 10.6A6.15 6.15 0 0 1 12.4 3.95Z" /></>;
    case 'sync': return <><path d="M18.5 7.7A7.45 7.45 0 0 0 5.2 9.3M18.5 7.7V4.55M18.5 7.7h-3.15M5.5 16.3a7.45 7.45 0 0 0 13.3-1.6M5.5 16.3v3.15M5.5 16.3h3.15" /></>;
    case 'plus': return <><path d="M12 5.2v13.6M5.2 12h13.6" /></>;
    case 'search': return <><circle cx="10.8" cy="10.8" r="5.6" /><path d="m15.05 15.05 4 4" /></>;
    case 'edit': return <><path d="M5.2 16.95 4.6 20l3.05-.6L18.7 8.35l-2.45-2.45Z" /><path d="m14.8 7.35 2.45 2.45" /></>;
    case 'trash': return <><path d="M5.8 7.1h12.4M9 7.1V5.45h6V7.1M7.25 9.35l.7 10.1h8.1l.7-10.1" /><path d="M10.4 11.8v5M13.6 11.8v5" /></>;
    case 'close': return <><path d="M6.7 6.7 17.3 17.3M17.3 6.7 6.7 17.3" /></>;
    case 'back': return <><path d="m14.5 6.2-5.8 5.8 5.8 5.8" /></>;
    case 'expand': return <><path d="M8.7 4.8H4.8v3.9M15.3 4.8h3.9v3.9M8.7 19.2H4.8v-3.9M15.3 19.2h3.9v-3.9" /></>;
    case 'collapse': return <><path d="M9.1 5.1v4h-4M14.9 5.1v4h4M9.1 18.9v-4h-4M14.9 18.9v-4h4" /></>;
    case 'context': return <><path d="M4.7 6.2h14.6v11.6H4.7Z" /><path d="M8 9.3h8M8 12h8M8 14.7h4.6" /></>;
    case 'output': return <><path d="M12 4.2 19.8 12 12 19.8 4.2 12Z" /><path d="M8.9 12h6.2" /></>;
    case 'contract': return <><path d="M7.2 3.8h7.15l2.45 2.45v13.95H7.2Z" /><path d="M14.05 3.95V6.6h2.55M9.7 10.3h4.6M9.7 13.3h4.6M9.7 16.3h2.4" /></>;
    case 'reminder': case 'calendar': return <><rect x="4.7" y="5.8" width="14.6" height="13.2" rx="2.2" /><path d="M8 4v3.5M16 4v3.5M4.9 9.45h14.2" /><circle cx="12" cy="14.2" r="1.7" /></>;
    case 'table': return <><rect x="4.4" y="5.3" width="15.2" height="13.4" rx="2" /><path d="M4.7 10h14.6M9.2 5.6v12.8M14.8 5.6v12.8" /></>;
    case 'form': return <><path d="M6.1 4.4h11.8v15.2H6.1Z" /><path d="M8.7 8.4h6.6M8.7 11.7h6.6M8.7 15h3.8" /></>;
    case 'checklist': return <><path d="m6 7.5 1.6 1.55L10.5 6M6 13l1.6 1.55L10.5 11.5M13 8h5M13 13.5h5M6 18h12" /></>;
    case 'products': return <><path d="M5.4 7.4 12 4l6.6 3.4v8.3L12 20l-6.6-4.3Z" /><path d="m5.75 7.65 6.25 3.25 6.25-3.25M12 10.9v8.4" /></>;
    case 'quotes': return <><path d="M6.1 5.7h11.8v12.6H6.1Z" /><path d="M8.4 9h7.2M8.4 12h7.2M8.4 15h4" /></>;
    case 'invoice': return <><path d="M7 4.7h10v14.6l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2Z" /><path d="M9.4 8.4h5.2M9.4 12h5.2M9.4 15.2h3.1" /></>;
    case 'email': return <><rect x="4.4" y="6.4" width="15.2" height="11.2" rx="2" /><path d="m5.3 7.7 6.7 5 6.7-5" /></>;
    case 'ticket': return <><path d="M5.3 7.3h13.4v3.1a2 2 0 0 0 0 3.2v3.1H5.3v-3.1a2 2 0 0 0 0-3.2Z" /><path d="M12 7.8v8.4" /></>;
    case 'image': return <><rect x="4.5" y="5.2" width="15" height="13.6" rx="2.1" /><circle cx="9" cy="9.3" r="1.4" /><path d="m6.8 16.8 3.6-3.8 2.5 2.35 1.9-2 2.6 3.45" /></>;
    case 'terminal': return <><path d="m5.6 8.2 3.7 3.8-3.7 3.8M11.1 16.1h7.3" /></>;
    case 'upload': return <><path d="M12 17.7V5.9M7.3 10.4 12 5.7l4.7 4.7M5 19h14" /></>;
    case 'download': return <><path d="M12 5.8v11.8M7.3 13.1 12 17.8l4.7-4.7M5 19h14" /></>;
    case 'success': return <><path d="m5.6 12.7 4 3.9 8.8-9.2" /></>;
    case 'error': return <><path d="M12 5v8.2M12 17.8h.02" /></>;
    case 'warning': return <><path d="M12 4.6 20.2 19H3.8Z" /><path d="M12 9.4v4.2M12 16.7h.02" /></>;
  }
}

export function EmptyState({ icon, title, children, action }: { icon: GlassIconName | ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  const visual = typeof icon === 'string' ? <GlassIcon name={icon as GlassIconName} /> : icon;
  return <div className="empty-state"><span className="empty-icon">{visual}</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

const toolIcons: Partial<Record<ToolName, GlassIconName>> = {
  read_file: 'file', list_dir: 'folders', search_files: 'search', write_file: 'edit', edit_file: 'edit',
  create_file: 'plus', delete_file: 'trash', run_shell: 'terminal', onar_action: 'skills', onar_upload: 'upload', request_form: 'form',
};

export function ToolCard({ tool, title, command, status, preview, isDiff }: { tool: ToolName; title: string; command: string; status: 'running' | 'done' | 'error'; preview?: string; isDiff?: boolean }) {
  return (
    <div className={`tool-card status-${status}`}>
      <div className="tool-card-head">
        <GlassIcon name={toolIcons[tool] ?? 'file'} className={`tool-icon tool-${tool}`} />
        <span className="tool-title">{title}</span>
        <code className="tool-cmd">{command}</code>
        <span className={`tool-state ${status}`}>{status === 'running' ? <i className="spin" /> : status === 'done' ? <GlassIcon name="success" bare /> : <GlassIcon name="error" bare />}</span>
      </div>
      {preview && (
        <details className="tool-result" open={status === 'error'}>
          <summary>Risultato</summary>
          {isDiff
            ? <pre className="diff">{preview.split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}{'\n'}</span>)}</pre>
            : <pre>{preview}</pre>}
        </details>
      )}
    </div>
  );
}
