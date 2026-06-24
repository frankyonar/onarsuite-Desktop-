import type { ButtonHTMLAttributes, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ConnectionState, ToolName } from '../../shared/types';

/** Renders chat content as Markdown with GFM tables/lists and syntax-highlighted
 *  code blocks — handles any text, code or formatting Max returns. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
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

/** The OnarSuite molecule app icon, used wherever the brand mark appears. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return <img className="brand-icon" src={ONAR_ICON} alt="OnarSuite" width={size} height={size} style={{ width: size, height: size }} />;
}

/** The "onarsuite" wordmark (onar bold + suite light), theme-aware via CSS. */
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

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

const toolIcons: Partial<Record<ToolName, string>> = {
  read_file: '▤', list_dir: '▸', search_files: '⌕', write_file: '✎', edit_file: '✎',
  create_file: '＋', delete_file: '⌫', run_shell: '❯', onar_action: '◆', onar_upload: '↥',
};

/** A Claude-Code-style tool-call card: action, monospace command, status and an
 *  expandable result (diff or shell output). The visual centerpiece of a run. */
export function ToolCard({ tool, title, command, status, preview, isDiff }: { tool: ToolName; title: string; command: string; status: 'running' | 'done' | 'error'; preview?: string; isDiff?: boolean }) {
  return (
    <div className={`tool-card status-${status}`}>
      <div className="tool-card-head">
        <span className={`tool-icon tool-${tool}`}>{toolIcons[tool] ?? '◇'}</span>
        <span className="tool-title">{title}</span>
        <code className="tool-cmd">{command}</code>
        <span className={`tool-state ${status}`}>{status === 'running' ? <i className="spin" /> : status === 'done' ? '✓' : '✗'}</span>
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
