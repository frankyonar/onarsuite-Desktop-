import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ConnectionState } from '../../shared/types';

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

const connectionLabels: Record<ConnectionState, string> = {
  connected: 'Connesso', offline: 'Offline', not_paired: 'Non collegato', revoked: 'Revocato', error: 'Errore',
};

export function StatusPill({ state }: { state: ConnectionState }) {
  return <span className={`status status-${state}`}><i />{connectionLabels[state]}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
