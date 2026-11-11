# Test strategy

- `test/**/*.spec.ts`: deterministic unit and module-wiring tests. External
  providers and persistence ports are mocked at their boundary.
- `test/**/*.e2e-spec.ts`: HTTP tests started through `AppModule`. CI runs them
  against the disposable PostgreSQL service declared in the workflow after the
  schema has been migrated.
- Database behaviour that depends on PostgreSQL locking, transactions, or
  uniqueness belongs in a `*.integration-spec.ts` file and must use the CI
  PostgreSQL service. Do not describe a mocked port test as integration
  coverage.

The CI quality gate checks formatting, linting, production type checking, unit
tests, V8 coverage, schema migration, E2E tests, a high-severity production
dependency audit, secret scanning, and the production build. Branch protection
must require the `Quality gates` check before merging pull requests.
