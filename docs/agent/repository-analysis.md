# Report tecnico iniziale

Data verifica: 18 giugno 2026. Fonte applicativa: repository GitHub privato `frankyonar/onarsuite`, branch `master`.

## Stack rilevato

- Backend: PHP 8.2, Laravel 12, Eloquent.
- Frontend: React 18, TypeScript, Inertia 2, Vite 5, Tailwind CSS 3.
- Auth web: sessioni Laravel e verifica email.
- Auth API: Laravel Sanctum.
- Ruoli e permessi: Spatie Laravel Permission.
- Database: configurazioni SQLite, MySQL/MariaDB, PostgreSQL e SQL Server; produzione da confermare.
- Storage: filesystem locale e S3 configurabili.
- Test: PHPUnit 12.

## Collocazione Agent Gateway

Seguendo le convenzioni esistenti: modelli `app/Models/Agent*`, servizi `app/Services/Agent`, controller `app/Http/Controllers/Api/Agent`, migrazioni `database/migrations`, route in `routes/api.php` e UI Inertia in `resources/js/pages/AgentDevices`.

## Rischi tecnici

Il login API attuale elimina tutti i token Sanctum dell'utente; non è compatibile con più device e deve essere separato dal pairing. La tenancy usa prevalentemente `creator_id`/`created_by` e richiede policy dedicate. Il backend Agent Gateway non risulta ancora implementato.

## Decisione MVP

Max Desktop viene sviluppato in questo repository separato con Electron, React e TypeScript. L'integrazione cloud userà gli endpoint descritti in `api.md` quando saranno implementati su OnarSuite.
