import { describe, expect, it } from 'vitest';
import { detectOnarSuiteNavigation } from '../src/main/services/onarsuite-navigation';

describe('deterministic OnarSuite navigation', () => {
  it.each([
    ['apri profilo attività', '/settings#business-profile-settings'],
    ['aprimi l’anagrafica utente', '/clienti/utenti'],
    ['mostrami anagrafica clienti', '/clienti/anagrafica'],
    ['vai ai preventivi', '/sales-proposals'],
    ['apri nuova fattura', '/sales-invoices/create'],
    ['il dock sulle info aziendali', '/settings#business-profile-settings'],
  ])('routes %s', (message, expected) => {
    expect(detectOnarSuiteNavigation(message)?.path).toBe(expected);
  });

  it('resolves a follow-up pronoun from recent context', () => {
    const result = detectOnarSuiteNavigation('aprilo', [
      { id: '1', role: 'user', content: 'Vorrei vedere il profilo attività', createdAt: new Date().toISOString() },
    ]);
    expect(result?.path).toBe('/settings#business-profile-settings');
  });

  it('accepts only onarsuite.com URLs', () => {
    expect(detectOnarSuiteNavigation('apri https://onarsuite.com/reminder')?.path).toBe('/reminder');
    expect(detectOnarSuiteNavigation('apri https://example.com/reminder')).toBeNull();
  });
});
