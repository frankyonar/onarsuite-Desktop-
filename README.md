# Max Desktop per OnarSuite

Versione 0.2.0 di un agente desktop locale e controllato per OnarSuite. L'app usa Electron, React e TypeScript e permette di parlare con Max, collegare un dispositivo, autorizzare cartelle, lavorare nella OnarSuite Workspace, analizzare documenti localmente e inviare azioni esplicite a OnarSuite.

## Avvio

Requisiti: Node.js 22+, npm 10+.

```powershell
npm install
npm run dev
```

Verifiche:

```powershell
npm run typecheck
npm test
npm run build
npm --workspace @onarsuite/max-desktop run dist:win
```

Il download del binario Electron richiede una catena TLS valida. In reti aziendali configurare la CA tramite `NODE_EXTRA_CA_CERTS`; non disabilitare la verifica TLS.

## Stato MVP

Implementati: avvio recuperabile con errori visibili, chat Max tramite `/api/max/desktop/chat`, UI desktop, pairing, heartbeat, workspace, cartelle autorizzate, parsing PDF/DOCX/XLSX/CSV/TXT/MD, upload, azioni bozza, audit locale, coda offline, retry e idempotenza.

Il backend Agent Gateway non è ancora presente nel repository OnarSuite. Finché gli endpoint documentati non vengono aggiunti, pairing e azioni remote restituiscono un errore esplicito.

Vedi [docs/agent/desktop-agent.md](docs/agent/desktop-agent.md) per dettagli operativi.
