import type { ActionDefinition } from '../../shared/types';

/** Local, versioned fallback. The backend catalog remains the source of truth. */
export const LOCAL_ACTION_CATALOG: ActionDefinition[] = [
  {
    id: 'clients.create', label: 'Crea cliente', description: 'Crea un contatto CRM.', skill: 'CRM', mode: 'create',
    route: '/bookings/customers', actionType: 'create_customer', requiredFields: ['name', 'email'],
    optionalFields: ['phone', 'notes'], permissions: ['create-booking-customers'], confirmationRequired: true,
    resultPanelKind: 'customer', aliases: ['crea cliente', 'nuovo cliente', 'aggiungi cliente', 'create customer'],
    fieldSchema: [
      { key: 'name', label: 'Nome completo', required: true }, { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Telefono', type: 'tel' }, { key: 'notes', label: 'Note', type: 'textarea' },
    ],
  },
  {
    id: 'clients.list', label: 'Apri clienti', description: 'Apre l’elenco clienti.', skill: 'CRM', mode: 'view',
    route: '/bookings/customers', actionType: 'list_leads', requiredFields: [], optionalFields: [], fieldSchema: [],
    permissions: ['manage-booking-customers'], confirmationRequired: false,
    aliases: ['mostrami i clienti', 'apri clienti', 'vai ai clienti', 'elenca clienti', 'lista clienti'],
  },
  {
    id: 'users.create', label: 'Crea utente', description: 'Crea un utente e assegna il ruolo.', skill: 'Team', mode: 'create',
    route: '/users', actionType: 'create_user', requiredFields: ['name', 'email', 'role_id'], optionalFields: ['mobile_no'],
    permissions: ['create-user'], confirmationRequired: true, resultPanelKind: 'customer',
    aliases: ['crea utente', 'crea un utente', 'nuovo utente', 'aggiungi utente', 'crea collaboratore'],
    fieldSchema: [
      { key: 'name', label: 'Nome completo', required: true }, { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'role_id', label: 'ID ruolo', type: 'number', required: true, description: 'Ruolo autorizzato nell’account OnarSuite.' },
      { key: 'mobile_no', label: 'Telefono', type: 'tel' },
    ],
  },
  {
    id: 'contracts.create', label: 'Crea contratto', description: 'Prepara una bozza di contratto.', skill: 'Contratti', mode: 'create',
    route: '/onar-contracts/create', actionType: 'create_contract', requiredFields: ['subject', 'client_email', 'value', 'type_name', 'start_date', 'end_date'],
    optionalFields: ['payment_terms', 'description', 'notes'],
    permissions: ['create-contracts'], confirmationRequired: true, resultPanelKind: 'contract',
    aliases: ['crea contratto', 'nuovo contratto', 'prepara contratto', 'bozza contratto'],
    fieldSchema: [
      { key: 'subject', label: 'Oggetto', required: true }, { key: 'client_email', label: 'Email cliente', type: 'email', required: true },
      { key: 'value', label: 'Importo (EUR)', type: 'number', required: true }, { key: 'type_name', label: 'Tipo contratto', required: true },
      { key: 'payment_terms', label: 'Termini di pagamento' }, { key: 'start_date', label: 'Data inizio', type: 'date', required: true },
      { key: 'end_date', label: 'Data fine', type: 'date', required: true }, { key: 'description', label: 'Descrizione', type: 'textarea' },
      { key: 'notes', label: 'Note interne', type: 'textarea' },
    ],
  },
  {
    id: 'quotes.create', label: 'Nuovo preventivo', description: 'Apre il builder preventivi autenticato.', skill: 'Preventivi', mode: 'view',
    route: '/sales-proposals/create', actionType: 'create_quote', requiredFields: [], optionalFields: [],
    permissions: ['create-sales-quotes'], confirmationRequired: false, resultPanelKind: 'result',
    aliases: ['crea preventivo', 'crea un preventivo', 'nuovo preventivo', 'prepara preventivo', 'prepara un preventivo'],
    fieldSchema: [],
  },
  {
    id: 'reminders.create', label: 'Crea promemoria', description: 'Crea una scadenza o attività.', skill: 'Promemoria', mode: 'create',
    route: '/reminder', actionType: 'create_reminder', requiredFields: ['name', 'reminder_date'],
    optionalFields: ['send_time', 'description', 'priority', 'kind', 'client_id', 'channels'], permissions: ['create-reminder'],
    confirmationRequired: true, resultPanelKind: 'reminder', aliases: ['crea promemoria', 'nuovo promemoria', 'ricordami', 'metti promemoria'],
    fieldSchema: [
      { key: 'name', label: 'Titolo', required: true }, { key: 'reminder_date', label: 'Data', type: 'date', required: true },
      { key: 'send_time', label: 'Ora', type: 'time' }, { key: 'priority', label: 'Priorità', type: 'select', options: [{ label: 'Bassa', value: 'low' }, { label: 'Media', value: 'medium' }, { label: 'Alta', value: 'high' }] },
      { key: 'description', label: 'Descrizione', type: 'textarea' },
    ],
  },
  {
    id: 'calendar.open', label: 'Apri calendario', description: 'Apre il calendario OnarSuite.', skill: 'Calendar', mode: 'view',
    route: '/calendar', actionType: 'calendar_list_events', requiredFields: [], optionalFields: [], fieldSchema: [],
    permissions: ['view-booking-appointments'], confirmationRequired: false, aliases: ['apri calendario', 'mostrami calendario', 'vai al calendario'],
  },
  {
    id: 'calendar.create', label: 'Crea appuntamento', description: 'Crea un evento di calendario.', skill: 'Calendar', mode: 'create',
    route: '/calendar/create', actionType: 'calendar_create_event', requiredFields: ['title', 'start_datetime'],
    optionalFields: ['end_datetime', 'location', 'description', 'target'], permissions: ['create-booking-appointments'], confirmationRequired: true,
    aliases: ['nuovo appuntamento', 'crea appuntamento', 'metti appuntamento'],
    fieldSchema: [
      { key: 'title', label: 'Titolo', required: true }, { key: 'start_datetime', label: 'Inizio', type: 'datetime-local', required: true },
      { key: 'end_datetime', label: 'Fine', type: 'datetime-local' }, { key: 'location', label: 'Luogo' },
      { key: 'target', label: 'Calendario', type: 'select', options: [{ label: 'OnarSuite', value: 'internal' }, { label: 'Google', value: 'google' }, { label: 'Entrambi', value: 'both' }] },
      { key: 'description', label: 'Descrizione', type: 'textarea' },
    ],
  },
];

export function catalogById(catalog: ActionDefinition[] = LOCAL_ACTION_CATALOG): Record<string, ActionDefinition> {
  return Object.fromEntries(catalog.map((definition) => [definition.id, definition]));
}

export function validCatalog(value: unknown): ActionDefinition[] | null {
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { actions?: unknown }).actions)
    ? (value as { actions: unknown[] }).actions : null;
  if (!raw) return null;
  const actions = raw.filter((item): item is ActionDefinition => Boolean(item && typeof item === 'object'
    && typeof (item as ActionDefinition).id === 'string' && typeof (item as ActionDefinition).actionType === 'string'
    && Array.isArray((item as ActionDefinition).fieldSchema)));
  return actions.length ? actions : null;
}
