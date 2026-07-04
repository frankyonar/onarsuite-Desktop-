# API OnarSuite Agent Gateway

Base path: `/api/agent`. Autenticazione: bearer token dispositivo, hashato lato server, con scope e revoca per singolo device. Tutte le richieste accettano JSON; gli upload usano multipart.

## Endpoint MVP

| Metodo | Endpoint | Funzione |
| --- | --- | --- |
| POST | `/devices/pair` | Registra e abbina il dispositivo |
| POST | `/devices/{device}/heartbeat` | Aggiorna stato e versione |
| GET | `/devices/{device}/commands` | Polling comandi |
| PATCH | `/commands/{command}/status` | Stato esecuzione |
| POST | `/events` | Audit/evento remoto |
| POST | `/artifacts` | Upload file multipart |
| POST | `/actions/execute` | Esegue un’azione del catalogo dopo verifica permessi |
| POST | `/actions/task-from-file` | Crea task da testo/file |
| POST | `/actions/customer-draft-from-file` | Crea cliente in bozza |
| POST | `/actions/quote-draft-from-file` | Crea preventivo in bozza |

## Pairing

Input: `device_name`, `platform`, `app_version`, `device_fingerprint`, `pairing_code` opzionale. Output: `device_id`, `device_uuid`, `access_token`, `expires_at`, `account_label` opzionale.

## Idempotenza e limiti

Upload e azioni inviano `Idempotency-Key`. Il server deve applicare rate limit per utente e dispositivo, heartbeat minimo 30-60 secondi, upload massimo configurabile e risposta `401/403` per token scaduti o device revocati.

## Chat Max Desktop

`POST /api/max/desktop/chat`

Richiede il token dell'Agent Device. Il client invia `device_id`, il messaggio, gli ultimi 20 messaggi della conversazione e, solo quando scelto esplicitamente dall'utente, un `file_context` con nome e testo estratto. La risposta deve contenere `message` oppure `content`.

## Agent loop e assistant actions

| Metodo | Endpoint | Funzione |
| --- | --- | --- |
| POST | `/api/max/desktop/agent` | Step del loop tool-use di Max |
| POST | `/api/assistant/actions` | Prepara una route web autenticata e precompilata |
| GET | `/api/assistant/actions/{actionId}` | Stato del workflow preparato |
| GET | `/api/assistant/actions/catalog` | Catalogo azioni, schema Magic Panel, permessi e policy di conferma |
| GET | `/desktop/web-login` | Crea una sessione web autenticata per il dock |
| GET | `/desktop/authorize` | Avvia il login/pairing via browser e deep link |

Il catalogo restituisce un array `ActionDefinition` (direttamente o sotto `actions`) con `id`, `label`, `description`, `skill`, `mode`, `route`, `actionType`, `requiredFields`, `optionalFields`, `fieldSchema`, `permissions`, `confirmationRequired`, `dangerous` e `resultPanelKind`. Il desktop ha un fallback locale, ma il backend resta autorevole per autorizzazione e scope.

## Errori

Risposte JSON coerenti con `message`, `code` e `errors` opzionali. Codici minimi: 401 token non valido, 403 revocato/scope negato, 413 file troppo grande, 415 formato non supportato, 422 payload invalido, 429 rate limit.
