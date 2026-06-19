# Max Desktop

Applicazione Electron dell'MVP Max Desktop.

## Sicurezza

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Renderer limitato a un bridge IPC tipizzato.
- Token cifrato con Electron `safeStorage`; se non disponibile non viene persistito.
- Accesso file verificato nel processo main rispetto alla workspace e alle cartelle autorizzate.
- Nessuna cancellazione documenti, automazione desktop o shell libera.
- Upload e creazione di bozze richiedono conferma esplicita.

## Script

```powershell
npm run dev
npm run typecheck
npm test
npm run build
```
