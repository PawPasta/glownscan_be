# Hexagonal Architecture Rules

These rules apply to every module and every new or modified feature. The `auth` module is a useful reference for ports/adapters and dependency-injection tokens, but its conventions do not override the stricter boundaries below.

## Dependency direction

Dependencies point inward:

```text
presentation -> application -> domain
infrastructure -> application ports / domain
module -> wires all layers
```

- `domain/` contains business concepts, invariants, and domain policies. It must not import NestJS, PostgreSQL, HTTP, queues, cloud SDKs, or infrastructure.
- `application/` contains use cases and ports. It coordinates domain behavior and depends only on domain types and application-owned port interfaces. It must not execute SQL or know which provider implements a port.
- `infrastructure/` implements ports: PostgreSQL repositories/adapters, provider SDK clients, queue adapters, email/push delivery, and configuration adapters.
- `presentation/` translates HTTP requests/responses and delegates to application use cases. It must not access persistence or provider SDKs.
- `*.module.ts` is the composition root: import infrastructure modules and bind application port tokens to adapter implementations.

## Persistence boundary

- Define persistence ports beside the use case in `application/ports/` (or `application/port/` if that module already uses the singular convention). Name ports after the business capability, not the database technology.
- Put SQL, `DatabaseService`, `Pool`, `PoolClient`, row mapping, and transaction handling exclusively in `infrastructure/adapters/` or `infrastructure/persistence/`.
- A port exposes business-oriented operations and typed records. Never leak SQL, table names, `pg` types, `PoolClient`, or generic `query()` into application/domain.
- A transaction that must atomically update multiple records is one persistence-port operation implemented transactionally by its adapter. Do not pass a database client or transaction callback through application code.
- Keep business decisions (eligibility, state transitions, policy, input semantics) in domain/application. Adapters enforce persistence constraints and return typed outcomes; application maps those outcomes to the existing API errors.
- Keep ownership and authorization decisions in application/domain, backed by user-scoped repository queries where possible. Never trust an ID supplied by a caller without checking ownership.

## External providers and configuration

- Define application ports for provider capabilities (email, push, AI, payment verification, QR generation, object storage). Provider SDKs and HTTP clients belong in infrastructure adapters.
- Application and domain code must not import infrastructure classes or `ConfigService`. Supply validated settings through a settings port/token or construct provider adapters in the composition root.
- Pure deterministic mapping/validation can live in domain/application; cryptographic/provider-specific implementation belongs in infrastructure unless it is explicitly a domain policy.
- Cross-module calls should target an exported application use case/port, never another module's infrastructure adapter or database tables.

## NestJS wiring and naming

- Use explicit symbol tokens for application ports and bind them in the owning module with `useExisting`/`useClass`.
- Keep concrete infrastructure classes out of application constructors. Constructor parameters should be application ports or domain services.
- Organize consistently by module: `domain/`, `application/{use-case,ports,types}/`, `infrastructure/{adapters,persistence}/`, and `presentation/`. Avoid creating layers/files that have no meaningful boundary.

## Refactoring existing modules

For each module, inventory imports and move one capability at a time:

1. Identify the use case, domain rules, persistence operations, and provider calls.
2. Define typed application ports for persistence/provider capabilities.
3. Move SQL/transactions/provider SDK code into infrastructure adapters without changing behavior or API contracts.
4. Bind ports in the Nest module and remove direct infrastructure dependencies from application.
5. Preserve validation, authorization, transaction atomicity, and error mapping; add focused tests for changed boundaries.
6. Check dependency direction with searches for `DatabaseService`, `PoolClient`, SQL, `ConfigService`, SDK imports, and `infrastructure` imports under `application/` and `domain/`.

Do not perform a broad mechanical rewrite that obscures behavior. Complete the migration module by module and record any intentional exception here with rationale and a follow-up task.

## Expected module layout

```text
src/modules/<module>/
  domain/
  application/
    ports/
    use-case/
    types/
  infrastructure/
    adapters/
    persistence/
  presentation/
  <module>.module.ts
```
