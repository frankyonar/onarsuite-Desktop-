# OnarSuite Desktop - Max e Magic Panel

Versione 0.9.28 del guscio operativo AI-first di OnarSuite. La chat con Max è il punto di ingresso: Max può rispondere, leggere file autorizzati, aprire OnarSuite nel dock autenticato, mostrare output o raccogliere e confermare dati con form dinamici nel Magic Panel.

## Avvio e verifica

Requisiti: Node.js 22+, npm 10+.

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Installer Windows:

```powershell
cd apps/desktop-agent
$env:NODE_OPTIONS='--use-system-ca'
npx electron-builder --win nsis --x64
```

## Esperienza prodotto

- Chat first: l’utente descrive l’obiettivo senza dover conoscere il modulo.
- Magic Panel: dock laterale per form, conferme, output, tabelle, file, attività e webview autenticata.
- Action Catalog: il backend può fornire `/api/assistant/actions/catalog`; se non è disponibile, il desktop usa un fallback locale versionato.
- Skills di Max: CRM, utenti, preventivi, contratti, promemoria e calendario sono capacità operative, non un menu ERP da navigare.
- Sicurezza: file confinati a workspace e cartelle autorizzate; token protetti con `safeStorage`; azioni backend e modifiche locali registrate in audit.

## Gateway OnarSuite

Il desktop usa pairing, heartbeat, chat/agente, action execution, assistant actions, catalogo e artifact upload. Permessi, piano, scope e device token devono essere verificati dal backend, che resta la fonte di verità.

Vedi [docs/agent/desktop-agent.md](docs/agent/desktop-agent.md) e [docs/agent/api.md](docs/agent/api.md).
