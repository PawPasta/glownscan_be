# Codex Delivery Workflow — NestJS Backend

## 1. Mandatory Rules

These instructions apply to **every code change** in this NestJS repository, including features, bug fixes, refactoring, tests, database changes, configuration, and CI updates.

**Core principle: Never commit or push unverified code.**

Codex MUST:

- Inspect the existing implementation, tests, and repository conventions before making changes.
- Follow the established NestJS architecture and dependency injection patterns.
- Make the smallest reasonable change that satisfies the request.
- Write or update focused tests alongside production changes.
- Preserve existing API contracts unless a breaking change is explicitly requested.
- Run all required quality gates in the specified order.
- Inspect Git changes before committing.
- Never bypass failed checks or claim unexecuted checks passed.
- Preserve unrelated user changes.

If any mandatory step cannot be completed, report the blocker clearly.

## 2. Before Writing Code

Before modifying files:

1. Read the relevant modules, controllers, services, DTOs, entities, repositories, and tests.
2. Inspect `package.json` to identify the package manager and available scripts.
3. Identify affected API contracts, business rules, validation, authorization, and error handling.
4. Inspect database schema and migration conventions when relevant.
5. Check `git status --short` to identify pre-existing changes.
6. Determine the smallest implementation and testing scope.
7. Read `.codex/ARCHITECTURE.md` and verify the dependency direction for every affected module.

Do not introduce unnecessary abstractions, dependencies, or unrelated refactoring.

Follow existing naming conventions, folder structures, and architectural patterns.

## 3. NestJS Architecture Rules

All modules MUST follow the Hexagonal Architecture boundaries in `.codex/ARCHITECTURE.md`. In particular, application/domain code must not depend on database clients, SQL, infrastructure adapters, provider SDKs, or framework configuration. Persistence and provider access must be expressed as application ports and implemented by infrastructure adapters, wired in the NestJS module.

### Controllers

Controllers MUST:

- Handle HTTP transport concerns only.
- Validate incoming requests through established DTO and pipe mechanisms.
- Delegate business logic to services.
- Use appropriate HTTP status codes.
- Preserve established response contracts.
- Apply authentication and authorization guards where required.

Do not place business logic or direct database operations inside controllers unless explicitly required by the existing architecture.

### Services

Services MUST:

- Encapsulate business logic.
- Use dependency injection.
- Handle business errors consistently.
- Keep operations focused and testable.
- Avoid unnecessary coupling between modules.
- Preserve transactional consistency when multiple database operations must succeed together.

### DTOs and Validation

When changing request DTOs:

- Use the project's established validation approach.
- Validate required fields, types, ranges, and formats.
- Handle optional and nullable fields correctly.
- Validate nested objects and arrays where relevant.
- Reject unexpected or malformed input according to the existing API contract.
- Update API documentation when the contract changes.

Never rely exclusively on TypeScript types for runtime validation.

### Error Handling

- Use appropriate NestJS HTTP exceptions or established domain exceptions.
- Preserve existing error response formats.
- Do not silently swallow exceptions.
- Avoid exposing stack traces, credentials, or sensitive internal details to clients.
- Distinguish expected business errors from unexpected system failures.
- Preserve useful diagnostic information through established logging mechanisms.

### Authentication and Authorization

For protected functionality:

- Preserve authentication requirements.
- Enforce authorization on the server.
- Validate ownership and permissions where relevant.
- Never trust client-provided user identity or role information without server-side verification.
- Do not log access tokens, passwords, secrets, or sensitive credentials.
- Add tests for unauthorized and forbidden access where applicable.

### Database and Persistence

When changing database behavior:

- Follow the existing ORM or query-builder conventions.
- Preserve data integrity and relational constraints.
- Avoid unnecessary queries and obvious N+1 patterns.
- Use transactions when atomicity is required.
- Do not introduce destructive schema changes without explicit authorization.
- Follow existing migration conventions.
- Keep migrations and schema definitions consistent.

Never run destructive database commands against shared, staging, or production environments without explicit authorization.

## 4. Implementation and Testing

Every behavior-changing implementation MUST include appropriate test coverage.

Where relevant, tests MUST cover:

- Controller request and response contracts.
- Service business logic.
- Successful execution paths.
- DTO validation and malformed inputs.
- Authentication and authorization.
- State transitions and edge cases.
- Database interactions and transaction failures.
- Expected exceptions and error responses.
- Regression scenarios for fixed bugs.

### Unit Tests

- Use the project's existing Jest or equivalent testing setup.
- Mock external dependencies at appropriate boundaries.
- Verify meaningful behavior and interactions.
- Keep tests deterministic and independent.
- Avoid unnecessary implementation-detail assertions.

### Integration and E2E Tests

Add or update integration/E2E tests when changes affect:

- HTTP routes or status codes.
- Request validation.
- Authentication and authorization.
- Database persistence.
- Serialization and response structure.
- Cross-module behavior.

Use isolated test infrastructure and test data.

Do not access production services or databases during tests.

### Testing Restrictions

Never:

- Delete or disable tests merely to make checks pass.
- Replace meaningful assertions with superficial checks.
- Use `.skip` or `.only` to hide failing tests.
- Change test expectations solely to match incorrect behavior.
- Claim that a mocked test verifies real database integration.

For changes that do not require new tests, explain why in the final report.

## 5. Required Quality Gates

After implementation, Codex MUST execute the following checks **sequentially and in this exact order**.

Use the package manager and scripts defined by the repository.

The commands below assume npm and conventional NestJS scripts.

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run lint -- --no-fix
npx tsc --noEmit --project tsconfig.build.json
npm run test -- --runInBand
npm run test:cov -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

### Repository Compatibility

Before execution:

1. Inspect `package.json` and TypeScript configuration.
2. Use equivalent existing scripts when their behavior matches the required checks.
3. Use the repository's package manager (npm, pnpm, or yarn).
4. Confirm that the lint command does not silently modify files.
5. Confirm that the type-check command covers the intended production code.
6. Confirm that the E2E command uses an isolated test environment.

If a required check is not configured, report it as BLOCKED or NOT CONFIGURED.

Do not silently skip or substitute a weaker check.

### Execution Requirements

1. Run each gate and inspect its exit code.
2. A gate passes only when its exit code is `0`.
3. Stop if a gate fails.
4. Fix code-related failures.
5. Restart verification from the first gate after code changes.
6. Do not treat a partial test run as equivalent to the full required suite.
7. Never report an unexecuted check as passed.

All applicable mandatory gates MUST pass before committing or pushing.

### Formatting

If formatting fails:

1. Format only relevant files using the repository's configured formatter.
2. Review resulting changes.
3. Restart all quality gates from the beginning.

Never format unrelated user files unnecessarily.

### Environment Failures

If verification fails because of missing dependencies, unavailable databases, network restrictions, permissions, or infrastructure:

- Report the failing command.
- Include the relevant error.
- Distinguish environment failures from code failures.
- Mark verification as BLOCKED.
- Do not commit or push.
- Wait for user direction when the blocker cannot be safely resolved.

## 6. API Contract Protection

When modifying an API endpoint, verify:

- HTTP method and route.
- Request parameters, query, and body.
- Required and optional fields.
- Validation rules.
- Response status codes.
- Response body structure.
- Authentication and authorization requirements.
- Error response behavior.
- Backward compatibility.

Breaking API changes require explicit authorization.

Update OpenAPI/Swagger documentation when applicable.

Add or update contract tests for changed behavior.

## 7. Database Migration Safety

When schema changes are required:

1. Inspect existing migration and ORM conventions.
2. Create the appropriate migration.
3. Verify schema and application compatibility.
4. Consider existing data and backward compatibility.
5. Add relevant migration or persistence tests where supported.
6. Document any required deployment ordering.

Never:

- Drop tables or columns without authorization.
- Reset a shared database.
- Run destructive seed scripts against real environments.
- Modify previously deployed migrations without explicit authorization.
- Assume a migration succeeded without verification.

If migration verification requires unavailable infrastructure, report the limitation.

## 8. Git Verification

After all quality gates pass, run:

```bash
git diff --check
git status --short
git diff --stat
git diff
```

Codex MUST:

- Ensure `git diff --check` passes.
- Inspect all modified files.
- Verify changes belong to the current task.
- Preserve unrelated user changes.
- Check for accidental secrets and debugging code.
- Avoid staging generated artifacts such as `dist/`, `coverage/`, and temporary files unless explicitly required.

If code changes after verification, rerun all quality gates.

## 9. Commit Policy

Commits MUST be single-purpose and follow:

```text
<action>: <short imperative message>
```

Examples:

```text
feat: add order creation endpoint
fix: handle expired refresh tokens
refactor: simplify user permission checks
test: cover invalid payment requests
docs: document authentication errors
```

Before committing:

1. Confirm all required gates passed.
2. Confirm Git diff verification passed.
3. Stage only task-related files using explicit paths.
4. Run `git diff --cached --check`.
5. Review `git diff --cached`.
6. Confirm no unrelated changes are staged.

Do not use `git add .` or `git add -A` when unrelated changes exist.

**Passing verification does not automatically authorize a commit.**

Commit only when explicitly requested or already authorized.

## 10. Push and CI Policy

Never push to `origin` unless:

- All mandatory local quality gates passed.
- Git verification passed.
- The commit contains only intended changes.
- The user explicitly authorized the push.

Never use `--no-verify`, force-push, or bypass branch protection to work around failures.

Local verification does not replace CI verification.

Do not claim CI or deployment success without verifying actual results.

## 11. Failure Handling

When any mandatory step fails:

1. Stop the delivery process.
2. Identify the failing command.
3. Determine whether the failure is caused by code or environment.
4. Fix code-related failures within scope.
5. Restart quality gates after changes.
6. Report unresolved blockers.

Never hide, ignore, or misrepresent failures.

## 12. Final Delivery Report

After every code task, provide a concise report.

### Changes

Summarize implemented behavior and modified files.

### Tests

Describe added or updated tests.

### Verification

| Quality gate          | Status                          |
| --------------------- | ------------------------------- |
| Prettier              | PASS / FAIL / BLOCKED / NOT RUN |
| ESLint                | PASS / FAIL / BLOCKED / NOT RUN |
| TypeScript type check | PASS / FAIL / BLOCKED / NOT RUN |
| Unit tests            | PASS / FAIL / BLOCKED / NOT RUN |
| Test coverage         | PASS / FAIL / BLOCKED / NOT RUN |
| E2E tests             | PASS / FAIL / BLOCKED / NOT RUN |
| Production build      | PASS / FAIL / BLOCKED / NOT RUN |
| Git diff check        | PASS / FAIL / NOT RUN           |

Only report actual execution results.

### Git

Report commit and push status, including commit hash when applicable.

### Blockers

Describe unresolved failures or environment limitations.

## 13. Definition of Done

A task is ready for delivery only when:

- [ ] Requested functionality is implemented.
- [ ] NestJS architecture conventions are followed.
- [ ] Relevant tests are added or updated.
- [ ] API contracts remain compatible unless explicitly changed.
- [ ] Validation and error handling are verified.
- [ ] Authentication and authorization are verified where relevant.
- [ ] Database changes are reviewed and verified where relevant.
- [ ] Formatting passes.
- [ ] Linting passes.
- [ ] Type checking passes.
- [ ] Unit tests pass.
- [ ] Coverage verification passes.
- [ ] E2E tests pass.
- [ ] Production build passes.
- [ ] Git diff verification passes.
- [ ] Unrelated user changes remain untouched.
- [ ] Final verification results are reported accurately.

If any mandatory requirement remains incomplete, mark the task as **BLOCKED** or **INCOMPLETE**, not DONE.

**Final rule: Correctness, security, and verified behavior take priority over delivery speed.**
