# Max Desktop

Applicazione Electron di Max Desktop: un agente autonomo, stile Claude Code, per OnarSuite.

## Agente autonomo

Max esegue un loop tool-use locale. L'inferenza gira su OnarSuite (OpenRouter/Claude via
`/api/max/desktop/agent`); l'esecuzione degli strumenti è **locale** nel processo main:

- `read_file`, `list_dir`, `search_files` — lettura ed esplorazione (estrae testo da PDF/DOCX/XLSX).
- `write_file`, `edit_file`, `create_file`, `delete_file` — scrittura/modifica/creazione/eliminazione.
- `run_shell` — comandi (npm, git, …) con cwd dentro una cartella autorizzata.
- `onar_action` — upload e creazione di task/cliente/preventivo in bozza su OnarSuite.

La UI è una console in stile Claude Code: trascrizione con **tool-call card** (comando, stato,
diff/output espandibile) più un esploratore file con editor. Estetica Apple "Liquid Glass"
allineata ai token di OnarSuite.

## Sicurezza

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Renderer limitato a un bridge IPC tipizzato.
- Token cifrato con Electron `safeStorage`; se non disponibile non viene persistito.
- **Ogni** percorso e cwd dello shell è confinato alla workspace e alle cartelle autorizzate
  (`path-policy`): fuori dall'allowlist Max è bloccato.
- Modalità autonoma: Max agisce senza conferma, ma **ogni** azione (lettura, scrittura, modifica,
  eliminazione, shell) è registrata nell'audit log locale.

## Script

```powershell
npm run dev
npm run typecheck
npm test
npm run build
```

## Aggiornamenti

- L'app usa `electron-updater` con pubblicazione su GitHub Releases.
- Quando esce una nuova release, compare un banner con il pulsante per scaricarla e riavviare
  l'app in modo controllato.
- Per ridurre i falsi positivi di SmartScreen/antivirus, firma il binario Windows con un
  certificato di code signing prima della distribuzione pubblica.
