# OnarSuite Desktop - Max e Magic Panel

## Installazione e avvio

Dal root del repository eseguire `npm install` e `npm run dev`. La build verificata si genera con `npm run build`.

## Pairing

L'utente inserisce l'URL HTTPS OnarSuite, assegna un nome al dispositivo e, se richiesto, un codice pairing. Il token restituito viene cifrato tramite il sistema operativo.

## Workspace e file

La workspace predefinita è `Documenti/OnarSuite Workspace`. I file scelti o trascinati vengono copiati qui. Altre cartelle sono leggibili solo dopo autorizzazione con dialog nativo. Sono supportati PDF, DOCX, XLSX, CSV, TXT e Markdown.

## Sincronizzazione

Heartbeat e retry partono ogni 60 secondi. In assenza di rete le azioni vengono registrate in una coda locale JSON con chiave di idempotenza; il file deve restare in un percorso autorizzato fino al completamento.

## Log e configurazione

Config, queue e audit sono salvati nella directory `userData/max-desktop` di Electron con permessi utente. Il log è JSONL e conserva solo metadati minimi.

## UI AI-first

La chat è l’ingresso principale. Il dock laterale è il Magic Panel e supporta webview autenticata, contesto, file, attività, output e form dinamici. I moduli sono presentati come Skills di Max; Max decide se usare chat, form nativo, file/output o una route web OnarSuite.

## Action Catalog e form dinamici

Il desktop prova a caricare `GET /api/assistant/actions/catalog` e usa il catalogo locale versionato quando l’endpoint non è disponibile. Ogni definizione contiene skill, modalità, route, action type, campi, permessi, conferma e tipo di risultato.

Il tool agente `request_form` apre un form nel Magic Panel senza eseguire l’azione. Il renderer valida i campi obbligatori, mostra una preview quando `confirmationRequired` è attivo e solo dopo la conferma chiama `/api/agent/actions/execute`. Il backend verifica comunque token, account, piano e permessi ed è la fonte di verità.
