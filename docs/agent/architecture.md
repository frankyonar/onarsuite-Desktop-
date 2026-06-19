# Architettura Max Desktop

## Visione

Max Desktop è il ponte locale tra i documenti autorizzati dall'utente e OnarSuite Cloud. Il client apre esclusivamente connessioni HTTPS outbound; non espone porte pubbliche.

## Componenti

1. **Renderer React**: pairing, stato, workspace, cartelle, audit e conferme.
2. **Preload**: bridge IPC ristretto e tipizzato; nessuna API Node generica.
3. **Processo Electron main**: policy filesystem, dialog di sistema, parsing, token sicuro, coda e API client.
4. **OnarSuite Agent SDK interno**: pairing, heartbeat, eventi, artifact e azioni da file.
5. **OnarSuite Agent Gateway**: backend Laravel 12 da implementare nel repository OnarSuite.

## Flussi

Da Max Desktop a OnarSuite: l'utente seleziona un file, il main verifica il percorso, mostra una preview locale, richiede conferma e invia tramite HTTPS. Se la rete non è disponibile, l'azione viene accodata con una chiave di idempotenza stabile.

Da OnarSuite a Max Desktop: nell'MVP è predisposto il polling tramite sincronizzazione periodica. L'esecuzione remota dei comandi sarà aggiunta dopo gli endpoint backend e manterrà conferma locale per il livello di rischio 2.

## Limiti MVP

Nessuna shell, controllo mouse/tastiera, automazione browser, cancellazione file, invio email, pagamento o modifica di dati sensibili. Il parser non esegue modelli AI locali: prepara testo e metadati per le API Max future.
