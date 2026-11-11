# ADR 0003: Expand/contract migrations and deployment rollback

Migrations are forward-only. Deployments first apply additive, backwards-compatible
schema changes, then ship compatible application code. Destructive contract work
is a later release after old application versions are retired.

Application rollback restores the prior image only; it never attempts a schema
rollback automatically. This avoids data loss when a newer application has
written fields unknown to the old version.

GitHub Actions should use OIDC to assume a least-privilege AWS role. Repository
variables supply the role ARN and deployment target; no long-lived AWS access key
is stored in GitHub secrets.
