# ADR 0001: Modular Monolith and node-postgres

## Status

Accepted.

## Decision

GlowScan is a modular NestJS monolith. Modules expose application ports and keep
PostgreSQL queries in infrastructure adapters. We use `pg`, rather than an ORM.

## Rationale

Analysis quota reservation, idempotency, refresh-token rotation and the outbox
need explicit transactions, row locks and PostgreSQL-specific SQL. `pg` makes
those boundaries visible without hiding query plans or lock behaviour behind an
ORM. A modular monolith keeps deployment and observability simple while the
product is one API and one primary database.

## Consequences

Adapters own SQL and must have integration coverage against PostgreSQL. Modules
must not import another module's infrastructure adapter. Extract a service only
when it has an independent deployment, data ownership, or scaling boundary.
