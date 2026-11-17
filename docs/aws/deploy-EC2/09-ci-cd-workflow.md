# AWS Setup 09 --- GitHub Actions CI/CD

## Goal

The workflow validates the NestJS backend on pushes and pull requests
targeting `main`. A push to `main` that contains any non-documentation or
non-test change also builds and publishes a container image, then deploys
that exact commit to EC2 using SSM.

Always compare this guide with `.github/workflows/deploy.yml`; the workflow
is the source of truth if implementation details change.

## Intended pipeline

1.  **CI:** install dependencies, format-check, lint, typecheck, run unit
    tests and coverage gates, apply the test database schema, run E2E tests,
    audit production dependencies, scan committed secrets, and build on every
    push/PR targeting `main` and every manual dispatch.
2.  **Change classification:** on pushes to `main`, compare the pushed commit
    with the previous commit. The image build is skipped only when every
    changed path is documentation or a test.
3.  **Build and publish:** if change classification requires deployment,
    build a Docker image and push both `latest` and the commit SHA tag to
    GHCR.
4.  **Deploy:** only after CI succeeds and an image is published, configure AWS
    credentials, send a command using SSM, and wait for command
    completion.
5.  **Verify:** check deployment/health status and preserve logs on
    failure.

### When deployment is skipped

The workflow skips image build and EC2 deployment only if **all** changed
files match one of these documentation/test categories:

- Files under `docs/`, `test/`, or `tests/`.
- Markdown files (`*.md`) anywhere in the repository.
- TypeScript test files (`*.spec.ts`, `*.e2e-spec.ts`, or `*.test.ts`).

If even one changed file is outside those categories—for example a source
file, migration, Dockerfile, package manifest, workflow, or configuration—the
workflow builds and deploys. If the previous commit cannot be resolved, the
workflow deploys as a safe fallback instead of incorrectly skipping.

CI still runs for documentation/test-only changes. Pull requests run CI only;
they do not build/publish images or deploy. `workflow_dispatch` also runs CI
only; production build/deploy is restricted to pushes on `main`.

Production deployment is restricted to pushes on `main`. Manual dispatch is
useful for rerunning CI, but does not validate AWS access or deploy.

## Immutable image tags

Use a tag derived from the commit SHA, for example:

```text
ghcr.io/pawpasta/glownscan_be:a1e919c11a3e271a4e15c0f358f7275e6f52b780
```

This makes it possible to identify the exact code version running on EC2
and to roll back to a previously known image.

## Deployment behavior

The current deployment script does the following:

1. Runs as the intended deployment user (currently `ubuntu`).
2. Pulls the exact image tag.
3. Records the currently deployed image for rollback.
4. Runs forward-only database migrations.
5. Stops/removes `glownscan-api` and starts the new container with
   `--env-file /opt/glownscan/.env`.
6. Bind host port only to loopback, e.g. `127.0.0.1:3000:3000`.
7. Checks `/health/database`.
8. If startup or health validation fails, captures logs and attempts to
   restore the previous image.

The script is transported as base64 through SSM and executes Docker commands
as `ubuntu`. If startup or the database health check fails, it restores the
previous image; it does not roll back database schema changes. Schema changes
must therefore remain compatible with the previous application version.

## SSM command permissions

The GitHub Actions IAM user `GlownScanGitHubActions` needs permission to send
`AWS-RunShellScript` to the intended EC2 instance and read command
status/output. See `07-iam-and-ssm.md`.

The EC2 node must be Online in SSM before deployment. The workflow checks
this before sending the deployment command. AWS credentials are obtained from
the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` repository secrets; see
`08-github-actions-secrets.md`.

## Operational safeguards

- Require CI success before deployment.
- Limit production deployment to `main`.
- Use environment protection/review if the team needs approval before
  production deployment.
- Do not print `.env`, access keys, registry tokens, or database URLs
  in logs.
- Keep deployment logs and command IDs for troubleshooting.
- Avoid overlapping deployments; use GitHub Actions concurrency where
  appropriate.
- Do not delete the prior image until the rollback window has passed.

## Troubleshooting checklist

### `Credentials could not be loaded` / `Could not load credentials from any providers`

Confirm both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are present as
repository **Secrets** and are available to this workflow. The key must be
active and belong to `GlownScanGitHubActions`. Do not print either value.

The AWS region is fixed to `ap-southeast-2` in the workflow, so no
`AWS_REGION` variable is needed.

### `InvalidClientTokenId` or `SignatureDoesNotMatch`

Check that the access key is active and that the secret key matches it. If the
secret key was lost, create a replacement key in IAM and update the GitHub
secret; AWS does not reveal an existing secret again.

### `AccessDenied` for SSM

Check `GlownScanGitHubSSMDeployPolicy` is attached to
`GlownScanGitHubActions`, the
account/region/instance ARN are correct, and the action/resource
permissions match the actual workflow.

### SSM status is `Failed`

Read the `stdout` and `stderr` returned by `GetCommandInvocation`.
Common causes include GHCR access, missing `.env`, permissions, port
conflicts, and application/database startup errors.

### `--env-file: permission denied`

The Docker CLI user cannot read `/opt/glownscan/.env`. For the current
deployment model, use ownership `ubuntu:ubuntu` and mode `600`, with
deployment commands executed as `ubuntu`.

### Container starts but health check fails

Inspect `sudo docker logs --tail 200 glownscan-api`, confirm required
environment variables exist without printing their values, and check
database connectivity.

## First successful deployment verification

On EC2:

```bash
sudo docker ps --filter "name=glownscan-api"
curl -i http://127.0.0.1:3000/health/database
```

Expected container port mapping:

```text
127.0.0.1:3000->3000/tcp
```
