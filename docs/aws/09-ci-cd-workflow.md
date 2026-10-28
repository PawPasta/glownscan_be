# AWS Setup 09 --- GitHub Actions CI/CD

## Goal

On pushes to `main`, the pipeline should validate the NestJS backend,
build and publish a container image, and deploy the exact commit to EC2
using SSM.

The current setup was tested far enough to pull an image through SSM and
start the container. Always compare this guide with the workflow files
currently in `.github/workflows/`; the repository workflow is the source
of truth.

## Intended pipeline

1.  **CI:** lint, tests, and build.
2.  **Build and publish:** build a Docker image and push it to GHCR
    using the commit SHA as tag.
3.  **Deploy:** configure AWS credentials, send a command using SSM, and
    wait for command completion.
4.  **Verify:** check deployment/health status and preserve logs on
    failure.

The workflow should deploy only from `main` unless a deliberate release
process says otherwise. A test workflow with `workflow_dispatch` can be
run manually from a feature branch to validate AWS access without
deploying.

## Immutable image tags

Use a tag derived from the commit SHA, for example:

``` text
ghcr.io/pawpasta/glownscan_be:a1e919c11a3e271a4e15c0f358f7275e6f52b780
```

This makes it possible to identify the exact code version running on EC2
and to roll back to a previously known image.

## Deployment behavior

The deployment script should:

1.  Run as the intended deployment user (currently `ubuntu`).
2.  Pull the exact image tag.
3.  Record the currently deployed image for rollback.
4.  Stop/remove or replace `glownscan-api` in a controlled way.
5.  Start the new container with `--env-file /opt/glownscan/.env`.
6.  Bind host port only to loopback, e.g. `127.0.0.1:3000:3000`.
7.  Check `/health/database`.
8.  If the new container fails, capture logs and attempt to restore the
    previous image.

Do not paste a deployment script into production without checking
quoting, image substitution, command exit behavior, and rollback paths.
Base64-encoding a script can help transport it through SSM, but the
script still needs to be decoded and validated correctly on the host.

## SSM command permissions

The GitHub Actions IAM user needs permission to send
`AWS-RunShellScript` to the intended EC2 instance and read command
status/output. See `07-iam-and-ssm.md`.

The EC2 node must be Online in SSM before deployment. The workflow
should fail clearly if no managed node is found.

## Manual AWS access test

A test workflow with:

``` yaml
on:
  workflow_dispatch:
```

can be run from GitHub Actions to validate `sts get-caller-identity` and
SSM status without changing the application. Keep this separate from the
deploy workflow.

## Operational safeguards

-   Require CI success before deployment.
-   Limit production deployment to `main`.
-   Use environment protection/review if the team needs approval before
    production deployment.
-   Do not print `.env`, access keys, registry tokens, or database URLs
    in logs.
-   Keep deployment logs and command IDs for troubleshooting.
-   Avoid overlapping deployments; use GitHub Actions concurrency where
    appropriate.
-   Do not delete the prior image until the rollback window has passed.

## Troubleshooting checklist

### `Input required and not supplied: aws-region`

The workflow reads a missing variable. Create `AWS_REGION` under
repository Variables or set `aws-region: ap-southeast-2` directly.

### `AccessDenied` for SSM

Check the IAM policy is attached to `GlownScanGitHubActions`, the
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

``` bash
sudo docker ps --filter "name=glownscan-api"
curl -i http://127.0.0.1:3000/health/database
```

Expected container port mapping:

``` text
127.0.0.1:3000->3000/tcp
```
