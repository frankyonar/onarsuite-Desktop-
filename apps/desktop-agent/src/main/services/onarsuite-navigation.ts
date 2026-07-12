import type { ChatMessage } from '../../shared/types';

export interface OnarSuiteNavigationTarget { path: string; title: string }

interface RouteDefinition extends OnarSuiteNavigationTarget { aliases: string[] }

const ROUTES: RouteDefinition[] = [
  { path: '/settings#business-profile-settings', title: 'Profilo Attività', aliases: ['profilo attivita', 'profilo aziendale', 'profilo fiscale', 'informazioni aziendali', 'info aziendali', 'dati fiscali', 'partita iva', 'codice sdi', 'codice fiscale azienda', 'pec azienda'] },
  { path: '/clienti/utenti', title: 'Anagrafica utenti', aliases: ['anagrafica utente', 'anagrafica utenti', 'utenti aziendali', 'team utenti', 'collaboratori'] },
  { path: '/clienti/anagrafica', title: 'Anagrafica clienti', aliases: ['anagrafica cliente', 'anagrafica clienti', 'anagrafica unica', 'nuova anagrafica', 'contatti clienti'] },
  { path: '/clienti/anagrafiche', title: 'Clienti', aliases: ['clienti', 'elenco clienti', 'lista clienti', 'hub clienti', 'sezione clienti'] },
  { path: '/clienti/aziende', title: 'Aziende', aliases: ['aziende', 'anagrafica aziende'] },
  { path: '/clienti/ruoli', title: 'Ruoli', aliases: ['ruoli', 'ruoli utenti', 'permessi utenti'] },
  { path: '/sales-proposals/create', title: 'Nuovo preventivo', aliases: ['nuovo preventivo', 'crea preventivo', 'creazione preventivo'] },
  { path: '/sales-proposals', title: 'Preventivi', aliases: ['preventivi', 'elenco preventivi', 'lista preventivi', 'proposte commerciali'] },
  { path: '/sales-invoices/create', title: 'Nuova fattura', aliases: ['nuova fattura', 'crea fattura', 'emetti fattura'] },
  { path: '/sales-invoices', title: 'Fatture di vendita', aliases: ['fatture', 'fatture vendita', 'fatturazione', 'incassi fatture'] },
  { path: '/purchase-invoices/create', title: 'Nuova fattura acquisto', aliases: ['nuova fattura acquisto', 'registra fattura fornitore'] },
  { path: '/purchase-invoices', title: 'Fatture di acquisto', aliases: ['fatture acquisto', 'fatture fornitori', 'costi fornitori'] },
  { path: '/onar-contracts', title: 'Contratti', aliases: ['contratti', 'elenco contratti', 'gestione contratti'] },
  { path: '/calendar-view', title: 'Calendario', aliases: ['calendario', 'agenda', 'eventi calendario'] },
  { path: '/bookings', title: 'Appuntamenti', aliases: ['appuntamenti', 'prenotazioni', 'booking'] },
  { path: '/reminder/create', title: 'Nuovo promemoria', aliases: ['nuovo promemoria', 'crea promemoria'] },
  { path: '/reminder', title: 'Promemoria', aliases: ['promemoria', 'scadenze', 'attivita da fare'] },
  { path: '/ai-email/compose', title: 'Scrivi email', aliases: ['scrivi email', 'nuova email', 'componi email', 'invia email'] },
  { path: '/ai-email/settings', title: 'Impostazioni email', aliases: ['impostazioni email', 'configura email', 'account email'] },
  { path: '/ai-email', title: 'Email AI', aliases: ['email', 'posta', 'casella email', 'email ai'] },
  { path: '/media-library', title: 'Libreria documenti', aliases: ['documenti', 'libreria', 'libreria documenti', 'media library', 'file onarsuite'] },
  { path: '/notes/notes', title: 'Note', aliases: ['note', 'appunti'] },
  { path: '/product-service/items', title: 'Prodotti e servizi', aliases: ['prodotti', 'servizi', 'prodotti e servizi', 'catalogo prodotti'] },
  { path: '/product-service/item-categories', title: 'Categorie prodotti', aliases: ['categorie prodotti', 'categorie servizi'] },
  { path: '/projects', title: 'Progetti', aliases: ['progetti', 'gestione progetti'] },
  { path: '/helpdesk-tickets', title: 'Ticket assistenza', aliases: ['ticket', 'ticket assistenza', 'richieste assistenza'] },
  { path: '/helpdesk', title: 'Helpdesk', aliases: ['helpdesk', 'assistenza clienti'] },
  { path: '/messenger', title: 'Messenger', aliases: ['messenger', 'chat interna', 'messaggi interni'] },
  { path: '/site-studio', title: 'Site Studio', aliases: ['site studio', 'sito web', 'gestione sito'] },
  { path: '/automat-pdf', title: 'Creative PDF', aliases: ['creative pdf', 'automat pdf', 'crea pdf'] },
  { path: '/google-contacts', title: 'Contatti Google', aliases: ['contatti google', 'google contacts'] },
  { path: '/google-drive/settings', title: 'Impostazioni Google Drive', aliases: ['configura google drive', 'collega google drive', 'impostazioni google drive', 'accesso google drive'] },
  { path: '/googledrives/general/root', title: 'Google Drive', aliases: ['google drive', 'file drive', 'cartella drive'] },
  { path: '/form-builder', title: 'Form Builder', aliases: ['form builder', 'moduli', 'crea modulo'] },
  { path: '/settings', title: 'Impostazioni', aliases: ['impostazioni', 'configurazione', 'settaggi'] },
  { path: '/profile', title: 'Profilo personale', aliases: ['profilo personale', 'il mio profilo', 'account personale'] },
  { path: '/local-command-center', title: 'Centro di comando', aliases: ['centro di comando', 'command center', 'cabina di regia'] },
  { path: '/dashboard', title: 'Dashboard', aliases: ['dashboard', 'home', 'panoramica azienda'] },
  { path: '/account', title: 'Contabilità', aliases: ['contabilita', 'accounting'] },
  { path: '/hrm', title: 'Risorse umane', aliases: ['risorse umane', 'hrm', 'personale'] },
  { path: '/crm', title: 'CRM', aliases: ['crm', 'pipeline commerciale'] },
  { path: '/sales', title: 'Vendite', aliases: ['vendite', 'area vendite'] },
  { path: '/pos', title: 'Punto vendita', aliases: ['pos', 'punto vendita'] },
  { path: '/plans', title: 'Piani', aliases: ['piani', 'abbonamento'] },
  { path: '/add-ons', title: 'App e add-on', aliases: ['add on', 'addon', 'app store', 'moduli aggiuntivi'] },
];

const OPEN_INTENT = /\b(apri|aprimi|apriamo|mostra|mostrami|vai|portami|naviga|carica|visualizza|entra|dock)\b/i;
const PRONOUN_OPEN = /\b(aprilo|aprila|apri quella|apri quello|procedi|fallo|allora)\b/i;

export function detectOnarSuiteNavigation(message: string, history: ChatMessage[] = []): OnarSuiteNavigationTarget | null {
  const directUrl = extractAllowedUrl(message);
  if (directUrl && OPEN_INTENT.test(normalize(message))) return directUrl;

  const normalized = normalize(message);
  const direct = bestRoute(normalized);
  if (direct && (OPEN_INTENT.test(normalized) || normalized.length <= 70)) return direct;

  if (PRONOUN_OPEN.test(normalized)) {
    for (const item of [...history].reverse()) {
      const previous = bestRoute(normalize(item.content));
      if (previous) return previous;
    }
  }
  return null;
}

function bestRoute(text: string): OnarSuiteNavigationTarget | null {
  let match: { route: RouteDefinition; length: number } | undefined;
  for (const route of ROUTES) {
    for (const alias of route.aliases) {
      if (text.includes(alias) && (!match || alias.length > match.length)) match = { route, length: alias.length };
    }
  }
  return match ? { path: match.route.path, title: match.route.title } : null;
}

function extractAllowedUrl(message: string): OnarSuiteNavigationTarget | null {
  const candidate = message.match(/https?:\/\/[^\s]+/i)?.[0];
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'onarsuite.com') return null;
    return { path: `${url.pathname}${url.search}${url.hash}` || '/', title: 'OnarSuite' };
  } catch { return null; }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9:/#?._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
