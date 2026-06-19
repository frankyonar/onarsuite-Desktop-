# Database OnarSuite Agent Gateway

Il backend reale usa Laravel 12 ed Eloquent. Le migrazioni dovranno creare `agent_devices`, `agent_device_tokens`, `agent_commands`, `agent_runs`, `agent_events`, `agent_artifacts` e, se utile, `agent_permissions`.

## Relazioni

- Un utente/tenant possiede molti device.
- Un device possiede token, comandi, run, eventi e artifact.
- Un comando possiede molti run ed eventi.
- Un run può produrre eventi e artifact.

## Indici minimi

- UUID univoco su device, comandi e artifact.
- `(user_id, status)` e `(device_id, status)`.
- `(device_id, last_seen_at)`.
- `(command_id, created_at)` per run/eventi.
- chiave di idempotenza univoca per device e operazione.

## Privacy

I token sono memorizzati esclusivamente come hash. Payload ed eventi non devono contenere token o contenuto completo dei file. L'isolamento tenant deve seguire il modello OnarSuite `creator_id`/`created_by` dopo una verifica dedicata delle policy esistenti.
