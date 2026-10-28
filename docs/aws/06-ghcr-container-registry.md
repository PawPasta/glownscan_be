# AWS Setup 06 --- GitHub Container Registry (GHCR)

## Purpose

GitHub Actions builds the backend image and pushes it to GitHub
Container Registry. EC2 pulls the image during deployment.

Image format:

``` text
ghcr.io/pawpasta/glownscan_be:<git-commit-sha>
```

## Authentication

A package may be public or private. If the package is private, the EC2
Docker client must authenticate with a GitHub token that has the
required package read permission.

A typical interactive login on EC2 is:

``` bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

Set `GHCR_TOKEN` and `GHCR_USER` in the shell securely before running
this command; do not put real tokens directly into shell history. Use a
token with minimum necessary access, normally package read access for
pulling.

If using `sudo docker`, authentication may be stored under root's Docker
config. If using `docker` as `ubuntu`, it is stored for that user. Be
consistent with the user that runs deployment commands. In the current
setup, deployment commands run as `ubuntu`.

After login, verify without printing credentials:

``` bash
docker pull ghcr.io/pawpasta/glownscan_be:YOUR_COMMIT_SHA
```

Replace `YOUR_COMMIT_SHA` with an actual image tag that exists.

## GitHub Actions image publishing

The workflow should:

1.  Run CI checks.
2.  Build the Docker image.
3.  Authenticate to GHCR using GitHub Actions credentials.
4.  Push an immutable image tagged with the commit SHA.
5.  Deploy that exact tag to EC2.

Use GitHub's built-in `GITHUB_TOKEN` where package permissions and
repository configuration allow it. If a personal access token is
required, store it as a GitHub Secret and grant only the required
permissions.

## Troubleshooting

### `denied: permission_denied` or `unauthorized`

-   Check that the package exists and the image name is correct.
-   Check package visibility and access permissions.
-   Check token expiry and package scopes.
-   Confirm the login is performed as the same OS user that runs
    `docker pull`.

### Pull succeeds but deployment fails

The image can be downloaded successfully while container startup fails
for unrelated reasons, such as missing `.env`, wrong permissions, port
conflicts, or application startup/database failures. Read the SSM
command output and container logs.
