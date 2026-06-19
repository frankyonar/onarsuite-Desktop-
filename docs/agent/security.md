# Sicurezza Max Desktop

## Confini di fiducia

- Il renderer è non privilegiato e isolato.
- Il preload espone solo operazioni nominate.
- Il processo main valida ogni percorso e ogni azione.
- OnarSuite è raggiungibile solo tramite HTTPS, eccetto localhost in sviluppo.

## File e permessi

Sono leggibili soltanto OnarSuite Workspace e le cartelle scelte con il dialog di sistema. I percorsi vengono canonicalizzati con `realpath` per ridurre traversal e bypass tramite symlink. Non viene eseguita indicizzazione ricorsiva del disco e l'app non cancella documenti.

## Token

Il token dispositivo viene cifrato con `safeStorage`. Se la cifratura del sistema operativo non è disponibile, il token non viene persistito. Refresh token in chiaro e chiavi hardcoded sono vietati.

## Livelli di rischio

- Livello 1: lettura autorizzata, parsing e preview locale.
- Livello 2: upload e creazione di task/clienti/preventivi in bozza, sempre con conferma.
- Livello 3: shell, pagamenti, email, cancellazioni e automazioni desktop sono bloccati.

## Audit e privacy

Il log JSONL contiene eventi e metadati minimi, mai contenuto completo o token. Configurazione, token, coda e audit possono essere cancellati dall'utente senza eliminare i documenti della workspace.

## Threat model iniziale

Rischi principali: renderer compromesso, file malevoli, token sottratto, traversal, replay e backend revocato. Mitigazioni: sandbox, IPC ristretto, limiti 25/50 MB, canonicalizzazione, storage OS, idempotenza, timeout, revoca e log security.
