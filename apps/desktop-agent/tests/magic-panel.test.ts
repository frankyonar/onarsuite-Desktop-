import { describe, expect, it } from 'vitest';
import { buildPanel } from '../src/main/services/agent-engine';

describe('Magic Panel', () => {
  it('converts request_form output into an executable dynamic form panel', () => {
    const args = {
      action: 'users.create', action_type: 'create_user', title: 'Nuovo utente',
      description: 'Crea un accesso OnarSuite', confirmation_required: true,
      fields: [{ key: 'name', label: 'Nome', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }],
      prefill: { name: 'Mario Rossi' },
    };
    const panel = buildPanel('request_form', args, { ok: true, content: 'Form aperto', data: args });
    expect(panel).toMatchObject({ kind: 'form', action: 'users.create', actionType: 'create_user', confirmationRequired: true });
    expect(panel?.schema).toHaveLength(2);
    expect(panel?.values).toEqual({ name: 'Mario Rossi' });
  });

  it('keeps result output visible after an OnarSuite action', () => {
    const panel = buildPanel('onar_action', { action_type: 'create_reminder', data: { name: 'Follow-up', reminder_date: '2026-07-10' } }, { ok: true, content: 'Promemoria creato.' });
    expect(panel).toMatchObject({ kind: 'reminder', title: 'Follow-up', ok: true });
  });
});
