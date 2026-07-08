import { describe, expect, it } from 'vitest';
import { catalogById, LOCAL_ACTION_CATALOG, validCatalog } from '../src/main/services/action-catalog';
import { detectIntent } from '../src/main/services/assistant-actions';

describe('Action Catalog', () => {
  it('contains the core Magic Panel workflows with schemas and confirmation policies', () => {
    const catalog = catalogById();
    for (const id of ['clients.create', 'users.create', 'contracts.create', 'reminders.create']) {
      expect(catalog[id]).toBeDefined();
      expect(catalog[id].fieldSchema.length).toBeGreaterThan(0);
      expect(catalog[id].confirmationRequired).toBe(true);
    }
    expect(catalog['quotes.create'].route).toBe('/sales-proposals/create');
    expect(catalog['quotes.create'].mode).toBe('view');
    expect(catalog['clients.create'].actionType).toBe('create_unified_contact');
    expect(catalog['clients.create'].route).toBe('/clienti/anagrafica');
    expect(catalog['clients.create'].fieldSchema.find((field) => field.key === 'functions')?.options).toEqual([
      { label: 'Cliente', value: 'customer' },
    ]);
  });

  it('detects create and view intents from catalog aliases', () => {
    expect(detectIntent('Crea un cliente Mario Rossi mario@example.com')?.action).toBe('clients.create');
    expect(detectIntent('Apri calendario')?.action).toBe('calendar.open');
    expect(detectIntent('Crea un utente per la collaboratrice')?.action).toBe('users.create');
  });

  it('never confuses quotes with contracts', () => {
    const quotePrompts = [
      'aiutami a creare un preventivo',
      'preparami un preventivo',
      'fammi una proposta commerciale',
      'genera una offerta commerciale',
    ];
    for (const prompt of quotePrompts) {
      expect(detectIntent(prompt)?.action, prompt).toBe('quotes.create');
      expect(detectIntent(prompt)?.action, prompt).not.toBe('contracts.create');
    }
    expect(detectIntent('aiutami a creare un contratto')?.action).toBe('contracts.create');
  });

  it('accepts backend catalog envelopes and rejects invalid payloads', () => {
    expect(validCatalog({ actions: LOCAL_ACTION_CATALOG })?.length).toBe(LOCAL_ACTION_CATALOG.length);
    expect(validCatalog({ actions: [{ id: 'broken' }] })).toBeNull();
    expect(validCatalog(null)).toBeNull();
  });
});
