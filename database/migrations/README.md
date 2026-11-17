# Database schema initialization order

These numbered SQL files define the resettable GlowScan schema baseline. The
sequence follows module ownership and foreign-key/runtime dependencies; keep
each module's schema together and place seed data immediately after its schema.

| Version | Module / capability         | Dependency reason                                                           |
| ------- | --------------------------- | --------------------------------------------------------------------------- |
| V001    | Auth core                   | Creates users, roles, devices, refresh tokens, and shared auth tables.      |
| V002    | Auth sessions               | Uses auth users/devices; creates bounded refresh-session storage.           |
| V003    | Auth reference data         | Seeds roles and permissions after their tables exist.                       |
| V004    | API rate limits             | Shared infrastructure storage; follows auth and precedes protected modules. |
| V005    | Cloudinary upload intents   | Upload intents belong to auth users.                                        |
| V006    | Catalog                     | Product, ingredient, concern, and affiliate-link schema.                    |
| V007    | Catalog demo data           | Seeds demo rows after catalog tables exist.                                 |
| V008    | Skin analysis               | Creates analysis sessions, results, images, consent, and outbox.            |
| V009    | Skin assessment             | Adds current assessments and uses the analysis schema's update trigger.     |
| V010    | Skin analysis quotas        | Depends on the analysis schema and stores plan/usage/reservations.          |
| V011    | Wallet and Premium payments | Uses auth users and analysis entitlements.                          |
| V012    | Payment support and audit   | References payment orders and auth administrators.                          |
| V013    | Routines and notifications  | Routines may reference analysis sessions; preferences/inbox reference auth. |
| V014    | Skin-analysis consent       | Persists acceptance against a Cloudinary upload intent before image upload. |
| V015    | Package permissions         | Adds role capabilities and maps active Premium packages to feature permissions. |

`database/migrate.js` applies files in numeric order and records each file's
version, name, and checksum. This baseline was renumbered for a clean schema
initialization. Databases that retain the prior `schema_migrations` history
must not run this reordered set; it will correctly reject mismatched history.

Do not use `npm run db:migrate:reset` on a database with data to preserve. For
an existing installation that cannot be reset, keep its migration history and
prepare a separate forward-only compatibility migration instead of applying
this baseline.

In non-production environments, `npm run db:migrate:reset` seeds the
development-only administrator from `database/seed-development-admin.js` after
the schema is rebuilt. This seed is not part of the migration files and is not
run by deployment migrations (`up`).

## Temporal column and persistence conventions

Persist instants (creation/update/expiry/acceptance/processing/payment times)
as PostgreSQL `TIMESTAMPTZ`. Application adapters must serialize JavaScript
`Date` values with `toISOString()` at the database boundary; use explicit
`::timestamptz` casts for parameters inside expressions such as `LEAST`.
Date-only business values remain PostgreSQL `DATE` (currently date of birth,
daily quota date, and routine check-in date); do not turn these calendar dates
into instants because doing so introduces timezone-dependent day shifts.
