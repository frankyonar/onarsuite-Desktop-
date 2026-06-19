# Max Desktop - guida tecnica

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

## UI

Schermate: pairing, panoramica, file workspace, cartelle autorizzate, registro e impostazioni. Upload e azioni OnarSuite mostrano sempre una conferma esplicita.
