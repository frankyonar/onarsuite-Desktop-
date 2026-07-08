import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MagicField, PanelData } from '../../shared/types';
import { Button } from './components';

type Notice = { tone: 'success' | 'error' | 'warning'; text: string };

export function ActionFormRenderer({ panel, grantedPermissions, onNotice, onCompleted }: {
  panel: PanelData;
  grantedPermissions: string[];
  onNotice: (notice: Notice) => void;
  onCompleted?: (message: string) => void;
}) {
  const initial = useMemo(() => Object.fromEntries(Object.entries(panel.values ?? {}).map(([key, value]) => [key, value == null ? '' : String(value)])), [panel]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<string>();
  const schema = panel.schema ?? [];
  const missingPermissions = (panel.permissions ?? []).filter((permission) => grantedPermissions.length > 0 && !grantedPermissions.includes(permission));

  useEffect(() => { setValues(initial); setReviewing(false); setCompleted(undefined); }, [initial, panel.action]);

  const update = (field: MagicField, value: string) => setValues((current) => ({ ...current, [field.key]: value }));
  const validate = () => schema.filter((field) => field.required && !values[field.key]?.trim());

  const execute = async () => {
    if (!panel.actionType) return;
    const missing = validate();
    if (missing.length) {
      onNotice({ tone: 'warning', text: `Completa i campi obbligatori: ${missing.map((field) => field.label).join(', ')}.` });
      setReviewing(false);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const field of schema) {
      const value = values[field.key]?.trim() ?? '';
      if (!value && !field.required) continue;
      payload[field.key] = field.type === 'number' && value ? Number(value) : field.type === 'checkbox' ? value === 'true' : value;
    }
    const result = await window.maxDesktop.onar(panel.actionType, payload);
    setBusy(false);
    if (result.success) {
      setCompleted(result.message);
      setReviewing(false);
      onNotice({ tone: 'success', text: result.message });
      onCompleted?.(result.message);
    } else onNotice({ tone: 'error', text: result.message });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (panel.confirmationRequired && !reviewing) {
      const missing = validate();
      if (missing.length) onNotice({ tone: 'warning', text: `Completa i campi obbligatori: ${missing.map((field) => field.label).join(', ')}.` });
      else setReviewing(true);
      return;
    }
    void execute();
  };

  if (completed) return <div className="magic-complete"><span>✓</span><strong>Operazione completata</strong><p>{completed}</p></div>;

  return <form className="magic-form" onSubmit={submit}>
    {missingPermissions.length > 0 && <div className="magic-policy"><strong>Permessi richiesti</strong><span>Il backend verificherà: {missingPermissions.join(', ')}.</span></div>}
    {panel.dangerous && <div className="magic-danger"><strong>Azione sensibile</strong><span>Controlla attentamente i dati prima di confermare.</span></div>}
    {reviewing ? <div className="magic-review">
      <h4>Controlla prima di confermare</h4>
      <dl>{schema.filter((field) => values[field.key]).map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{values[field.key]}</dd></div>)}</dl>
      <p>L’azione sarà inviata a OnarSuite e registrata nell’audit.</p>
    </div> : <div className="magic-fields">
      {schema.map((field) => <label key={field.key} className={field.type === 'checkbox' ? 'magic-check' : undefined}>
        <span>{field.label}{field.required && <b> *</b>}</span>
        {renderField(field, values[field.key] ?? '', (value) => update(field, value))}
        {field.description && <small>{field.description}</small>}
      </label>)}
    </div>}
    <div className="magic-actions">
      {reviewing && <Button type="button" variant="secondary" disabled={busy} onClick={() => setReviewing(false)}>Modifica</Button>}
      <Button type="submit" disabled={busy || !panel.actionType}>{busy ? 'Esecuzione…' : reviewing ? 'Conferma ed esegui' : panel.confirmationRequired ? 'Continua' : 'Esegui'}</Button>
    </div>
  </form>;
}

function renderField(field: MagicField, value: string, onChange: (value: string) => void) {
  if (field.type === 'textarea') return <textarea value={value} required={field.required} placeholder={field.placeholder} rows={4} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === 'select') return <select value={value} required={field.required} onChange={(event) => onChange(event.target.value)}><option value="">Seleziona…</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  if (field.type === 'checkbox') return <input type="checkbox" checked={value === 'true'} onChange={(event) => onChange(String(event.target.checked))} />;
  return <input type={field.type ?? 'text'} value={value} required={field.required} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
}
