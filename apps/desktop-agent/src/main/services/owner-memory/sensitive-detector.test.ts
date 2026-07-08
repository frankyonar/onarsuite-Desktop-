import { describe, expect, it } from 'vitest';
import { detectSensitive } from './sensitive-detector';

describe('detectSensitive', () => {
  it('flags a valid credit card number (Luhn)', () => {
    const r = detectSensitive('Pagamento con carta 4111 1111 1111 1111 grazie');
    expect(r.sensitive).toBe(true);
    expect(r.reasons).toContain('numero di carta');
  });

  it('does not flag a random 16-digit run that fails Luhn', () => {
    const r = detectSensitive('Codice ordine 1234 5678 9012 3456 confermato');
    expect(r.reasons).not.toContain('numero di carta');
  });

  it('flags IBAN and codice fiscale', () => {
    expect(detectSensitive('IBAN IT60X0542811101000000123456').sensitive).toBe(true);
    expect(detectSensitive('CF: RSSMRA85T10A562S').reasons).toContain('codice fiscale');
  });

  it('flags confidentiality markings and password keywords', () => {
    expect(detectSensitive('Documento riservato — non diffondere').sensitive).toBe(true);
    expect(detectSensitive('la password è 1234').reasons).toContain('password');
  });

  it('returns not sensitive for ordinary text', () => {
    expect(detectSensitive('Promemoria: comprare il latte domani')).toEqual({ sensitive: false, reasons: [] });
    expect(detectSensitive('')).toEqual({ sensitive: false, reasons: [] });
  });
});
