/**
 * Flags documents that likely contain sensitive data (bank details, credit
 * cards, tax IDs, or an explicit confidentiality marking). The result feeds
 * `privacy.sensitiveDetected`, which the Virtual Workspace uses to protect the
 * file in cloud/hybrid retrieval — local-first stays the default, and nothing
 * sensitive leaks to the cloud without an explicit user choice.
 *
 * Detection is regex + Luhn, deterministic and offline. It errs toward flagging.
 */

export interface SensitiveResult {
  sensitive: boolean;
  reasons: string[];
}

const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const CODICE_FISCALE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
const VAT = /\b(?:p\.?\s?iva|partita iva|vat)\.?\s*:?\s*(?:it)?\s*\d{11}\b/gi;
// Candidate card numbers: 13–19 digits, possibly grouped by spaces/dashes.
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
const KEYWORDS: Array<[RegExp, string]> = [
  [/\bpassword\b|\bpwd\b/i, 'password'],
  [/\bcvv\b|\bcvc\b/i, 'cvv'],
  [/carta di credito|credit card/i, 'carta di credito'],
  [/\briservat[oa]\b|confidenzial|\bconfidential\b/i, 'contrassegno riservato'],
  [/codice fiscale/i, 'codice fiscale'],
  [/\biban\b/i, 'iban'],
];

export function detectSensitive(text: string): SensitiveResult {
  if (!text) return { sensitive: false, reasons: [] };
  const reasons = new Set<string>();

  if (IBAN.test(text)) reasons.add('IBAN');
  if (CODICE_FISCALE.test(text)) reasons.add('codice fiscale');
  if (VAT.test(text)) reasons.add('partita IVA');

  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      reasons.add('numero di carta');
      break;
    }
  }

  for (const [pattern, label] of KEYWORDS) {
    if (pattern.test(text)) reasons.add(label);
  }

  return { sensitive: reasons.size > 0, reasons: [...reasons] };
}

/** Standard Luhn checksum — rejects random digit runs that aren't card numbers. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
